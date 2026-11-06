const { getDatabaseConnection } = require('../../data/connection');

class InventoryService {
  /**
   * Obtiene la lista completa de productos con sus precios e inventario por almacén.
   */
  static obtenerProductos() {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.id_categoria = c.id
      WHERE p.activo = 1
      ORDER BY p.nombre ASC
    `);
    const productos = stmt.all();

    // Obtener desglose de stock por almacén para cada producto
    const stockStmt = db.prepare(`
      SELECT s.id_almacen, a.nombre as almacen_nombre, a.tipo, s.cantidad
      FROM inventario_stock s
      JOIN almacenes a ON s.id_almacen = a.id
      WHERE s.id_producto = ?
    `);

    return productos.map(prod => {
      const stocks = stockStmt.all(prod.id);
      let stockTotal = 0;
      const stockPorAlmacen = {};
      
      stocks.forEach(st => {
        stockPorAlmacen[st.id_almacen] = st.cantidad;
        stockTotal += st.cantidad;
      });

      return {
        ...prod,
        stock_total: stockTotal,
        stock_desglose: stockPorAlmacen
      };
    });
  }

  /**
   * Obtiene la lista de categorías de productos.
   */
  static obtenerCategorias() {
    const db = getDatabaseConnection();
    return db.prepare(`SELECT * FROM categorias ORDER BY nombre ASC`).all();
  }

  /**
   * Registra un nuevo producto / mercancía en el catálogo y asigna su stock inicial en el Almacén Central.
   */
  static registrarProducto(productoData) {
    const {
      codigoBarras = '',
      codigoInterno,
      nombre,
      idCategoria = 1,
      unidadMedida = 'Caja',
      precioCompra,
      precioMayorista,
      precioDetalle,
      itbisPorcentaje = 18.00,
      stockInicialCentral = 0,
      stockMinimo = 10
    } = productoData;

    if (!codigoInterno || !codigoInterno.trim()) {
      throw new Error('El código interno del producto es obligatorio.');
    }
    if (!nombre || !nombre.trim()) {
      throw new Error('El nombre de la mercancía es obligatorio.');
    }
    if (isNaN(precioCompra) || isNaN(precioMayorista) || isNaN(precioDetalle)) {
      throw new Error('Los precios de compra, mayorista y detalle deben ser números válidos.');
    }

    const db = getDatabaseConnection();

    // Verificar si el código interno ya existe
    const existStmt = db.prepare(`SELECT id FROM productos WHERE codigo_interno = ?`);
    if (existStmt.get(codigoInterno.trim())) {
      throw new Error(`Ya existe un producto con el código interno '${codigoInterno}'.`);
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const stmtProd = db.prepare(`
        INSERT INTO productos (
          codigo_barras, codigo_interno, nombre, id_categoria, unidad_medida,
          precio_compra, precio_mayorista, precio_detalle, itbis_porcentaje, stock_minimo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const resProd = stmtProd.run(
        codigoBarras.trim(), codigoInterno.trim(), nombre.trim(), idCategoria, unidadMedida,
        precioCompra, precioMayorista, precioDetalle, itbisPorcentaje, stockMinimo
      );
      const productoId = resProd.lastInsertRowid;

      // Asignar stock inicial en Almacén Central (ID 1)
      const stmtStock = db.prepare(`
        INSERT INTO inventario_stock (id_almacen, id_producto, cantidad)
        VALUES (1, ?, ?)
        ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = excluded.cantidad
      `);
      stmtStock.run(productoId, stockInicialCentral);
      if (Number(stockInicialCentral) > 0) {
        this.registrarMovimientoKardex(db, { idProducto: productoId, idAlmacen: 1, tipoMovimiento: 'Stock Inicial', cantidad: Number(stockInicialCentral), referencia: 'Registro del producto' });
      }

      // Crear el stock inicial vacío para todos los vehículos de reparto configurados.
      const stmtStockCamiones = db.prepare(`
        INSERT OR IGNORE INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (?, ?, 0)
      `);
      const camiones = db.prepare(`SELECT id FROM almacenes WHERE tipo = 'Camion' AND activo = 1`).all();
      camiones.forEach(camion => stmtStockCamiones.run(camion.id, productoId));

      db.exec('COMMIT;');
      return { exito: true, productoId };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Actualiza la información de un producto en el catálogo (nombre, precios, códigos, etc.).
   */
  static actualizarProducto(productoData) {
    const {
      id,
      codigoBarras = '',
      codigoInterno,
      nombre,
      idCategoria = 1,
      unidadMedida = 'Caja',
      precioCompra,
      precioMayorista,
      precioDetalle,
      itbisPorcentaje = 18.00,
      stockMinimo = 10
    } = productoData;

    if (!id || isNaN(id)) throw new Error('ID de producto no válido.');
    if (!nombre || !nombre.trim()) throw new Error('El nombre de la mercancía es obligatorio.');
    if (isNaN(precioCompra) || isNaN(precioMayorista) || isNaN(precioDetalle)) {
      throw new Error('Los precios deben ser números válidos.');
    }

    const db = getDatabaseConnection();
    db.prepare(`
      UPDATE productos
      SET codigo_interno = ?, codigo_barras = ?, nombre = ?, id_categoria = ?,
          unidad_medida = ?, precio_compra = ?, precio_mayorista = ?,
          precio_detalle = ?, itbis_porcentaje = ?, stock_minimo = ?
      WHERE id = ?
    `).run(codigoInterno.trim(), codigoBarras.trim(), nombre.trim(), idCategoria, unidadMedida, precioCompra, precioMayorista, precioDetalle, itbisPorcentaje, stockMinimo, id);

    return { exito: true };
  }

  /**
   * Elimina o desactiva un producto del catálogo de inventario.
   */
  static eliminarProducto(idProducto) {
    if (!idProducto || isNaN(idProducto)) throw new Error('ID de producto no válido.');
    const db = getDatabaseConnection();

    // 1. Verificar si el producto tiene ventas asociadas
    const ventasCount = db.prepare(`SELECT COUNT(id) as total FROM venta_detalles WHERE id_producto = ?`).get(idProducto).total;

    if (ventasCount > 0) {
      // Soft delete para mantener la integridad histórica y contable DGII
      db.prepare(`UPDATE productos SET activo = 0 WHERE id = ?`).run(idProducto);
      return { exito: true, tipo: 'desactivado' };
    } else {
      // Hard delete si nunca se ha vendido
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare(`DELETE FROM inventario_stock WHERE id_producto = ?`).run(idProducto);
        db.prepare(`DELETE FROM kardex_movimientos WHERE id_producto = ?`).run(idProducto);
        db.prepare(`DELETE FROM productos WHERE id = ?`).run(idProducto);
        db.exec('COMMIT;');
        return { exito: true, tipo: 'eliminado' };
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }

  /**
   * Carga mercancía desde el Almacén Principal hacia un Camión de repartos.
   * @param {number} idAlmacenOrigen - Generalmente 1 (Almacén Principal)
   * @param {number} idCamionDestino - ID de un vehículo activo registrado en almacenes.
   * @param {Array<{id_producto: number, cantidad: number}>} items 
   * @param {number} idUsuario 
   */
  static cargarCamion(idAlmacenOrigen, idCamionDestino, items, idUsuario = 1) {
    const db = getDatabaseConnection();
    const origen = Number(idAlmacenOrigen);
    const destino = Number(idCamionDestino);

    if (origen === destino) {
      throw new Error('El almacén de origen y el camión de destino no pueden ser el mismo.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Selecciona al menos un producto para cargar.');
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      const camion = db.prepare(`SELECT id, nombre FROM almacenes WHERE id = ? AND tipo = 'Camion' AND activo = 1`).get(destino);
      if (!camion) throw new Error('El vehículo de destino no existe o está inactivo.');

      const resTransf = db.prepare(`
        INSERT INTO transferencias_camion (id_almacen_origen, id_almacen_destino, fecha_transferencia, id_usuario, estado, notas)
        VALUES (?, ?, datetime('now','localtime'), ?, 'Despachado', 'Carga de ruta de distribución')
      `).run(origen, destino, idUsuario);
      const transferenciaId = resTransf.lastInsertRowid;

      const itemStmt = db.prepare(`INSERT INTO transferencia_detalles (id_transferencia, id_producto, cantidad_cargada) VALUES (?, ?, ?)`);
      const descontarOrigenStmt = db.prepare(`
        UPDATE inventario_stock SET cantidad = cantidad - ?
        WHERE id_almacen = ? AND id_producto = ? AND cantidad >= ?
      `);
      const sumarDestinoStmt = db.prepare(`
        INSERT INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (?, ?, ?)
        ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = cantidad + excluded.cantidad
      `);

      let lineas = 0;
      for (const item of items) {
        const idProducto = Number(item.id_producto);
        const cantidad = Number(item.cantidad);
        if (!Number.isInteger(cantidad) || cantidad <= 0) continue;

        const resDescuento = descontarOrigenStmt.run(cantidad, origen, idProducto, cantidad);
        if (resDescuento.changes === 0) {
          const p = db.prepare(`SELECT nombre FROM productos WHERE id = ?`).get(idProducto);
          throw new Error(`Stock insuficiente en el Almacén Principal para '${p ? p.nombre : 'producto #' + idProducto}'.`);
        }
        sumarDestinoStmt.run(destino, idProducto, cantidad);
        itemStmt.run(transferenciaId, idProducto, cantidad);
        this.registrarMovimientoKardex(db, { idProducto, idAlmacen: origen, tipoMovimiento: 'Salida a Camion', cantidad: -cantidad, referencia: `Despacho #${transferenciaId} a ${camion.nombre}`, idUsuario });
        this.registrarMovimientoKardex(db, { idProducto, idAlmacen: destino, tipoMovimiento: 'Entrada Camion', cantidad: cantidad, referencia: `Despacho #${transferenciaId}`, idUsuario });
        lineas++;
      }
      if (lineas === 0) throw new Error('Indica una cantidad mayor que cero en al menos un producto.');

      db.exec('COMMIT;');
      return { exito: true, transferenciaId };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Obtiene la lista de proveedores / suplidores registrados con sus metricas acumuladas.
   */
  static obtenerProveedores() {
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT 
        p.*,
        COUNT(ci.id) as total_compras,
        COALESCE(SUM(ci.total), 0) as total_monto_comprado
      FROM proveedores p
      LEFT JOIN compras_inventario ci ON (ci.id_proveedor = p.id OR ci.rnc_proveedor = p.rnc_cedula)
      WHERE p.activo = 1
      GROUP BY p.id
      ORDER BY p.nombre ASC
    `).all();
  }

  /**
   * Registra un nuevo proveedor de mercancía en el sistema.
   */
  static registrarProveedor(proveedorData) {
    const { rncCedula, nombre, telefono = '', direccion = '', email = '' } = proveedorData;
    if (!nombre || !nombre.trim()) throw new Error('El nombre o razón social del proveedor es obligatorio.');
    if (!rncCedula || !rncCedula.trim()) throw new Error('El RNC/Cédula o ID del proveedor es obligatorio.');

    const cleanRnc = rncCedula.trim();
    const db = getDatabaseConnection();
    const exist = db.prepare(`SELECT id FROM proveedores WHERE rnc_cedula = ? AND activo = 1`).get(cleanRnc);
    if (exist) throw new Error(`Ya existe un proveedor registrado con la identificación ${cleanRnc}.`);

    const res = db.prepare(`
      INSERT INTO proveedores (rnc_cedula, nombre, telefono, direccion, email)
      VALUES (?, ?, ?, ?, ?)
    `).run(cleanRnc, nombre.trim(), telefono, direccion, email);

    return { exito: true, proveedorId: res.lastInsertRowid };
  }

  /**
   * Actualiza los datos de un proveedor existente.
   */
  static actualizarProveedor(proveedorData) {
    const { id, rncCedula, nombre, telefono = '', direccion = '', email = '' } = proveedorData;
    if (!id || isNaN(id)) throw new Error('ID de proveedor no válido.');
    if (!nombre || !nombre.trim()) throw new Error('El nombre o razón social del proveedor es obligatorio.');
    if (!rncCedula || !rncCedula.trim()) throw new Error('El RNC/Cédula o ID del proveedor es obligatorio.');

    const db = getDatabaseConnection();
    db.prepare(`
      UPDATE proveedores
      SET rnc_cedula = ?, nombre = ?, telefono = ?, direccion = ?, email = ?
      WHERE id = ?
    `).run(rncCedula.trim(), nombre.trim(), telefono, direccion, email, id);

    return { exito: true };
  }

  /**
   * Desactiva un proveedor del sistema.
   */
  static desactivarProveedor(id) {
    if (!id || isNaN(id)) throw new Error('ID de proveedor no válido.');
    const db = getDatabaseConnection();
    db.prepare(`UPDATE proveedores SET activo = 0 WHERE id = ?`).run(id);
    return { exito: true };
  }

  /**
   * Obtiene el historial de compras realizadas a un proveedor especifico.
   */
  static obtenerHistorialComprasProveedor(idProveedor) {
    if (!idProveedor || isNaN(idProveedor)) throw new Error('ID de proveedor no válido.');
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT ci.*, a.nombre as almacen_nombre
      FROM compras_inventario ci
      LEFT JOIN almacenes a ON ci.id_almacen = a.id
      WHERE ci.id_proveedor = ? OR ci.rnc_proveedor = (SELECT rnc_cedula FROM proveedores WHERE id = ?)
      ORDER BY ci.id DESC
    `).all(idProveedor, idProveedor);
  }

  static obtenerDetalleCompra(idCompra) {
    const compraId = Number(idCompra);
    if (!Number.isInteger(compraId) || compraId <= 0) throw new Error('ID de compra no válido.');
    const db = getDatabaseConnection();
    const compra = db.prepare(`SELECT * FROM compras_inventario WHERE id = ?`).get(compraId);
    if (!compra) throw new Error('No se encontró la compra seleccionada.');
    const detalles = db.prepare(`
      SELECT cd.*, p.nombre as producto_nombre,
             CASE WHEN cd.cantidad * cd.precio_compra > 0
                  THEN (cd.itbis_monto / (cd.cantidad * cd.precio_compra)) * 100 ELSE 0 END as itbis_porcentaje
      FROM compra_detalles cd JOIN productos p ON p.id = cd.id_producto
      WHERE cd.id_compra = ? ORDER BY cd.id ASC
    `).all(compraId);
    return { ...compra, detalles };
  }

  static actualizarEntradaCompra(datos) {
    const idCompra = Number(datos.idCompra);
    const items = Array.isArray(datos.items) ? datos.items : [];
    if (!Number.isInteger(idCompra) || idCompra <= 0) throw new Error('ID de compra no válido.');
    if (!items.length) throw new Error('La compra debe incluir al menos un producto.');

    const db = getDatabaseConnection();
    const compraOriginal = db.prepare(`SELECT * FROM compras_inventario WHERE id = ?`).get(idCompra);
    if (!compraOriginal) throw new Error('No se encontró la compra seleccionada.');
    const detallesOriginales = db.prepare(`SELECT * FROM compra_detalles WHERE id_compra = ?`).all(idCompra);
    const itemsAgrupados = new Map();

    for (const item of items) {
      const idProducto = Number(item.id_producto);
      const cantidad = Number(item.cantidad);
      const precio = Number(item.precio_compra);
      const tasa = Number(item.itbis_porcentaje || 0);
      if (!Number.isInteger(idProducto) || idProducto <= 0 || !Number.isInteger(cantidad) || cantidad <= 0 || !Number.isFinite(precio) || precio < 0 || !Number.isFinite(tasa) || tasa < 0) {
        throw new Error('Revisa que cada producto tenga una cantidad, costo e ITBIS válidos.');
      }
      const producto = db.prepare(`SELECT id FROM productos WHERE id = ?`).get(idProducto);
      if (!producto) throw new Error(`No se encontró el producto #${idProducto}.`);
      const existente = itemsAgrupados.get(idProducto);
      if (existente) {
        existente.cantidad += cantidad;
        existente.precio_compra = precio;
        existente.itbis_porcentaje = tasa;
      } else {
        itemsAgrupados.set(idProducto, { id_producto: idProducto, cantidad, precio_compra: precio, itbis_porcentaje: tasa });
      }
    }

    const cantidadesAnteriores = new Map();
    detallesOriginales.forEach(d => cantidadesAnteriores.set(d.id_producto, (cantidadesAnteriores.get(d.id_producto) || 0) + d.cantidad));
    const cantidadesNuevas = new Map();
    itemsAgrupados.forEach(item => cantidadesNuevas.set(item.id_producto, item.cantidad));
    const productoIdsAfectados = new Set([...cantidadesAnteriores.keys(), ...cantidadesNuevas.keys()]);
    const ajusteStock = new Map();
    productoIdsAfectados.forEach(idProducto => {
      ajusteStock.set(idProducto, (cantidadesNuevas.get(idProducto) || 0) - (cantidadesAnteriores.get(idProducto) || 0));
    });

    db.exec('BEGIN IMMEDIATE;');
    try {
      for (const [idProducto, ajuste] of ajusteStock) {
        if (ajuste < 0) {
          const stock = db.prepare(`SELECT cantidad FROM inventario_stock WHERE id_almacen = ? AND id_producto = ?`)
            .get(compraOriginal.id_almacen, idProducto);
          const aRetirar = Math.abs(ajuste);
          if (!stock || stock.cantidad < aRetirar) {
            const p = db.prepare(`SELECT nombre FROM productos WHERE id = ?`).get(idProducto);
            throw new Error(`No se puede reducir la compra de '${p?.nombre || `producto #${idProducto}`}': solo hay ${stock?.cantidad || 0} unidad(es) disponible(s) en su almacén.`);
          }
          db.prepare(`UPDATE inventario_stock SET cantidad = cantidad - ? WHERE id_almacen = ? AND id_producto = ?`)
            .run(aRetirar, compraOriginal.id_almacen, idProducto);
          this.registrarMovimientoKardex(db, { idProducto, idAlmacen: compraOriginal.id_almacen, tipoMovimiento: 'Ajuste Compra', cantidad: -aRetirar, referencia: `Edición de compra #${idCompra}` });
        } else if (ajuste > 0) {
          db.prepare(`
            INSERT INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (?, ?, ?)
            ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = cantidad + excluded.cantidad
          `).run(compraOriginal.id_almacen, idProducto, ajuste);
          this.registrarMovimientoKardex(db, { idProducto, idAlmacen: compraOriginal.id_almacen, tipoMovimiento: 'Ajuste Compra', cantidad: ajuste, referencia: `Edición de compra #${idCompra}` });
        }
      }

      let subtotal = 0;
      let itbisTotal = 0;
      const nuevosDetalles = [...itemsAgrupados.values()].map(item => {
        const sub = item.cantidad * item.precio_compra;
        const itbis = sub * item.itbis_porcentaje / 100;
        subtotal += sub;
        itbisTotal += itbis;
        return { ...item, itbis_monto: itbis, total: sub + itbis };
      });
      const total = subtotal + itbisTotal;

      db.prepare(`DELETE FROM compra_detalles WHERE id_compra = ?`).run(idCompra);
      const insertDetalle = db.prepare(`
        INSERT INTO compra_detalles (id_compra, id_producto, cantidad, precio_compra, itbis_monto, total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      nuevosDetalles.forEach(item => insertDetalle.run(idCompra, item.id_producto, item.cantidad, item.precio_compra, item.itbis_monto, item.total));

      const proveedor = datos.idProveedor ? db.prepare(`SELECT rnc_cedula, nombre FROM proveedores WHERE id = ?`).get(datos.idProveedor) : null;
      const rncProveedor = datos.rncProveedor || proveedor?.rnc_cedula || '';
      const nombreProveedor = datos.nombreProveedor || proveedor?.nombre || compraOriginal.nombre_proveedor || '';
      const fechaCompra = datos.fechaCompra || compraOriginal.fecha_compra;
      const ncfCompra = (datos.ncfCompra !== undefined && datos.ncfCompra !== null) ? String(datos.ncfCompra).trim() : (compraOriginal.ncf_compra || '');
      db.prepare(`
        UPDATE compras_inventario
        SET id_proveedor = ?, rnc_proveedor = ?, nombre_proveedor = ?, ncf_compra = ?, fecha_compra = ?,
            subtotal = ?, itbis_total = ?, total = ?, tipo_pago = ?, notas = ?
        WHERE id = ?
      `).run(datos.idProveedor || null, rncProveedor, nombreProveedor, ncfCompra, fechaCompra, subtotal, itbisTotal, total, datos.tipoPago || compraOriginal.tipo_pago, datos.notas || '', idCompra);

      const detalleGasto = `(Factura #${idCompra})`;
      const gasto = db.prepare(`
        SELECT id FROM gastos
        WHERE categoria = 'Compras de Inventario' AND (id_compra = ? OR concepto LIKE ?)
        ORDER BY (id_compra = ?) DESC, id DESC LIMIT 1
      `).get(idCompra, `%${detalleGasto}%`, idCompra);
      const conceptoGasto = `Compra Mercancía a ${nombreProveedor || 'Suplidor'} ${detalleGasto}`;
      if (gasto) {
        db.prepare(`UPDATE gastos SET fecha = DATE(?), concepto = ?, monto = ?, ncf_comprobante = ?, rnc_proveedor = ?, id_compra = ? WHERE id = ?`)
          .run(fechaCompra, conceptoGasto, total, ncfCompra || null, rncProveedor, idCompra, gasto.id);
      } else {
        db.prepare(`
          INSERT INTO gastos (fecha, categoria, concepto, monto, ncf_comprobante, rnc_proveedor, id_compra)
          VALUES (DATE(?), 'Compras de Inventario', ?, ?, ?, ?, ?)
        `).run(fechaCompra, conceptoGasto, total, ncfCompra || null, rncProveedor, idCompra);
      }

      for (const idProducto of productoIdsAfectados) {
        const ultimoCosto = db.prepare(`
          SELECT cd.precio_compra FROM compra_detalles cd
          JOIN compras_inventario ci ON ci.id = cd.id_compra
          WHERE cd.id_producto = ? ORDER BY datetime(ci.fecha_compra) DESC, ci.id DESC LIMIT 1
        `).get(idProducto);
        if (ultimoCosto) db.prepare(`UPDATE productos SET precio_compra = ? WHERE id = ?`).run(ultimoCosto.precio_compra, idProducto);
      }

      db.exec('COMMIT;');
      return { exito: true, idCompra, total, itemsComprados: nuevosDetalles.length };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Registra la entrada de mercancía por compra a suplidor, aumenta el stock en Almacén Central y alimenta el 606 DGII.
   */
  static registrarEntradaCompra(compraData) {
    const {
      idProveedor = null,
      rncProveedor = '',
      nombreProveedor = '',
      ncfCompra = '',
      fechaCompra = null,
      idAlmacen = 1,
      tipoPago = 'Contado',
      notas = '',
      items = []
    } = compraData;

    if (!items || items.length === 0) {
      throw new Error('La entrada de inventario debe incluir al menos un producto.');
    }

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      let subtotalTotal = 0;
      let itbisTotal = 0;
      let totalGeneral = 0;

      const itemsCalculados = items.map(item => {
        const cantidad = Number(item.cantidad);
        const precio = Number(item.precio_compra);
        const tasa = Number(item.itbis_porcentaje || 0);
        if (!Number.isInteger(cantidad) || cantidad <= 0 || !Number.isFinite(precio) || precio < 0 || !Number.isFinite(tasa) || tasa < 0) {
          throw new Error('Revisa que cada producto tenga una cantidad entera, un costo y un ITBIS válidos.');
        }
        const existe = db.prepare(`SELECT id FROM productos WHERE id = ?`).get(item.id_producto);
        if (!existe) throw new Error(`No se encontró el producto #${item.id_producto}.`);

        const sub = cantidad * precio;
        const itbis = sub * (tasa / 100);
        subtotalTotal += sub;
        itbisTotal += itbis;
        totalGeneral += sub + itbis;
        return { id_producto: item.id_producto, cantidad, precio_compra: precio, subtotal: sub, itbis_monto: itbis, total: sub + itbis };
      });

      const resCompra = db.prepare(`
        INSERT INTO compras_inventario (id_proveedor, rnc_proveedor, nombre_proveedor, ncf_compra, fecha_compra, id_almacen, subtotal, itbis_total, total, tipo_pago, notas)
        VALUES (?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')), ?, ?, ?, ?, ?, ?)
      `).run(idProveedor, rncProveedor, nombreProveedor, ncfCompra, fechaCompra, idAlmacen, subtotalTotal, itbisTotal, totalGeneral, tipoPago, notas);
      const idCompra = resCompra.lastInsertRowid;

      const detalleStmt = db.prepare(`
        INSERT INTO compra_detalles (id_compra, id_producto, cantidad, precio_compra, itbis_monto, total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const sumarStockStmt = db.prepare(`
        INSERT INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (?, ?, ?)
        ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = cantidad + excluded.cantidad
      `);
      const updatePrecioCompraStmt = db.prepare(`UPDATE productos SET precio_compra = ? WHERE id = ?`);

      for (const item of itemsCalculados) {
        detalleStmt.run(idCompra, item.id_producto, item.cantidad, item.precio_compra, item.itbis_monto, item.total);
        sumarStockStmt.run(idAlmacen, item.id_producto, item.cantidad);
        updatePrecioCompraStmt.run(item.precio_compra, item.id_producto);
        this.registrarMovimientoKardex(db, { idProducto: item.id_producto, idAlmacen, tipoMovimiento: 'Entrada Compra', cantidad: item.cantidad, referencia: `Compra #${idCompra} a ${nombreProveedor || 'Suplidor'}` });
      }

      // La compra queda registrada para el reporte 606 DGII, pero NO cuenta como gasto operativo:
      // es inversión en inventario (capital convertido en mercancía).
      db.prepare(`
        INSERT INTO gastos (fecha, categoria, concepto, monto, ncf_comprobante, rnc_proveedor, id_compra)
        VALUES (COALESCE(DATE(?), date('now','localtime')), 'Compras de Inventario', ?, ?, ?, ?, ?)
      `).run(fechaCompra, `Compra Mercancía a ${nombreProveedor || 'Suplidor'} (Factura #${idCompra})`, totalGeneral, ncfCompra || null, rncProveedor, idCompra);

      db.exec('COMMIT;');
      return { exito: true, idCompra, total: totalGeneral, itemsComprados: itemsCalculados.length };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Registra un movimiento en el Kardex DESPUÉS de haber modificado el stock del almacén.
   * `cantidad` va con signo (+ entra, - sale). Se llama dentro de la misma transacción que mueve el stock.
   */
  static registrarMovimientoKardex(db, { idProducto, idAlmacen, tipoMovimiento, cantidad, referencia = '', idUsuario = 1 }) {
    try {
      const fila = db.prepare(`SELECT cantidad FROM inventario_stock WHERE id_almacen = ? AND id_producto = ?`).get(idAlmacen, idProducto);
      const stockNuevo = fila ? fila.cantidad : 0;
      db.prepare(`
        INSERT INTO kardex_movimientos (id_producto, id_almacen, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, fecha, id_usuario)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
      `).run(idProducto, idAlmacen, tipoMovimiento, cantidad, stockNuevo - cantidad, stockNuevo, referencia, idUsuario);
    } catch (e) {
      console.error('Error al registrar movimiento en Kardex:', e.message);
    }
  }

  /**
   * Obtiene la trazabilidad completa del Kardex para un producto específico.
   */
  static obtenerKardexProducto(idProducto) {
    const db = getDatabaseConnection();
    const producto = db.prepare(`SELECT * FROM productos WHERE id = ?`).get(idProducto);
    if (!producto) return null;

    const movimientos = db.prepare(`
      SELECT k.*, a.nombre as almacen_nombre
      FROM kardex_movimientos k
      LEFT JOIN almacenes a ON k.id_almacen = a.id
      WHERE k.id_producto = ?
      ORDER BY k.id DESC
      LIMIT 100
    `).all(idProducto);

    return { producto, movimientos };
  }

  /**
   * Obtiene los productos más vendidos y con mayor margen de ganancia.
   */
  static obtenerTopProductos(limit = 10, fechaInicio = null, fechaFin = null) {
    const db = getDatabaseConnection();
    let sql = `
      SELECT p.id, p.codigo_interno, p.nombre, p.precio_compra, p.precio_detalle,
             SUM(vd.cantidad) as total_unidades_vendidas,
             SUM(vd.total) as total_monto_generado,
             SUM(
               vd.cantidad * (vd.precio_unitario - COALESCE(vd.costo_unitario, p.precio_compra))
               - CASE WHEN v.subtotal > 0
                      THEN 1.0 * COALESCE(v.descuento, 0) * vd.cantidad * vd.precio_unitario / v.subtotal
                      ELSE 0 END
             ) as ganancia_estimada
      FROM venta_detalles vd
      JOIN productos p ON vd.id_producto = p.id
      JOIN ventas v ON vd.id_venta = v.id
      WHERE v.estado_venta = 'Completada'
    `;
    const params = [];
    if (fechaInicio) {
      sql += ` AND DATE(v.fecha) >= ?`;
      params.push(fechaInicio);
    }
    if (fechaFin) {
      sql += ` AND DATE(v.fecha) <= ?`;
      params.push(fechaFin);
    }
    sql += ` GROUP BY p.id ORDER BY total_unidades_vendidas DESC LIMIT ?`;
    params.push(limit);
    return db.prepare(sql).all(...params);
  }

  /**
   * Obtiene el ranking de mejores clientes por volumen de compra.
   */
  static obtenerRankingClientes(limit = 10) {
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT c.id, c.nombre, c.rnc_cedula, c.limite_credito, c.balance_pendiente,
             COUNT(v.id) as total_compras,
             COALESCE(SUM(v.total), 0) as monto_total_comprado
      FROM clientes c
      LEFT JOIN ventas v ON c.id = v.id_cliente AND v.estado_venta = 'Completada'
      GROUP BY c.id
      ORDER BY monto_total_comprado DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Genera el reporte consolidado de inventario con filtros por período, almacén y valoración financiera.
   */
  static obtenerReporteInventario(filtros = {}) {
    const { fechaInicio, fechaFin, idAlmacen } = filtros;
    const db = getDatabaseConnection();

    const productos = this.obtenerProductos();

    let totalProductos = productos.length;
    let stockTotalUnidades = 0;
    let valorTotalCosto = 0;
    let valorTotalVenta = 0;
    let productosBajoMinimo = 0;

    const productosProcesados = productos.map(p => {
      let stockFiltrado = p.stock_total;
      if (idAlmacen) {
        stockFiltrado = p.stock_desglose[idAlmacen] || 0;
      }

      stockTotalUnidades += stockFiltrado;
      const valCosto = stockFiltrado * (p.precio_compra || 0);
      const valVenta = stockFiltrado * (p.precio_mayorista || 0);

      valorTotalCosto += valCosto;
      valorTotalVenta += valVenta;

      if (stockFiltrado <= p.stock_minimo) {
        productosBajoMinimo++;
      }

      return {
        ...p,
        stock_evaluado: stockFiltrado,
        valor_costo: valCosto,
        valor_venta: valVenta,
        margen_unidad: (p.precio_mayorista || 0) - (p.precio_compra || 0)
      };
    });

    const gananciaPotencial = Math.max(0, valorTotalVenta - valorTotalCosto);
    const pctMargen = valorTotalVenta > 0 ? (gananciaPotencial / valorTotalVenta) * 100 : 0;

    let sqlCompras = `SELECT COALESCE(SUM(total), 0) as monto_compras, COALESCE(COUNT(id), 0) as num_compras FROM compras_inventario WHERE 1=1`;
    const paramsCompras = [];
    if (fechaInicio) { sqlCompras += ` AND DATE(fecha_compra) >= ?`; paramsCompras.push(fechaInicio); }
    if (fechaFin) { sqlCompras += ` AND DATE(fecha_compra) <= ?`; paramsCompras.push(fechaFin); }
    if (idAlmacen) { sqlCompras += ` AND id_almacen = ?`; paramsCompras.push(idAlmacen); }
    const comprasRes = db.prepare(sqlCompras).get(...paramsCompras) || { monto_compras: 0, num_compras: 0 };

    let sqlMermas = `SELECT COALESCE(SUM(cantidad), 0) as cant_mermas FROM mermas_camion WHERE 1=1`;
    const paramsMermas = [];
    if (fechaInicio) { sqlMermas += ` AND DATE(fecha) >= ?`; paramsMermas.push(fechaInicio); }
    if (fechaFin) { sqlMermas += ` AND DATE(fecha) <= ?`; paramsMermas.push(fechaFin); }
    if (idAlmacen) { sqlMermas += ` AND id_camion = ?`; paramsMermas.push(idAlmacen); }
    const mermasRes = db.prepare(sqlMermas).get(...paramsMermas) || { cant_mermas: 0 };

    return {
      resumen: {
        total_productos: totalProductos,
        stock_total_unidades: stockTotalUnidades,
        valor_total_costo: valorTotalCosto,
        valor_total_venta: valorTotalVenta,
        ganancia_potencial: gananciaPotencial,
        pct_margen: pctMargen,
        productos_bajo_minimo: productosBajoMinimo,
        compras_monto_periodo: comprasRes.monto_compras,
        compras_num_periodo: comprasRes.num_compras,
        mermas_cant_periodo: mermasRes.cant_mermas
      },
      productos: productosProcesados
    };
  }
}

module.exports = InventoryService;
