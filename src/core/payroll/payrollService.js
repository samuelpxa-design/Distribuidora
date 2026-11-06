const { getDatabaseConnection } = require('../../data/connection');

class PayrollService {
  /**
   * Obtiene la lista completa de empleados activos con saldo de adelantos acumulados.
   */
  static obtenerEmpleados() {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT 
        e.*,
        COALESCE(SUM(CASE WHEN a.estado = 'Pendiente' THEN a.monto ELSE 0 END), 0) as adelantos_pendientes,
        COALESCE(COUNT(CASE WHEN a.estado = 'Pendiente' THEN a.id END), 0) as total_adelantos_count
      FROM empleados e
      LEFT JOIN adelantos_empleados a ON e.id = a.id_empleado
      WHERE e.activo = 1
      GROUP BY e.id
      ORDER BY e.nombre ASC;
    `);
    return stmt.all();
  }

  /**
   * Registra o actualiza un empleado.
   */
  static guardarEmpleado(data) {
    const {
      id = null,
      cedula = '',
      nombre,
      puesto,
      telefono = '',
      salarioBase = 0,
      frecuenciaPago = 'Quincenal',
      diaPago = 15,
      fechaIngreso = null
    } = data;

    if (!nombre || !puesto) {
      throw new Error('El nombre y el puesto del empleado son obligatorios.');
    }

    const db = getDatabaseConnection();
    const cedulaVal = (cedula && cedula.trim()) ? cedula.trim() : null;
    const diaVal = parseInt(diaPago, 10) || 15;

    if (id) {
      db.prepare(`
        UPDATE empleados
        SET cedula = ?, nombre = ?, puesto = ?, telefono = ?, salario_base = ?, frecuencia_pago = ?, dia_pago = ?
        WHERE id = ?
      `).run(cedulaVal, nombre, puesto, telefono, salarioBase, frecuenciaPago, diaVal, id);
      return { exito: true, empleadoId: id };
    } else {
      const res = db.prepare(`
        INSERT INTO empleados (cedula, nombre, puesto, telefono, salario_base, frecuencia_pago, dia_pago, fecha_ingreso)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE))
      `).run(cedulaVal, nombre, puesto, telefono, salarioBase, frecuenciaPago, diaVal, fechaIngreso);
      return { exito: true, empleadoId: res.lastInsertRowid };
    }
  }

  /**
   * Desactiva a un empleado.
   */
  static desactivarEmpleado(idEmpleado) {
    const db = getDatabaseConnection();
    db.prepare(`UPDATE empleados SET activo = 0 WHERE id = ?`).run(idEmpleado);
    return { exito: true };
  }

  /**
   * Registra un adelanto de sueldo a un empleado e inserta automáticamente el gasto en la tabla gastos.
   */
  static registrarAdelanto(data) {
    const { idEmpleado, monto, concepto = 'Adelanto de Sueldo' } = data;

    const montoVal = parseFloat(monto);
    if (!idEmpleado || isNaN(montoVal) || montoVal <= 0) {
      throw new Error('Ingresa un empleado válido y un monto de adelanto mayor a RD$ 0.00.');
    }

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const emp = db.prepare(`SELECT * FROM empleados WHERE id = ? AND activo = 1`).get(idEmpleado);
      if (!emp) throw new Error('Empleado no encontrado o inactivo.');

      const conceptoGasto = `Adelanto de Sueldo: ${emp.nombre} - ${concepto}`;

      // 1. Insertar gasto operativo
      const resGasto = db.prepare(`
        INSERT INTO gastos (fecha, categoria, concepto, monto)
        VALUES (date('now','localtime'), ?, ?, ?)
      `).run('Adelanto de Nómina', conceptoGasto, montoVal);

      const idGasto = resGasto.lastInsertRowid;

      // 2. Insertar registro de adelanto
      const resAdelanto = db.prepare(`
        INSERT INTO adelantos_empleados (id_empleado, monto, concepto, estado, id_gasto, fecha)
        VALUES (?, ?, ?, 'Pendiente', ?, datetime('now','localtime'))
      `).run(idEmpleado, montoVal, concepto, idGasto);

      db.exec('COMMIT;');
      return { exito: true, adelantoId: resAdelanto.lastInsertRowid, gastoId: idGasto };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Prepara la prenómina por frecuencia calculando salarios devengados y adelantos a descontar.
   */
  static prepararNomina(frecuencia = 'Quincenal') {
    const db = getDatabaseConnection();
    let sql = `SELECT * FROM empleados WHERE activo = 1`;
    const params = [];

    if (frecuencia && frecuencia !== 'Todas') {
      sql += ` AND frecuencia_pago = ?`;
      params.push(frecuencia);
    }
    sql += ` ORDER BY nombre ASC;`;

    const empleados = db.prepare(sql).all(...params);

    return empleados.map(emp => {
      const salarioBase = parseFloat(emp.salario_base) || 0;
      
      // El salario_base corresponde DIRECTAMENTE a la frecuencia acordada:
      // Si es Semanal, el sueldo por semana es salarioBase.
      // Si es Quincenal, el sueldo por quincena es salarioBase.
      // Si es Mensual, el sueldo por mes es salarioBase.
      // Si es Diario, el sueldo por día es salarioBase.
      const salarioPeriodo = salarioBase;

      const adelantos = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as total
        FROM adelantos_empleados
        WHERE id_empleado = ? AND estado = 'Pendiente'
      `).get(emp.id);

      const totalAdelantos = parseFloat(adelantos ? adelantos.total : 0);
      const salarioNeto = Math.max(0, salarioPeriodo - totalAdelantos);

      return {
        id_empleado: emp.id,
        nombre: emp.nombre,
        cedula: emp.cedula,
        puesto: emp.puesto,
        frecuencia_pago: emp.frecuencia_pago,
        salario_base: salarioBase,
        salario_bruto: salarioPeriodo,
        total_adelantos: totalAdelantos,
        salario_neto: salarioNeto
      };
    });
  }

  /**
   * Procesa la transacción de pago de nómina, liquida los adelantos y registra el gasto operativo.
   */
  static procesarPagoNomina(payload) {
    const {
      idEmpleado,
      frecuencia,
      periodoCierre = 'Nómina Regular',
      salarioBruto,
      totalAdelantos = 0,
      salarioNeto,
      notas = ''
    } = payload;

    if (!idEmpleado || isNaN(salarioNeto)) {
      throw new Error('Datos de pago de nómina no válidos.');
    }

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const emp = db.prepare(`SELECT * FROM empleados WHERE id = ?`).get(idEmpleado);
      if (!emp) throw new Error('Empleado no encontrado.');

      const conceptoGasto = `Pago de Nómina (${frecuencia}): ${emp.nombre} - Periodo: ${periodoCierre}`;

      // 1. Insertar gasto operativo por el salario neto entregado
      const resGasto = db.prepare(`
        INSERT INTO gastos (fecha, categoria, concepto, monto)
        VALUES (date('now','localtime'), ?, ?, ?)
      `).run('Nómina y Sueldos', conceptoGasto, salarioNeto);

      const idGasto = resGasto.lastInsertRowid;

      // 2. Insertar registro en pagos_nomina
      const resNomina = db.prepare(`
        INSERT INTO pagos_nomina (id_empleado, frecuencia, periodo_cierre, salario_bruto, total_adelantos, salario_neto, notas, id_gasto, fecha_pago)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `).run(idEmpleado, frecuencia, periodoCierre, salarioBruto, totalAdelantos, salarioNeto, notas, idGasto);

      const idPagoNomina = resNomina.lastInsertRowid;

      // 3. Marcar adelantos del empleado como descontados/liquidados
      db.prepare(`
        UPDATE adelantos_empleados
        SET estado = 'Descontado', id_pago_nomina = ?
        WHERE id_empleado = ? AND estado = 'Pendiente'
      `).run(idPagoNomina, idEmpleado);

      db.exec('COMMIT;');
      return { exito: true, pagoNominaId: idPagoNomina, totalPagado: salarioNeto };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Obtiene la lista de adelantos registrados en el sistema.
   */
  static obtenerAdelantos() {
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT a.*, e.nombre as empleado_nombre, e.puesto as empleado_puesto
      FROM adelantos_empleados a
      JOIN empleados e ON a.id_empleado = e.id
      ORDER BY a.id DESC
      LIMIT 100;
    `).all();
  }

  /**
   * Obtiene el historial general de pagos de nómina procesados.
   */
  static obtenerHistorialNominas() {
    const db = getDatabaseConnection();
    return db.prepare(`
      SELECT p.*, e.nombre as empleado_nombre, e.cedula as empleado_cedula, e.puesto as empleado_puesto
      FROM pagos_nomina p
      JOIN empleados e ON p.id_empleado = e.id
      ORDER BY p.id DESC
      LIMIT 100;
    `).all();
  }
}

module.exports = PayrollService;
