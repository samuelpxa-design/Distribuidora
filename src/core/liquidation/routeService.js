const { getDatabaseConnection } = require('../../data/connection');
const { hoyLocal } = require('../../config/dateUtil');
const InventoryService = require('../inventory/inventoryService');

class RouteService {
  /**
   * Hoja de liquidación de un camión: TODAS sus ventas pendientes de liquidar (id_cuadre IS NULL),
   * separadas por método de pago. Sólo el EFECTIVO (Contado) debe entregarlo el chofer; transferencias,
   * cheques y crédito se muestran para control pero no se entregan en efectivo.
   */
  static obtenerResumenCuadreCamion(idCamion) {
    const db = getDatabaseConnection();
    const camionId = Number(idCamion);
    const hoy = hoyLocal();

    const r = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo_pago = 'Contado' THEN total ELSE 0 END), 0) AS ventas_efectivo,
        COALESCE(SUM(CASE WHEN tipo_pago = 'Transferencia' THEN total ELSE 0 END), 0) AS ventas_transferencia,
        COALESCE(SUM(CASE WHEN tipo_pago = 'Cheque' THEN total ELSE 0 END), 0) AS ventas_cheque,
        COALESCE(SUM(CASE WHEN tipo_pago = 'Credito' THEN total ELSE 0 END), 0) AS ventas_credito,
        COALESCE(SUM(total), 0) AS ventas_total,
        COUNT(id) AS total_facturas,
        MIN(DATE(fecha)) AS desde,
        MAX(DATE(fecha)) AS hasta
      FROM ventas
      WHERE id_almacen = ? AND id_cuadre IS NULL AND estado_venta = 'Completada'
    `).get(camionId);

    const inventarioActual = db.prepare(`
      SELECT s.cantidad, p.nombre AS producto_nombre, p.codigo_interno, p.precio_mayorista
      FROM inventario_stock s
      JOIN productos p ON s.id_producto = p.id
      WHERE s.id_almacen = ? AND s.cantidad > 0 AND p.activo = 1
      ORDER BY p.nombre ASC
    `).all(camionId);

    return {
      idCamion: camionId,
      fecha: hoy,
      periodo_desde: r.desde,
      periodo_hasta: r.hasta,
      ventas_efectivo: r.ventas_efectivo,
      ventas_transferencia: r.ventas_transferencia,
      ventas_cheque: r.ventas_cheque,
      ventas_credito: r.ventas_credito,
      ventas_total: r.ventas_total,
      efectivo_esperado: r.ventas_efectivo,
      total_facturas: r.total_facturas,
      // Compatibilidad con pantallas anteriores
      ventas_contado: r.ventas_efectivo,
      inventario_camion: inventarioActual
    };
  }

  /**
   * Cierra y liquida la ruta de un camión. Marca como liquidadas todas las ventas pendientes del camión,
   * de modo que cada venta se liquida una sola vez y cada camión se liquida de forma independiente.
   */
  static cerrarCuadreRuta(datosCuadre) {
    const { idCamion, efectivoEntregado, notas = '' } = datosCuadre;

    const camionId = Number(idCamion);
    const efectivoNum = Number(efectivoEntregado);
    const notasTexto = String(notas ?? '');
    if (!Number.isSafeInteger(camionId) || camionId <= 1) throw new Error('El vehículo seleccionado no es válido.');
    if (!Number.isFinite(efectivoNum) || efectivoNum < 0) throw new Error('El efectivo entregado debe ser un monto válido igual o mayor que cero.');

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const camion = db.prepare(`SELECT id, chofer_asignado FROM almacenes WHERE id = ? AND tipo = 'Camion' AND activo = 1`).get(camionId);
      if (!camion) throw new Error('El vehículo seleccionado ya no está activo en el sistema.');

      // El resumen se calcula DENTRO de la transacción para que no cambie entre la lectura y el cierre.
      const resumen = this.obtenerResumenCuadreCamion(camionId);
      const efectivoEsperado = resumen.ventas_efectivo;
      const diferencia = Math.round((efectivoNum - efectivoEsperado) * 100) / 100;

      const choferAsignado = datosCuadre.chofer || camion.chofer_asignado || '';
      const chofer = choferAsignado
        ? db.prepare(`SELECT id FROM empleados WHERE activo = 1 AND lower(trim(nombre)) = lower(trim(?)) LIMIT 1`).get(choferAsignado)
        : null;
      const idChoferReal = chofer && Number.isSafeInteger(Number(chofer.id)) ? Number(chofer.id) : null;

      const res = db.prepare(`
        INSERT INTO cuadre_rutas (
          fecha_cuadre, id_camion, id_chofer, total_ventas_contado, total_ventas_credito,
          total_ventas_transferencia, total_ventas_cheque, efectivo_entregado, diferencia_cuadre,
          estado, notas, creado_en
        ) VALUES (date('now','localtime'), ?, ?, ?, ?, ?, ?, ?, ?, 'Cerrado', ?, datetime('now','localtime'))
      `).run(
        camionId, idChoferReal, resumen.ventas_efectivo, resumen.ventas_credito,
        resumen.ventas_transferencia, resumen.ventas_cheque, efectivoNum, diferencia, notasTexto
      );
      const cuadreId = Number(res.lastInsertRowid);

      // Marcar las ventas liquidadas
      db.prepare(`
        UPDATE ventas SET id_cuadre = ?
        WHERE id_almacen = ? AND id_cuadre IS NULL AND estado_venta = 'Completada'
      `).run(cuadreId, camionId);

      // Devolver la mercancía sobrante del camión al Almacén Central
      const itemsRetornados = this._devolverStockACentral(db, camionId, `Liquidación de ruta #${cuadreId}`);

      db.exec('COMMIT;');
      return {
        exito: true,
        cuadreId,
        efectivoEsperado,
        efectivoEntregado: efectivoNum,
        diferencia,
        ventas_transferencia: resumen.ventas_transferencia,
        ventas_cheque: resumen.ventas_cheque,
        ventas_credito: resumen.ventas_credito,
        itemsRetornadosCentral: itemsRetornados
      };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /** Mueve todo el stock de un camión al Almacén Central (dentro de una transacción ya abierta). */
  static _devolverStockACentral(db, camionId, referencia) {
    const stockCamion = db.prepare(`SELECT id_producto, cantidad FROM inventario_stock WHERE id_almacen = ? AND cantidad > 0`).all(camionId);
    const sumarCentral = db.prepare(`
      INSERT INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES (1, ?, ?)
      ON CONFLICT(id_almacen, id_producto) DO UPDATE SET cantidad = cantidad + excluded.cantidad
    `);
    const vaciarCamion = db.prepare(`UPDATE inventario_stock SET cantidad = 0 WHERE id_almacen = ? AND id_producto = ?`);
    for (const item of stockCamion) {
      sumarCentral.run(item.id_producto, item.cantidad);
      vaciarCamion.run(camionId, item.id_producto);
      InventoryService.registrarMovimientoKardex(db, { idProducto: item.id_producto, idAlmacen: camionId, tipoMovimiento: 'Salida Camion', cantidad: -item.cantidad, referencia });
      InventoryService.registrarMovimientoKardex(db, { idProducto: item.id_producto, idAlmacen: 1, tipoMovimiento: 'Entrada Devolucion', cantidad: item.cantidad, referencia });
    }
    return stockCamion.length;
  }

  /**
   * Obtiene el historial de liquidaciones y cuadres diarios de camiones.
   */
  static obtenerHistorialCuadres(idCamion = null) {
    const db = getDatabaseConnection();
    let sql = `
      SELECT cr.*, a.nombre as camion_nombre, e.nombre as chofer_nombre
      FROM cuadre_rutas cr
      JOIN almacenes a ON cr.id_camion = a.id
      LEFT JOIN empleados e ON cr.id_chofer = e.id
    `;
    const params = [];
    if (idCamion) {
      sql += ` WHERE cr.id_camion = ?`;
      params.push(idCamion);
    }
    sql += ` ORDER BY cr.id DESC LIMIT 50`;
    return db.prepare(sql).all(...params);
  }

  /**
   * Registra mercancía dañada o rota en ruta (merma) ajustando el inventario del camión.
   */
  static registrarMermaCamion(mermaData) {
    const { idCamion, idProducto, cantidad, motivo = 'Daño o rotura en ruta', idUsuario = 1 } = mermaData;
    const cantNum = Number(cantidad);
    if (!Number.isInteger(cantNum) || cantNum <= 0) {
      throw new Error('Ingresa una cantidad de merma válida (número entero mayor que cero).');
    }
    const motivoTexto = String(motivo || '').trim() || 'Daño o rotura en ruta';

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const camion = db.prepare(`SELECT id, nombre FROM almacenes WHERE id = ? AND tipo = 'Camion' AND activo = 1`).get(idCamion);
      if (!camion) throw new Error('Selecciona un vehículo activo.');
      const producto = db.prepare(`SELECT nombre, precio_compra FROM productos WHERE id = ? AND activo = 1`).get(idProducto);
      if (!producto) throw new Error('Selecciona un producto activo.');

      const updateStock = db.prepare(`
        UPDATE inventario_stock SET cantidad = cantidad - ?
        WHERE id_almacen = ? AND id_producto = ? AND cantidad >= ?
      `).run(cantNum, idCamion, idProducto, cantNum);
      if (updateStock.changes === 0) {
        throw new Error('Cantidad insuficiente en el inventario a bordo del camión para registrar la merma.');
      }

      const res = db.prepare(`
        INSERT INTO mermas_camion (id_camion, id_producto, cantidad, motivo, fecha, id_usuario)
        VALUES (?, ?, ?, ?, datetime('now','localtime'), ?)
      `).run(idCamion, idProducto, cantNum, motivoTexto, idUsuario);

      InventoryService.registrarMovimientoKardex(db, { idProducto, idAlmacen: idCamion, tipoMovimiento: 'Merma', cantidad: -cantNum, referencia: `Merma en ${camion.nombre}: ${motivoTexto}`, idUsuario });

      // La mercancía dañada es una inversión perdida: se registra como GASTO al costo de adquisición.
      const costoMerma = cantNum * producto.precio_compra;
      const resGasto = db.prepare(`
        INSERT INTO gastos (fecha, categoria, concepto, monto, id_camion, id_usuario)
        VALUES (date('now','localtime'), 'Merma de Inventario', ?, ?, ?, ?)
      `).run(`${producto.nombre} (${cantNum} unidad(es)) - ${motivoTexto}`, costoMerma, idCamion, idUsuario);
      db.prepare(`UPDATE mermas_camion SET id_gasto = ? WHERE id = ?`).run(Number(resGasto.lastInsertRowid), Number(res.lastInsertRowid));

      db.exec('COMMIT;');
      return { exito: true, mermaId: res.lastInsertRowid, costoMerma };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Obtiene la hoja de carga/conduce de despacho de un camión.
   */
  static obtenerDetalleTransferencia(idTransferencia) {
    const db = getDatabaseConnection();
    const t = db.prepare(`
      SELECT t.*, a1.nombre as origen_nombre, a2.nombre as destino_nombre, a2.placa_camion, a2.chofer_asignado
      FROM transferencias_camion t
      JOIN almacenes a1 ON t.id_almacen_origen = a1.id
      JOIN almacenes a2 ON t.id_almacen_destino = a2.id
      WHERE t.id = ?
    `).get(idTransferencia);

    if (!t) return null;

    const detalles = db.prepare(`
      SELECT td.*, p.nombre as producto_nombre, p.codigo_interno
      FROM transferencia_detalles td
      JOIN productos p ON td.id_producto = p.id
      WHERE td.id_transferencia = ?
    `).all(idTransferencia);

    return { ...t, detalles };
  }

  /**
   * Descarga manualmente todo el inventario no vendido de un camión devolviéndolo al Almacén Central.
   */
  static descargarInventarioCamionCentral(idCamion) {
    const camionId = Number(idCamion);
    if (!Number.isSafeInteger(camionId) || camionId <= 1) throw new Error('El vehículo seleccionado no es válido.');
    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const camion = db.prepare(`SELECT id FROM almacenes WHERE id = ? AND tipo = 'Camion'`).get(camionId);
      if (!camion) throw new Error('No se encontró el vehículo.');
      const itemsRetornados = this._devolverStockACentral(db, camionId, 'Descarga manual a Central');
      db.exec('COMMIT;');
      return { exito: true, itemsRetornados };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Obtiene la lista de todos los vehículos/camiones de reparto activos.
   */
  static obtenerVehiculos() {
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT * FROM almacenes
      WHERE tipo = 'Camion' AND activo = 1
      ORDER BY id ASC
    `).all();
  }

  /**
   * Registra un nuevo vehículo/ruta en el sistema.
   */
  static registrarVehiculo(datosVehiculo) {
    const { nombre, placa = '', chofer = '' } = datosVehiculo;
    if (!nombre || !nombre.trim()) throw new Error('El nombre o alias del vehículo es obligatorio.');

    const db = getDatabaseConnection();
    const res = db.prepare(`
      INSERT INTO almacenes (nombre, tipo, placa_camion, chofer_asignado)
      VALUES (?, 'Camion', ?, ?)
    `).run(nombre.trim(), placa.trim(), chofer.trim());

    return { exito: true, vehiculoId: res.lastInsertRowid };
  }

  /**
   * Actualiza el nombre, placa o chofer asignado a un vehículo existente.
   */
  static actualizarVehiculo(datosVehiculo) {
    const { id, nombre, placa = '', chofer = '' } = datosVehiculo;
    if (!id || isNaN(id)) throw new Error('ID de vehículo no válido.');
    if (!nombre || !nombre.trim()) throw new Error('El nombre o alias del vehículo no puede estar vacío.');

    const db = getDatabaseConnection();
    db.prepare(`
      UPDATE almacenes
      SET nombre = ?, placa_camion = ?, chofer_asignado = ?
      WHERE id = ? AND tipo = 'Camion'
    `).run(nombre.trim(), placa.trim(), chofer.trim(), id);

    return { exito: true };
  }

  /**
   * Reporte unificado de cuadres: liquidaciones de camiones, cierres de caja POS y operaciones "en vivo"
   * (ventas de camiones que todavía no se han liquidado).
   */
  static obtenerReporteCuadresUnificados(filtros = {}) {
    const { fechaInicio = null, fechaFin = null, idAlmacen = null } = filtros;
    const db = getDatabaseConnection();

    // 1. Liquidaciones de camiones
    let sqlRutas = `
      SELECT
        cr.id,
        'Ruta / Camión' AS tipo_cuadre,
        COALESCE(cr.creado_en, cr.fecha_cuadre) AS fecha,
        a.nombre AS origen_nombre,
        COALESCE(e.nombre, a.chofer_asignado, 'Sin Chofer') AS responsable_nombre,
        cr.total_ventas_contado AS ventas_efectivo,
        COALESCE(cr.total_ventas_transferencia, 0) + COALESCE(cr.total_ventas_cheque, 0) AS ventas_transferencia,
        cr.total_ventas_credito AS ventas_credito,
        cr.total_ventas_contado AS efectivo_esperado,
        cr.efectivo_entregado,
        cr.diferencia_cuadre AS diferencia,
        cr.estado,
        cr.notas
      FROM cuadre_rutas cr
      JOIN almacenes a ON cr.id_camion = a.id
      LEFT JOIN empleados e ON cr.id_chofer = e.id
      WHERE 1=1
    `;
    const paramsRutas = [];
    if (fechaInicio) { sqlRutas += ` AND DATE(cr.fecha_cuadre) >= ?`; paramsRutas.push(fechaInicio); }
    if (fechaFin) { sqlRutas += ` AND DATE(cr.fecha_cuadre) <= ?`; paramsRutas.push(fechaFin); }
    if (idAlmacen) { sqlRutas += ` AND cr.id_camion = ?`; paramsRutas.push(idAlmacen); }
    const cuadresRuta = db.prepare(sqlRutas).all(...paramsRutas);

    // 2. Cierres de Caja POS
    let cuadresPOS = [];
    if (!idAlmacen || Number(idAlmacen) === 1) {
      let sqlPOS = `
        SELECT
          c.id,
          'Caja POS Central' AS tipo_cuadre,
          c.fecha_cierre AS fecha,
          'Almacén Central POS' AS origen_nombre,
          COALESCE(u.nombre, 'Cajero POS') AS responsable_nombre,
          c.total_ventas_efectivo AS ventas_efectivo,
          0 AS ventas_transferencia,
          c.total_ventas_credito AS ventas_credito,
          c.monto_esperado_efectivo AS efectivo_esperado,
          c.efectivo_contado_fisico AS efectivo_entregado,
          c.diferencia,
          c.estado,
          c.notas
        FROM cierres_caja_pos c
        LEFT JOIN usuarios u ON c.id_cajero = u.id
        WHERE 1=1
      `;
      const paramsPOS = [];
      if (fechaInicio) { sqlPOS += ` AND DATE(c.fecha_cierre) >= ?`; paramsPOS.push(fechaInicio); }
      if (fechaFin) { sqlPOS += ` AND DATE(c.fecha_cierre) <= ?`; paramsPOS.push(fechaFin); }
      cuadresPOS = db.prepare(sqlPOS).all(...paramsPOS);
    }

    // 3. Camiones con ventas pendientes de liquidar (en vivo)
    let sqlVivo = `
      SELECT
        v.id_almacen,
        a.nombre AS origen_nombre,
        a.chofer_asignado,
        COALESCE(SUM(CASE WHEN v.tipo_pago = 'Contado' THEN v.total ELSE 0 END), 0) AS ventas_efectivo,
        COALESCE(SUM(CASE WHEN v.tipo_pago IN ('Transferencia','Cheque') THEN v.total ELSE 0 END), 0) AS ventas_transferencia,
        COALESCE(SUM(CASE WHEN v.tipo_pago = 'Credito' THEN v.total ELSE 0 END), 0) AS ventas_credito,
        COUNT(v.id) AS total_facturas,
        MAX(DATE(v.fecha)) AS ultima_fecha
      FROM ventas v
      JOIN almacenes a ON v.id_almacen = a.id
      WHERE v.estado_venta = 'Completada' AND a.tipo = 'Camion' AND v.id_cuadre IS NULL
    `;
    const paramsVivo = [];
    if (fechaInicio) { sqlVivo += ` AND DATE(v.fecha) >= ?`; paramsVivo.push(fechaInicio); }
    if (fechaFin) { sqlVivo += ` AND DATE(v.fecha) <= ?`; paramsVivo.push(fechaFin); }
    if (idAlmacen) { sqlVivo += ` AND v.id_almacen = ?`; paramsVivo.push(idAlmacen); }
    sqlVivo += ` GROUP BY v.id_almacen`;

    const cuadresEnVivo = db.prepare(sqlVivo).all(...paramsVivo).map(v => ({
      id: `VIVO-${v.id_almacen}`,
      tipo_cuadre: 'Ruta / Camión (En Vivo)',
      fecha: v.ultima_fecha,
      origen_nombre: v.origen_nombre,
      responsable_nombre: v.chofer_asignado || 'Operaciones en Curso',
      ventas_efectivo: v.ventas_efectivo,
      ventas_transferencia: v.ventas_transferencia,
      ventas_credito: v.ventas_credito,
      efectivo_esperado: v.ventas_efectivo,
      efectivo_entregado: 0,
      diferencia: 0,
      estado: 'Pendiente de liquidar',
      notas: `${v.total_facturas} venta(s) pendientes de liquidar`,
      en_vivo: true
    }));

    // 4. Caja POS en vivo: ventas del Almacén Central de días sin cierre de caja
    let cuadresPOSVivo = [];
    if (!idAlmacen || Number(idAlmacen) === 1) {
      let sqlPosVivo = `
        SELECT DATE(v.fecha) AS fecha_dia,
          COALESCE(SUM(CASE WHEN v.tipo_pago = 'Contado' THEN v.total ELSE 0 END), 0) AS ventas_efectivo,
          COALESCE(SUM(CASE WHEN v.tipo_pago IN ('Transferencia','Cheque') THEN v.total ELSE 0 END), 0) AS ventas_transferencia,
          COALESCE(SUM(CASE WHEN v.tipo_pago = 'Credito' THEN v.total ELSE 0 END), 0) AS ventas_credito,
          COUNT(v.id) AS total_facturas
        FROM ventas v
        WHERE v.estado_venta = 'Completada' AND v.id_almacen = 1
      `;
      const paramsPosVivo = [];
      if (fechaInicio) { sqlPosVivo += ` AND DATE(v.fecha) >= ?`; paramsPosVivo.push(fechaInicio); }
      if (fechaFin) { sqlPosVivo += ` AND DATE(v.fecha) <= ?`; paramsPosVivo.push(fechaFin); }
      sqlPosVivo += ` GROUP BY DATE(v.fecha)`;
      const fechasConCierre = new Set(cuadresPOS.map(c => String(c.fecha || '').slice(0, 10)));
      cuadresPOSVivo = db.prepare(sqlPosVivo).all(...paramsPosVivo)
        .filter(v => !fechasConCierre.has(v.fecha_dia))
        .map(v => ({
          id: `VIVO-POS-${v.fecha_dia}`,
          tipo_cuadre: 'Caja POS (En Vivo)',
          fecha: v.fecha_dia,
          origen_nombre: 'Almacén Central POS',
          responsable_nombre: 'Operaciones en Curso',
          ventas_efectivo: v.ventas_efectivo,
          ventas_transferencia: v.ventas_transferencia,
          ventas_credito: v.ventas_credito,
          efectivo_esperado: v.ventas_efectivo,
          efectivo_entregado: v.ventas_efectivo,
          diferencia: 0,
          estado: 'En Vivo',
          notas: `${v.total_facturas} venta(s) en el día`,
          en_vivo: true
        }));
    }

    const todosCuadres = [...cuadresRuta, ...cuadresPOS, ...cuadresEnVivo, ...cuadresPOSVivo].sort((a, b) => {
      const fa = a.fecha ? String(a.fecha).replace('T', ' ') : '';
      const fb = b.fecha ? String(b.fecha).replace('T', ' ') : '';
      return fb.localeCompare(fa);
    });

    let totalVentasEfectivo = 0, totalVentasTransf = 0, totalVentasCredito = 0, totalEsperado = 0, totalEntregado = 0, totalDiferencia = 0;
    let exactos = 0, descalces = 0;
    todosCuadres.forEach(c => {
      totalVentasEfectivo += (c.ventas_efectivo || 0);
      totalVentasTransf += (c.ventas_transferencia || 0);
      totalVentasCredito += (c.ventas_credito || 0);
      totalEsperado += (c.efectivo_esperado || 0);
      totalEntregado += (c.efectivo_entregado || 0);
      totalDiferencia += (c.diferencia || 0);
      if (Math.abs(c.diferencia || 0) < 0.01) exactos++; else descalces++;
    });

    return {
      filtros: { fechaInicio, fechaFin, idAlmacen },
      resumen: {
        total_cuadres: todosCuadres.length,
        ventas_efectivo_total: totalVentasEfectivo,
        ventas_transferencia_total: totalVentasTransf,
        ventas_credito_total: totalVentasCredito,
        efectivo_esperado_total: totalEsperado,
        efectivo_entregado_total: totalEntregado,
        diferencia_total: totalDiferencia,
        cuadres_exactos: exactos,
        cuadres_descalce: descalces
      },
      cuadres: todosCuadres
    };
  }
}

module.exports = RouteService;
