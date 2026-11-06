const { getDatabaseConnection } = require('../../data/connection');

class FinanceService {
  /**
   * Registra un gasto operativo de la empresa (Ej. Combustible camión, Mantenimiento, Renta, etc.)
   */
  static registrarGasto(gastoData) {
    const {
      categoria,
      concepto,
      monto,
      fecha = null,
      ncfComprobante = null,
      rncProveedor = '',
      idCamion = null,
      idUsuario = 1
    } = gastoData;

    const montoNum = Number(monto);
    if (!categoria || !String(concepto || '').trim()) throw new Error('La categoría y el concepto del gasto son obligatorios.');
    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('El monto del gasto debe ser mayor que cero.');

    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      INSERT INTO gastos (fecha, categoria, concepto, monto, ncf_comprobante, rnc_proveedor, id_camion, id_usuario)
      VALUES (COALESCE(?, date('now','localtime')), ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(fecha || null, categoria, String(concepto).trim(), montoNum, ncfComprobante, rncProveedor, idCamion || null, idUsuario);
    return { exito: true, gastoId: res.lastInsertRowid };
  }

  static actualizarGasto(datos) {
    const { id, fecha, categoria, concepto, monto, ncfComprobante = null, rncProveedor = '', idCamion = null } = datos;
    const idNum = Number(id);
    const montoNum = Number(monto);
    if (!Number.isInteger(idNum) || idNum <= 0) throw new Error('ID de gasto no válido.');
    if (!fecha || !categoria || !String(concepto || '').trim()) throw new Error('Completa la fecha, categoría y concepto del gasto.');
    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('El monto del gasto debe ser mayor que cero.');

    const db = getDatabaseConnection();
    const result = db.prepare(`
      UPDATE gastos SET fecha = ?, categoria = ?, concepto = ?, monto = ?, ncf_comprobante = ?,
                        rnc_proveedor = ?, id_camion = ?
      WHERE id = ?
        AND LOWER(TRIM(COALESCE(categoria, ''))) NOT IN ('compras de inventario', 'compra de inventario')
    `).run(fecha, categoria, String(concepto).trim(), montoNum, ncfComprobante, rncProveedor, idCamion || null, idNum);
    if (!result.changes) throw new Error('No se encontró el gasto o corresponde a una compra de inventario.');
    return { exito: true };
  }

  /**
   * Obtiene la lista de gastos registrados.
   */
  static obtenerGastos(limit = 50) {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT g.*, a.nombre as camion_nombre
      FROM gastos g
      LEFT JOIN almacenes a ON g.id_camion = a.id
      WHERE LOWER(TRIM(COALESCE(g.categoria, ''))) NOT IN ('compras de inventario', 'compra de inventario')
      ORDER BY g.id DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Procesa el pago de nómina para un empleado.
   */
  static registrarPagoNomina(datosNomina) {
    const { idEmpleado, periodo, sueldoBruto, incentivoVentas = 0, descuentos = 0 } = datosNomina;
    const db = getDatabaseConnection();

    const sueldoNeto = (parseFloat(sueldoBruto) + parseFloat(incentivoVentas)) - parseFloat(descuentos);

    db.exec('BEGIN TRANSACTION;');
    try {
      const stmtNomina = db.prepare(`
        INSERT INTO nomina_pagos (id_empleado, periodo, sueldo_bruto, incentivo_ventas, descuentos, sueldo_neto)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const res = stmtNomina.run(idEmpleado, periodo, sueldoBruto, incentivoVentas, descuentos, sueldoNeto);

      // Registrar automáticamente como un gasto operativo
      const stmtGasto = db.prepare(`
        INSERT INTO gastos (fecha, categoria, concepto, monto, id_usuario)
        VALUES (date('now','localtime'), 'Nómina de Empleados', ?, ?, 1)
      `);
      stmtGasto.run(`Pago de Nómina (${periodo}) a Empleado ID ${idEmpleado}`, sueldoNeto);

      db.exec('COMMIT;');
      return { exito: true, nominaId: res.lastInsertRowid, sueldoNeto };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Registra un retiro de dividendos por parte del propietario.
   */
  static registrarRetiroDividendos(monto, concepto = 'Retiro de ganancias del propietario', idUsuario = 1, fecha = null) {
    const db = getDatabaseConnection();
    const balanceDisponibilidad = this.calcularBalanceFinancieroGeneral();
    const montoNum = Number(monto);

    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('El monto del retiro debe ser mayor que cero.');
    if (montoNum > balanceDisponibilidad.ganancia_neta_disponible) {
      throw new Error(`Monto del retiro (RD$ ${montoNum}) supera la ganancia neta disponible (RD$ ${balanceDisponibilidad.ganancia_neta_disponible}).`);
    }

    const stmt = db.prepare(`
      INSERT INTO dividendos (fecha, monto, concepto, id_usuario)
      VALUES (COALESCE(?, date('now','localtime')), ?, ?, ?)
    `);
    const res = stmt.run(fecha, montoNum, String(concepto || 'Retiro de ganancias del propietario').trim(), idUsuario);
    return { exito: true, dividendoId: res.lastInsertRowid };
  }

  static actualizarRetiroDividendos(datos) {
    const { id, fecha, monto, concepto } = datos;
    const idNum = Number(id);
    const montoNum = Number(monto);
    if (!Number.isInteger(idNum) || idNum <= 0) throw new Error('ID de dividendo no válido.');
    if (!fecha || !String(concepto || '').trim()) throw new Error('Completa la fecha y el concepto del retiro.');
    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('El monto del retiro debe ser mayor que cero.');

    const db = getDatabaseConnection();
    const actual = db.prepare(`SELECT monto FROM dividendos WHERE id = ?`).get(idNum);
    if (!actual) throw new Error('No se encontró el retiro de dividendo.');
    const disponibleConActual = this.calcularBalanceFinancieroGeneral().ganancia_neta_disponible + actual.monto;
    if (montoNum > disponibleConActual) {
      throw new Error(`El monto supera la utilidad disponible. Máximo permitido: RD$ ${disponibleConActual.toFixed(2)}.`);
    }
    db.prepare(`UPDATE dividendos SET fecha = ?, monto = ?, concepto = ? WHERE id = ?`)
      .run(fecha, montoNum, String(concepto).trim(), idNum);
    return { exito: true };
  }

  /**
   * Obtiene el historial de retiros de dividendos del propietario.
   */
  static obtenerDividendos(limit = 50) {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT d.*, u.nombre as usuario_nombre
      FROM dividendos d
      LEFT JOIN usuarios u ON d.id_usuario = u.id
      ORDER BY d.id DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * MOTOR FINANCIERO ÚNICO (lo usan Dashboard, Gastos y Dividendos, y Reportes y Contabilidad).
   *
   * Reglas de negocio:
   *  - El CAPITAL (capital inicial) NO es ganancia ni pérdida: se muestra aparte.
   *  - Comprar mercancía NO es un gasto: es inventario (capital convertido en mercancía).
   *    El costo de esa mercancía sólo pasa a resultados cuando se VENDE (Costo de Mercancía Vendida).
   *  - Ganancia bruta = Ventas netas - Costo de la mercancía vendida.
   *  - Gastos operativos = nómina, combustible, mantenimiento, alquiler, servicios, etc. (sin compras).
   *  - Mercancía dañada (merma) = pérdida de inversión: se resta como gasto aparte.
   *  - Ganancia neta = Ganancia bruta - Gastos operativos - Mermas.
   *  - Ganancia disponible = Ganancia neta - Dividendos retirados por el propietario.
   *  - Capital de trabajo = Capital inicial + Ganancia disponible (el dinero que sigue en el negocio).
   */
  static calcularResumen(filtros = {}) {
    const { fechaInicio = null, fechaFin = null, idAlmacen = null } = filtros;
    const db = getDatabaseConnection();

    const rango = (col, params) => {
      let sql = '';
      if (fechaInicio) { sql += ` AND DATE(${col}) >= ?`; params.push(fechaInicio); }
      if (fechaFin) { sql += ` AND DATE(${col}) <= ?`; params.push(fechaFin); }
      return sql;
    };

    // --- Ventas netas (sin ITBIS, después de descuento)
    const pV = [];
    let sqlV = `
      SELECT COALESCE(SUM(total), 0) AS total_ventas,
             COALESCE(SUM(subtotal - COALESCE(descuento, 0)), 0) AS subtotal_ventas,
             COALESCE(SUM(itbis_total), 0) AS itbis_cobrado,
             COALESCE(SUM(CASE WHEN tipo_pago = 'Credito' THEN total ELSE 0 END), 0) AS ventas_credito,
             COUNT(id) AS num_ventas
      FROM ventas WHERE estado_venta = 'Completada'`;
    sqlV += rango('fecha', pV);
    if (idAlmacen) { sqlV += ` AND id_almacen = ?`; pV.push(idAlmacen); }
    const ventas = db.prepare(sqlV).get(...pV);

    // --- Costo de la mercancía vendida (costo histórico al momento de cada venta)
    const pC = [];
    let sqlC = `
      SELECT COALESCE(SUM(vd.cantidad * COALESCE(vd.costo_unitario, p.precio_compra)), 0) AS costo_total
      FROM venta_detalles vd
      JOIN productos p ON vd.id_producto = p.id
      JOIN ventas v ON vd.id_venta = v.id
      WHERE v.estado_venta = 'Completada'`;
    sqlC += rango('v.fecha', pC);
    if (idAlmacen) { sqlC += ` AND v.id_almacen = ?`; pC.push(idAlmacen); }
    const costoMercancia = db.prepare(sqlC).get(...pC).costo_total;

    // --- Gastos (compras de inventario excluidas SIEMPRE)
    const pG = [];
    let sqlG = `
      SELECT categoria, COALESCE(SUM(monto), 0) AS total
      FROM gastos
      WHERE LOWER(TRIM(COALESCE(categoria, ''))) NOT IN ('compras de inventario', 'compra de inventario')`;
    sqlG += rango('fecha', pG);
    if (idAlmacen) { sqlG += ` AND id_camion = ?`; pG.push(idAlmacen); }
    sqlG += ` GROUP BY categoria ORDER BY total DESC`;
    const gastosPorCategoria = db.prepare(sqlG).all(...pG);

    const esMerma = (c) => String(c || '').toLowerCase().includes('merma');
    const mermas = gastosPorCategoria.filter(g => esMerma(g.categoria)).reduce((a, g) => a + g.total, 0);
    const gastosOperativos = gastosPorCategoria.filter(g => !esMerma(g.categoria)).reduce((a, g) => a + g.total, 0);

    // --- Compras de mercancía (informativo: es inversión en inventario, no gasto)
    const pCo = [];
    let sqlCo = `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(itbis_total), 0) AS itbis, COUNT(id) AS num FROM compras_inventario WHERE 1=1`;
    sqlCo += rango('fecha_compra', pCo);
    if (idAlmacen) { sqlCo += ` AND id_almacen = ?`; pCo.push(idAlmacen); }
    const compras = db.prepare(sqlCo).get(...pCo);

    // --- ITBIS deducible: el real de las compras + el estimado de gastos con comprobante fiscal
    const pI = [];
    let sqlI = `
      SELECT COALESCE(SUM(CASE WHEN ncf_comprobante IS NOT NULL AND TRIM(ncf_comprobante) != '' THEN (monto * 0.18 / 1.18) ELSE 0 END), 0) AS itbis
      FROM gastos
      WHERE LOWER(TRIM(COALESCE(categoria, ''))) NOT IN ('compras de inventario', 'compra de inventario')
        AND LOWER(TRIM(COALESCE(categoria, ''))) NOT LIKE '%merma%'`;
    sqlI += rango('fecha', pI);
    const itbisGastos = db.prepare(sqlI).get(...pI).itbis;
    const itbisDeducible = compras.itbis + itbisGastos;

    // --- Dividendos del propietario
    const pD = [];
    let sqlD = `SELECT COALESCE(SUM(monto), 0) AS total FROM dividendos WHERE 1=1`;
    sqlD += rango('fecha', pD);
    const dividendosPeriodo = db.prepare(sqlD).get(...pD).total;

    // --- Posición actual (no depende del período): capital, inventario y cuentas por cobrar
    const capitalInicial = db.prepare(`SELECT COALESCE(capital_inicial, 0) AS v FROM configuracion_empresa WHERE id = 1`).get()?.v || 0;
    let sqlInv = `SELECT COALESCE(SUM(s.cantidad * p.precio_compra), 0) AS valor, COALESCE(SUM(s.cantidad), 0) AS unidades
                  FROM inventario_stock s JOIN productos p ON p.id = s.id_producto WHERE p.activo = 1`;
    const pInv = [];
    if (idAlmacen) { sqlInv += ` AND s.id_almacen = ?`; pInv.push(idAlmacen); }
    const inv = db.prepare(sqlInv).get(...pInv);
    const cxc = db.prepare(`SELECT COALESCE(SUM(balance_pendiente), 0) AS v FROM cuentas_por_cobrar WHERE estado = 'Pendiente'`).get().v;

    const gananciaBruta = ventas.subtotal_ventas - costoMercancia;
    const gananciaNeta = gananciaBruta - gastosOperativos - mermas;
    const margenBrutoPct = ventas.subtotal_ventas > 0 ? (gananciaBruta / ventas.subtotal_ventas) * 100 : 0;

    // Acumulado histórico (para saber cuánto se puede retirar como dividendo)
    const historico = (!fechaInicio && !fechaFin && !idAlmacen) ? null : this.calcularResumen({});
    const base = historico || null;
    const gananciaNetaHistorica = base ? base.ganancia_neta : gananciaNeta;
    const dividendosHistoricos = base ? base.dividendos_retirados : dividendosPeriodo;
    const gananciaDisponible = gananciaNetaHistorica - dividendosHistoricos;

    return {
      fecha_inicio: fechaInicio || 'Inicio de Operaciones',
      fecha_fin: fechaFin || 'Presente',

      // CAPITAL (aparte de las ganancias)
      capital_inicial: capitalInicial,
      inventario_costo_actual: inv.valor,
      inventario_unidades: inv.unidades,
      cuentas_por_cobrar: cxc,
      capital_trabajo: capitalInicial + gananciaDisponible,
      retorno_sobre_capital_pct: capitalInicial > 0 ? (gananciaNetaHistorica / capitalInicial) * 100 : null,

      // RESULTADOS DEL PERÍODO
      ventas_totales: ventas.total_ventas,
      subtotal_ventas: ventas.subtotal_ventas,
      ventas_credito: ventas.ventas_credito,
      num_ventas: ventas.num_ventas,
      itbis_cobrado: ventas.itbis_cobrado,
      costo_mercancia: costoMercancia,
      ganancia_bruta: gananciaBruta,
      margen_bruto_pct: margenBrutoPct,
      gastos_operativos: gastosOperativos,
      mermas: mermas,
      total_gastos: gastosOperativos + mermas,
      ganancia_neta: gananciaNeta,
      ganancia_neta_periodo: gananciaNeta,
      gastos_por_categoria: gastosPorCategoria,

      // COMPRAS (inversión en mercancía, informativo)
      compras_mercancia: compras.total,
      compras_num: compras.num,

      // DIVIDENDOS
      dividendos_periodo: dividendosPeriodo,
      dividendos_retirados: dividendosHistoricos,
      ganancia_neta_total: gananciaNetaHistorica,
      ganancia_neta_disponible: gananciaDisponible,

      // ITBIS
      itbis_deducible: itbisDeducible,
      balance_itbis_estimado: Math.max(0, ventas.itbis_cobrado - itbisDeducible)
    };
  }

  /** Resumen acumulado de toda la operación (Dashboard / Gastos y Dividendos). */
  static calcularBalanceFinancieroGeneral() {
    const r = this.calcularResumen({});
    return { ...r, total_ventas: r.ventas_totales };
  }

  /** Estado de Resultados con filtros de fecha y almacén (Reportes y Contabilidad). */
  static obtenerEstadoResultadosContable(filtros = {}) {
    return this.calcularResumen(filtros);
  }
}

module.exports = FinanceService;
