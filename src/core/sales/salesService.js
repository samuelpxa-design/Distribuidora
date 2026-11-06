const { getDatabaseConnection } = require('../../data/connection');
const NCFManager = require('../dgii/ncfManager');
const InventoryService = require('../inventory/inventoryService');
const { hoyLocal } = require('../../config/dateUtil');

const TIPOS_PAGO_VALIDOS = ['Contado', 'Credito', 'Transferencia', 'Cheque'];
const esCredito = (t) => t === 'Credito' || t === 'Crédito';

class SalesService {
  /**
   * Registra una transacción de venta en el POS (actualiza inventario automáticamente).
   * Por defecto es una Transacción Interna sin NCF hasta que se requiera activar Facturación DGII.
   */
  static registrarVenta(ventaData) {
    const {
      tipoNCF = 'B02',
      idCliente = 1,
      rncCliente = null,
      nombreCliente = 'CLIENTE CONTADO',
      idAlmacen = 1, // 1: Almacén Principal; los vehículos se identifican por su registro en almacenes.
      idUsuario = 1,
      descuentoGlobal = 0.00,
      emitirNCFInmediato = false, // Por defecto FALSE: el POS solo gestiona transacciones rápidas
      detalles = []
    } = ventaData;
    const tipoPago = esCredito(ventaData.tipoPago) ? 'Credito' : (ventaData.tipoPago || 'Contado');

    if (!detalles || detalles.length === 0) {
      throw new Error('La venta debe contener al menos un producto.');
    }
    if (!TIPOS_PAGO_VALIDOS.includes(tipoPago)) {
      throw new Error(`Método de pago no válido: ${tipoPago}.`);
    }

    const db = getDatabaseConnection();

    // Calcular totales (todo se valida antes de tocar la base de datos)
    let subtotalGeneral = 0;
    let itbisGeneral = 0;
    const detallesCalculados = [];

    for (const item of detalles) {
      const cantidad = Number(item.cantidad);
      const precio = Number(item.precio_unitario);
      const itbisPct = (item.itbis_porcentaje !== undefined && item.itbis_porcentaje !== null) ? Number(item.itbis_porcentaje) : 0;
      if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('Cada producto debe tener una cantidad entera mayor que cero.');
      if (!Number.isFinite(precio) || precio < 0) throw new Error('El precio de cada producto debe ser un número válido.');

      const subtotalItem = cantidad * precio;
      const itbisItem = (subtotalItem * (Number.isFinite(itbisPct) ? itbisPct : 0)) / 100.0;
      const productoCosto = db.prepare(`SELECT precio_compra FROM productos WHERE id = ?`).get(item.id_producto);
      if (!productoCosto) throw new Error(`No se encontró el producto ID ${item.id_producto}.`);

      subtotalGeneral += subtotalItem;
      itbisGeneral += itbisItem;
      detallesCalculados.push({
        id_producto: item.id_producto,
        cantidad,
        precio_unitario: precio,
        costo_unitario: productoCosto.precio_compra,
        itbis_monto: itbisItem,
        subtotal: subtotalItem,
        total: subtotalItem + itbisItem
      });
    }

    const descuento = Number(descuentoGlobal) || 0;
    if (descuento < 0 || descuento > subtotalGeneral + itbisGeneral + 0.005) {
      throw new Error('El descuento no es válido.');
    }
    const totalGeneral = (subtotalGeneral + itbisGeneral) - descuento;
    const estadoPago = (tipoPago === 'Credito') ? 'Pendiente' : 'Pagado';

    db.exec('BEGIN IMMEDIATE;');
    try {
      const almacen = db.prepare(`SELECT id, tipo, activo FROM almacenes WHERE id = ?`).get(idAlmacen);
      if (!almacen || !almacen.activo) throw new Error('El almacén o vehículo de la venta no existe o está inactivo.');

      // Reglas de crédito
      let diasCredito = 30;
      if (tipoPago === 'Credito') {
        const cliente = db.prepare(`SELECT id, limite_credito, balance_pendiente, dias_credito FROM clientes WHERE id = ?`).get(idCliente);
        if (!cliente || Number(idCliente) === 1) {
          throw new Error('Para vender a crédito selecciona un cliente registrado (no el Consumidor Final).');
        }
        if (cliente.limite_credito > 0 && (cliente.balance_pendiente + totalGeneral) > cliente.limite_credito + 0.005) {
          throw new Error(`La venta excede el límite de crédito del cliente (RD$ ${cliente.limite_credito.toFixed(2)}). Balance actual: RD$ ${cliente.balance_pendiente.toFixed(2)}.`);
        }
        if (cliente.dias_credito > 0) diasCredito = cliente.dias_credito;
      }

      // NCF dentro de la transacción: si la venta falla no se consume el comprobante.
      let ncfResult = { ncf: 'SIN NCF (Ticket Interno)', tipoNCF, alertaRestantes: null };
      let estadoFiscal = 'Pendiente NCF';
      if (emitirNCFInmediato) {
        ncfResult = NCFManager.obtenerSiguienteNCF(tipoNCF);
        estadoFiscal = 'Facturada NCF';
      }

      const resVenta = db.prepare(`
        INSERT INTO ventas (
          fecha, ncf, tipo_ncf, id_cliente, rnc_cliente, nombre_cliente,
          id_usuario, id_almacen, subtotal, itbis_total, descuento,
          total, tipo_pago, estado_pago, estado_venta, estado_fiscal
        ) VALUES (datetime('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completada', ?)
      `).run(
        ncfResult.ncf, tipoNCF, idCliente, rncCliente, nombreCliente,
        idUsuario, idAlmacen, subtotalGeneral, itbisGeneral, descuento,
        totalGeneral, tipoPago, estadoPago, estadoFiscal
      );
      const ventaId = resVenta.lastInsertRowid;

      const detalleStmt = db.prepare(`
        INSERT INTO venta_detalles (id_venta, id_producto, cantidad, precio_unitario, itbis_monto, subtotal, total, costo_unitario)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const descontarStockStmt = db.prepare(`
        UPDATE inventario_stock SET cantidad = cantidad - ?
        WHERE id_almacen = ? AND id_producto = ? AND cantidad >= ?
      `);

      for (const d of detallesCalculados) {
        detalleStmt.run(ventaId, d.id_producto, d.cantidad, d.precio_unitario, d.itbis_monto, d.subtotal, d.total, d.costo_unitario);
        const resStock = descontarStockStmt.run(d.cantidad, idAlmacen, d.id_producto, d.cantidad);
        if (resStock.changes === 0) {
          const p = db.prepare(`SELECT nombre FROM productos WHERE id = ?`).get(d.id_producto);
          throw new Error(`Stock insuficiente en el almacén seleccionado para '${p ? p.nombre : 'producto ID ' + d.id_producto}'.`);
        }
        InventoryService.registrarMovimientoKardex(db, { idProducto: d.id_producto, idAlmacen, tipoMovimiento: 'Salida Venta', cantidad: -d.cantidad, referencia: `Venta #${ventaId}`, idUsuario });
      }

      if (tipoPago === 'Credito') {
        db.prepare(`
          INSERT INTO cuentas_por_cobrar (id_venta, id_cliente, monto_original, balance_pendiente, fecha_vencimiento, estado)
          VALUES (?, ?, ?, ?, date('now','localtime', '+' || ? || ' days'), 'Pendiente')
        `).run(ventaId, idCliente, totalGeneral, totalGeneral, diasCredito);
        db.prepare(`UPDATE clientes SET balance_pendiente = balance_pendiente + ? WHERE id = ?`).run(totalGeneral, idCliente);
      }

      db.exec('COMMIT;');
      return {
        exito: true,
        ventaId,
        ncf: ncfResult.ncf,
        estadoFiscal,
        total: totalGeneral,
        alertaRestantesNCF: ncfResult.alertaRestantes
      };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Pasa una venta previa (Pendiente NCF) a FACTURA DGII asignando NCF oficial.
   * @param {number} idVenta 
   * @param {string} tipoNCF 
   */
  static asignarNCFaVenta(idVenta, tipoNCF = 'B02') {
    const db = getDatabaseConnection();
    const venta = db.prepare(`SELECT * FROM ventas WHERE id = ?`).get(idVenta);

    if (!venta) {
      throw new Error(`No se encontró la venta con ID ${idVenta}.`);
    }

    if (venta.estado_fiscal === 'Facturada NCF' && venta.ncf && venta.ncf !== 'PENDIENTE NCF') {
      return { exito: true, mensaje: 'La venta ya posee un NCF asignado.', ncf: venta.ncf };
    }

    const ncfResult = NCFManager.obtenerSiguienteNCF(tipoNCF);

    const updateStmt = db.prepare(`
      UPDATE ventas
      SET ncf = ?, tipo_ncf = ?, estado_fiscal = 'Facturada NCF'
      WHERE id = ?
    `);
    updateStmt.run(ncfResult.ncf, tipoNCF, idVenta);

    return {
      exito: true,
      idVenta,
      ncf: ncfResult.ncf,
      tipoNCF,
      total: venta.total,
      alertaRestantesNCF: ncfResult.alertaRestantes
    };
  }

  /**
   * Obtiene el historial de ventas registradas con costo total y ganancia estimada.
   */
  static obtenerVentas(limit = 500) {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT v.*, a.nombre as almacen_nombre,
             COALESCE((
               SELECT SUM(vd.cantidad * COALESCE(vd.costo_unitario, p.precio_compra))
               FROM venta_detalles vd
               JOIN productos p ON vd.id_producto = p.id
               WHERE vd.id_venta = v.id
             ), 0) as costo_total,
             (v.subtotal - COALESCE(v.descuento, 0) - COALESCE((
               SELECT SUM(vd.cantidad * COALESCE(vd.costo_unitario, p.precio_compra))
               FROM venta_detalles vd
               JOIN productos p ON vd.id_producto = p.id
               WHERE vd.id_venta = v.id
             ), 0)) as ganancia_estimada
      FROM ventas v
      LEFT JOIN almacenes a ON v.id_almacen = a.id
      ORDER BY v.id DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Obtiene el detalle completo de productos de una venta específica.
   */
  static obtenerVentaDetalle(idVenta) {
    const db = getDatabaseConnection();
    const venta = db.prepare(`
      SELECT v.*, a.nombre as almacen_nombre
      FROM ventas v
      LEFT JOIN almacenes a ON v.id_almacen = a.id
      WHERE v.id = ?
    `).get(idVenta);

    if (!venta) return null;

    const detalles = db.prepare(`
      SELECT vd.*, p.nombre as producto_nombre, p.codigo_barras, p.codigo_interno
      FROM venta_detalles vd
      JOIN productos p ON vd.id_producto = p.id
      WHERE vd.id_venta = ?
    `).all(idVenta);

    return { ...venta, detalles };
  }

  /**
   * Modifica/Edita una venta pendiente (que aún no se ha mandado a facturar con NCF).
   * Restituye el inventario anterior y deduce el nuevo inventario para los items editados.
   */
  static editarVenta(payload) {
    const { idVenta, nombreCliente, rncCliente, items } = payload;
    if (!idVenta || isNaN(idVenta)) throw new Error('ID de venta no válido.');
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('La venta debe tener al menos un producto.');
    }
    const tipoPagoNuevo = payload.tipoPago ? (esCredito(payload.tipoPago) ? 'Credito' : payload.tipoPago) : null;
    if (tipoPagoNuevo && !TIPOS_PAGO_VALIDOS.includes(tipoPagoNuevo)) throw new Error(`Método de pago no válido: ${tipoPagoNuevo}.`);

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const venta = db.prepare(`SELECT * FROM ventas WHERE id = ?`).get(idVenta);
      if (!venta) throw new Error(`No se encontró la venta #${idVenta}.`);
      if (venta.estado_venta === 'Anulada') throw new Error('Una venta anulada no se puede editar.');
      if (venta.id_cuadre) throw new Error(`La venta #${idVenta} ya fue liquidada en el cuadre #${venta.id_cuadre}; no se puede editar. Si hay un error, anúlala y regístrala de nuevo.`);

      // 1. Devolver el stock de la venta anterior
      const detallesAnteriores = db.prepare(`SELECT * FROM venta_detalles WHERE id_venta = ?`).all(idVenta);
      const sumarStockStmt = db.prepare(`UPDATE inventario_stock SET cantidad = cantidad + ? WHERE id_almacen = ? AND id_producto = ?`);
      for (const d of detallesAnteriores) {
        sumarStockStmt.run(d.cantidad, venta.id_almacen, d.id_producto);
        InventoryService.registrarMovimientoKardex(db, { idProducto: d.id_producto, idAlmacen: venta.id_almacen, tipoMovimiento: 'Entrada Edicion Venta', cantidad: d.cantidad, referencia: `Edición de venta #${idVenta}` });
      }
      db.prepare(`DELETE FROM venta_detalles WHERE id_venta = ?`).run(idVenta);

      // 2. Registrar los nuevos productos
      let subtotal = 0;
      let itbisTotal = 0;
      const restarStockStmt = db.prepare(`
        UPDATE inventario_stock SET cantidad = cantidad - ?
        WHERE id_almacen = ? AND id_producto = ? AND cantidad >= ?
      `);
      const insertDetalleStmt = db.prepare(`
        INSERT INTO venta_detalles (id_venta, id_producto, cantidad, precio_unitario, itbis_monto, subtotal, total, costo_unitario)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let lineas = 0;
      for (const item of items) {
        const idProd = parseInt(item.id_producto, 10);
        const cant = Number(item.cantidad);
        const precioUnit = Number(item.precio_unitario);
        const pctItbis = (item.itbis_porcentaje !== undefined && item.itbis_porcentaje !== null) ? Number(item.itbis_porcentaje) : 0;
        if (!Number.isInteger(cant) || cant <= 0) continue;
        if (!Number.isFinite(precioUnit) || precioUnit < 0) throw new Error('El precio de cada producto debe ser un número válido.');

        const producto = db.prepare(`SELECT nombre, precio_compra FROM productos WHERE id = ?`).get(idProd);
        if (!producto) throw new Error(`No se encontró el producto #${idProd}.`);

        const res = restarStockStmt.run(cant, venta.id_almacen, idProd, cant);
        if (res.changes === 0) {
          const st = db.prepare(`SELECT cantidad FROM inventario_stock WHERE id_almacen = ? AND id_producto = ?`).get(venta.id_almacen, idProd);
          throw new Error(`Stock insuficiente para '${producto.nombre}'. Disponible: ${st ? st.cantidad : 0}`);
        }

        // Si el producto ya estaba en la venta se conserva su costo histórico
        const anterior = detallesAnteriores.find(d => d.id_producto === idProd);
        const costo = anterior && anterior.costo_unitario !== null ? anterior.costo_unitario : producto.precio_compra;

        const itemSubtotal = precioUnit * cant;
        const itemItbis = (itemSubtotal * pctItbis) / 100.0;
        subtotal += itemSubtotal;
        itbisTotal += itemItbis;
        insertDetalleStmt.run(idVenta, idProd, cant, precioUnit, itemItbis, itemSubtotal, itemSubtotal + itemItbis, costo);
        InventoryService.registrarMovimientoKardex(db, { idProducto: idProd, idAlmacen: venta.id_almacen, tipoMovimiento: 'Salida Edicion Venta', cantidad: -cant, referencia: `Edición de venta #${idVenta}` });
        lineas++;
      }
      if (lineas === 0) throw new Error('La venta debe tener al menos un producto con cantidad mayor que cero.');

      // 3. El descuento de la venta original se conserva
      const descuento = Math.min(Number(venta.descuento) || 0, subtotal + itbisTotal);
      const total = subtotal + itbisTotal - descuento;
      const tipoPago = tipoPagoNuevo || (esCredito(venta.tipo_pago) ? 'Credito' : venta.tipo_pago);
      const nuevoEsCredito = tipoPago === 'Credito';
      const anteriorEsCredito = esCredito(venta.tipo_pago);

      if (nuevoEsCredito && Number(venta.id_cliente) === 1) {
        throw new Error('Para vender a crédito selecciona un cliente registrado (no el Consumidor Final).');
      }

      db.prepare(`
        UPDATE ventas
        SET nombre_cliente = ?, rnc_cliente = ?, tipo_pago = ?, estado_pago = ?,
            subtotal = ?, itbis_total = ?, descuento = ?, total = ?
        WHERE id = ?
      `).run(
        (nombreCliente || venta.nombre_cliente || 'CLIENTE CONTADO').trim(),
        (rncCliente !== undefined ? (rncCliente || '') : (venta.rnc_cliente || '')).toString().trim(),
        tipoPago, nuevoEsCredito ? 'Pendiente' : 'Pagado',
        subtotal, itbisTotal, descuento, total, idVenta
      );

      // 4. Sincronizar cuentas por cobrar y balance del cliente
      if (anteriorEsCredito && !nuevoEsCredito) {
        const cxc = db.prepare(`SELECT balance_pendiente FROM cuentas_por_cobrar WHERE id_venta = ?`).get(idVenta);
        db.prepare(`UPDATE cuentas_por_cobrar SET balance_pendiente = 0, estado = 'Pagado' WHERE id_venta = ?`).run(idVenta);
        db.prepare(`UPDATE clientes SET balance_pendiente = MAX(0, balance_pendiente - ?) WHERE id = ?`).run(cxc ? cxc.balance_pendiente : venta.total, venta.id_cliente);
      } else if (!anteriorEsCredito && nuevoEsCredito) {
        db.prepare(`
          INSERT INTO cuentas_por_cobrar (id_venta, id_cliente, monto_original, balance_pendiente, fecha_vencimiento, estado)
          VALUES (?, ?, ?, ?, date('now','localtime','+30 days'), 'Pendiente')
        `).run(idVenta, venta.id_cliente, total, total);
        db.prepare(`UPDATE clientes SET balance_pendiente = balance_pendiente + ? WHERE id = ?`).run(total, venta.id_cliente);
      } else if (anteriorEsCredito && nuevoEsCredito) {
        const difTotal = total - venta.total;
        db.prepare(`UPDATE cuentas_por_cobrar SET monto_original = ?, balance_pendiente = MAX(0, balance_pendiente + ?) WHERE id_venta = ?`).run(total, difTotal, idVenta);
        db.prepare(`UPDATE clientes SET balance_pendiente = MAX(0, balance_pendiente + ?) WHERE id = ?`).run(difTotal, venta.id_cliente);
      }

      db.exec('COMMIT;');
      return { exito: true, subtotal, itbisTotal, total };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Anula una venta previamente procesada, restituye el inventario y genera Nota de Crédito B04 si aplica.
   */
  static anularVenta(idVenta, motivo = 'Cancelación por el cliente') {
    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const venta = db.prepare(`SELECT * FROM ventas WHERE id = ?`).get(idVenta);
      if (!venta) {
        throw new Error(`No se encontró la venta #${idVenta}.`);
      }

      if (venta.estado_venta === 'Anulada') {
        throw new Error(`La venta #${idVenta} ya se encuentra anulada.`);
      }

      const detalles = db.prepare(`SELECT * FROM venta_detalles WHERE id_venta = ?`).all(idVenta);

      // 1. Restituir stock. Si el camión ya fue liquidado (se vació), la mercancía vuelve al Almacén Central.
      const almacenDevolucion = venta.id_cuadre ? 1 : venta.id_almacen;
      const devolverStockStmt = db.prepare(`
        INSERT INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (?, ?, ?)
        ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = cantidad + excluded.cantidad
      `);
      for (const d of detalles) {
        devolverStockStmt.run(almacenDevolucion, d.id_producto, d.cantidad);
        InventoryService.registrarMovimientoKardex(db, { idProducto: d.id_producto, idAlmacen: almacenDevolucion, tipoMovimiento: 'Entrada Anulacion', cantidad: d.cantidad, referencia: `Anulación de venta #${idVenta}` });
      }

      // 2. Si fue a Crédito, quitar sólo la deuda que todavía estaba pendiente
      if (esCredito(venta.tipo_pago)) {
        const cxc = db.prepare(`SELECT balance_pendiente FROM cuentas_por_cobrar WHERE id_venta = ?`).get(idVenta);
        db.prepare(`UPDATE cuentas_por_cobrar SET balance_pendiente = 0, estado = 'Anulado' WHERE id_venta = ?`).run(idVenta);
        db.prepare(`UPDATE clientes SET balance_pendiente = MAX(0, balance_pendiente - ?) WHERE id = ?`)
          .run(cxc ? cxc.balance_pendiente : venta.total, venta.id_cliente);
      }

      // 3. Emitir Nota de Crédito B04 DGII si la venta tenía NCF fiscal asignado
      let notaCreditoNCF = null;
      if (venta.estado_fiscal === 'Facturada NCF' && venta.ncf && !venta.ncf.includes('SIN NCF')) {
        const ncfRes = NCFManager.obtenerSiguienteNCF('B04');
        notaCreditoNCF = ncfRes.ncf;
      }

      // 4. Actualizar estado de la venta
      db.prepare(`
        UPDATE ventas
        SET estado_venta = 'Anulada'
        WHERE id = ?
      `).run(idVenta);

      db.exec('COMMIT;');

      return {
        exito: true,
        idVenta,
        notaCreditoNCF,
        mensaje: notaCreditoNCF 
          ? `Venta #${idVenta} anulada con éxito. Se generó la Nota de Crédito DGII NCF: ${notaCreditoNCF} y se devolvió el stock.` 
          : `Venta #${idVenta} anulada con éxito y stock restituido al almacén.`
      };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Elimina completamente una venta del historial.
   * Restituye el inventario al almacén o camión (si no estaba anulada previamente),
   * revierte la deuda en clientes si fue a crédito, elimina pagos_clientes y cuentas_por_cobrar,
   * elimina venta_detalles y la venta.
   */
  static eliminarVenta(idVenta) {
    if (!idVenta || isNaN(idVenta)) throw new Error('ID de venta no válido.');

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const venta = db.prepare(`SELECT * FROM ventas WHERE id = ?`).get(idVenta);
      if (!venta) {
        throw new Error(`No se encontró la venta #${idVenta}.`);
      }

      const detalles = db.prepare(`SELECT * FROM venta_detalles WHERE id_venta = ?`).all(idVenta);

      // 1. Si la venta NO estaba anulada, se devuelve el inventario (al Central si el camión ya fue liquidado)
      if (venta.estado_venta !== 'Anulada') {
        const almacenDevolucion = venta.id_cuadre ? 1 : venta.id_almacen;
        const devolverStockStmt = db.prepare(`
          INSERT INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (?, ?, ?)
          ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = cantidad + excluded.cantidad
        `);
        for (const d of detalles) {
          devolverStockStmt.run(almacenDevolucion, d.id_producto, d.cantidad);
          InventoryService.registrarMovimientoKardex(db, { idProducto: d.id_producto, idAlmacen: almacenDevolucion, tipoMovimiento: 'Entrada Eliminacion Venta', cantidad: d.cantidad, referencia: `Eliminación de venta #${idVenta}`, idUsuario: venta.id_usuario || 1 });
        }

        // 2. Si fue a crédito, descontar la deuda pendiente del cliente
        if (esCredito(venta.tipo_pago)) {
          const cxc = db.prepare(`SELECT * FROM cuentas_por_cobrar WHERE id_venta = ?`).get(idVenta);
          if (cxc && cxc.balance_pendiente > 0 && venta.id_cliente) {
            db.prepare(`UPDATE clientes SET balance_pendiente = MAX(0, balance_pendiente - ?) WHERE id = ?`).run(cxc.balance_pendiente, venta.id_cliente);
          }
        }
      }

      // 3. Eliminar pagos y cuentas por cobrar asociadas a la venta
      const cxcList = db.prepare(`SELECT id FROM cuentas_por_cobrar WHERE id_venta = ?`).all(idVenta);
      for (const c of cxcList) {
        db.prepare(`DELETE FROM pagos_clientes WHERE id_cuenta_cobrar = ?`).run(c.id);
      }
      db.prepare(`DELETE FROM cuentas_por_cobrar WHERE id_venta = ?`).run(idVenta);

      // 4. Eliminar detalles de la venta
      db.prepare(`DELETE FROM venta_detalles WHERE id_venta = ?`).run(idVenta);

      // 5. Eliminar la venta
      db.prepare(`DELETE FROM ventas WHERE id = ?`).run(idVenta);

      db.exec('COMMIT;');

      return {
        exito: true,
        idVenta,
        mensaje: `Venta #${idVenta} eliminada correctamente y stock restituido.`
      };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  static obtenerResumenCajaActual(idCajero = 1) {
    const db = getDatabaseConnection();
    const hoy = hoyLocal();

    const ventas = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo_pago = 'Contado' THEN total ELSE 0 END), 0) as total_contado,
        COALESCE(SUM(CASE WHEN tipo_pago = 'Transferencia' THEN total ELSE 0 END), 0) as total_transferencia,
        COALESCE(SUM(CASE WHEN tipo_pago = 'Cheque' THEN total ELSE 0 END), 0) as total_cheque,
        COALESCE(SUM(CASE WHEN tipo_pago = 'Credito' OR tipo_pago = 'Crédito' THEN total ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(total), 0) as total_general,
        COUNT(id) as total_transacciones
      FROM ventas
      WHERE id_almacen = 1 AND estado_venta = 'Completada' AND DATE(fecha) = ?
    `).get(hoy);

    // Sólo gastos que salen de caja: la compra de mercancía y las mermas NO se pagan con el efectivo del POS.
    const gastos = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total_gastos
      FROM gastos
      WHERE DATE(fecha) = ?
        AND LOWER(TRIM(COALESCE(categoria, ''))) NOT IN ('compras de inventario', 'compra de inventario')
        AND LOWER(TRIM(COALESCE(categoria, ''))) NOT LIKE '%merma%'
    `).get(hoy);

    const totalGastos = gastos ? gastos.total_gastos : 0;
    const efectivoEsperado = Math.max(0, ventas.total_contado - totalGastos);

    return {
      fecha: hoy,
      id_cajero: idCajero,
      total_contado: ventas.total_contado,
      total_transferencia: ventas.total_transferencia,
      total_cheque: ventas.total_cheque,
      total_credito: ventas.total_credito,
      total_general: ventas.total_general,
      total_gastos: totalGastos,
      total_transacciones: ventas.total_transacciones,
      monto_esperado_efectivo: efectivoEsperado,
      // Compatibilidad con vistas previas
      total_ventas_efectivo: ventas.total_contado,
      total_ventas_credito: ventas.total_credito
    };
  }

  /**
   * Registra el cuadre y cierre diario de caja POS con conteo de dinero físico.
   */
  static registrarCierreCajaPOS(cierreData) {
    const { efectivoFisico, notas = '', idCajero = 1 } = cierreData;
    const db = getDatabaseConnection();
    const resumen = this.obtenerResumenCajaActual(idCajero);

    const diferencia = parseFloat(efectivoFisico) - resumen.monto_esperado_efectivo;

    const stmt = db.prepare(`
      INSERT INTO cierres_caja_pos (
        id_cajero, total_ventas_efectivo, total_ventas_credito,
        monto_esperado_efectivo, efectivo_contado_fisico, diferencia, notas, fecha_cierre
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `);

    const res = stmt.run(
      idCajero,
      resumen.total_ventas_efectivo,
      resumen.total_ventas_credito,
      resumen.monto_esperado_efectivo,
      parseFloat(efectivoFisico),
      diferencia,
      notas
    );

    return {
      exito: true,
      cierreId: res.lastInsertRowid,
      diferencia,
      montoEsperado: resumen.monto_esperado_efectivo,
      efectivoFisico: parseFloat(efectivoFisico)
    };
  }

  /**
   * Obtiene la lista de cierres de caja POS registrados.
   */
  static obtenerCierresCajaPOS() {
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT c.*, u.nombre as cajero_nombre
      FROM cierres_caja_pos c
      LEFT JOIN usuarios u ON c.id_cajero = u.id
      ORDER BY c.id DESC
      LIMIT 50
    `).all();
  }
}

module.exports = SalesService;
