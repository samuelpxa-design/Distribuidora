const { getDatabaseConnection } = require('../../data/connection');
const NCFManager = require('../dgii/ncfManager');

class CustomerService {
  /**
   * Obtiene la lista completa de clientes registrados.
   */
  static obtenerClientes() {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT * FROM clientes
      ORDER BY id ASC
    `);
    return stmt.all();
  }

  /**
   * Registra un nuevo cliente. La identificación fiscal es opcional; si se incluye, debe tener formato válido.
   */
  static registrarCliente(clienteData) {
    const {
      rncCedula,
      nombre,
      telefono = '',
      direccion = '',
      tipoNcfDefecto = 'B02',
      limiteCredito = 0.00,
      diasCredito = 30
    } = clienteData;

    if (!nombre || !nombre.trim()) {
      throw new Error('El nombre o razón social del cliente es obligatorio.');
    }

    const cleanRnc = (rncCedula || '').replace(/\D/g, '');
    if (cleanRnc && cleanRnc.length !== 9 && cleanRnc.length !== 11) {
      throw new Error(`El RNC o Cédula '${rncCedula}' debe tener 9 dígitos (RNC) u 11 dígitos (Cédula).`);
    }

    const db = getDatabaseConnection();

    // Verificar si ya existe
    const existStmt = db.prepare(`SELECT id FROM clientes WHERE rnc_cedula = ? AND ? != ''`);
    const existe = existStmt.get(cleanRnc, cleanRnc);
    if (existe) {
      throw new Error(`Ya existe un cliente registrado con el RNC/Cédula ${cleanRnc}.`);
    }

    const stmt = db.prepare(`
      INSERT INTO clientes (rnc_cedula, tipo_ncf_defecto, nombre, telefono, direccion, limite_credito, dias_credito)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(cleanRnc, tipoNcfDefecto, nombre.trim(), telefono, direccion, limiteCredito, diasCredito);
    return { exito: true, clienteId: res.lastInsertRowid };
  }

  /**
   * Obtiene las cuentas por cobrar pendientes (deudas a crédito de clientes).
   */
  static obtenerCuentasPorCobrar(idCliente = null) {
    const db = getDatabaseConnection();
    let sql = `
      SELECT cxc.*, c.nombre as cliente_nombre, c.rnc_cedula, v.ncf, v.fecha as fecha_venta
      FROM cuentas_por_cobrar cxc
      JOIN clientes c ON cxc.id_cliente = c.id
      JOIN ventas v ON cxc.id_venta = v.id
    `;
    const params = [];
    if (idCliente) {
      sql += ` WHERE cxc.id_cliente = ?`;
      params.push(idCliente);
    }
    sql += ` ORDER BY cxc.id DESC`;
    return db.prepare(sql).all(...params);
  }

  /**
   * Registra un cobro o abono a cuenta por cobrar y actualiza saldos de cliente y cuenta.
   */
  static registrarCobroCliente(cobroData) {
    const { idCuentaCobrar, monto, metodoPago = 'Efectivo', numeroRecibo = null, notas = '' } = cobroData;

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      throw new Error('Ingresa un monto de cobro/abono válido mayor a 0.');
    }

    const db = getDatabaseConnection();
    db.exec('BEGIN IMMEDIATE;');

    try {
      const cxc = db.prepare(`SELECT * FROM cuentas_por_cobrar WHERE id = ?`).get(idCuentaCobrar);
      if (!cxc) {
        throw new Error(`No se encontró la cuenta por cobrar #${idCuentaCobrar}.`);
      }

      if (cxc.estado === 'Pagado' || cxc.balance_pendiente <= 0) {
        throw new Error(`La cuenta por cobrar #${idCuentaCobrar} ya fue pagada en su totalidad.`);
      }

      if (montoNum > cxc.balance_pendiente) {
        throw new Error(`El monto del abono (RD$ ${montoNum.toFixed(2)}) supera el balance pendiente de la factura (RD$ ${cxc.balance_pendiente.toFixed(2)}).`);
      }

      const nuevoBalance = cxc.balance_pendiente - montoNum;
      const nuevoMontoPagado = cxc.monto_pagado + montoNum;
      const nuevoEstado = nuevoBalance <= 0.01 ? 'Pagado' : 'Pendiente';

      // 1. Actualizar cuenta por cobrar
      db.prepare(`
        UPDATE cuentas_por_cobrar
        SET monto_pagado = ?, balance_pendiente = ?, estado = ?
        WHERE id = ?
      `).run(nuevoMontoPagado, Math.max(0, nuevoBalance), nuevoEstado, idCuentaCobrar);

      // 2. Actualizar balance general del cliente
      db.prepare(`
        UPDATE clientes
        SET balance_pendiente = MAX(0, balance_pendiente - ?)
        WHERE id = ?
      `).run(montoNum, cxc.id_cliente);

      // 3. Generar número de recibo de ingreso si no fue provisto
      let nRecibo = numeroRecibo;
      if (!nRecibo) {
        const count = db.prepare(`SELECT COUNT(*) as total FROM pagos_clientes`).get().total + 1;
        nRecibo = `RI-${count.toString().padStart(6, '0')}`;
      }

      // 4. Insertar registro de pago
      const resPago = db.prepare(`
        INSERT INTO pagos_clientes (id_cuenta_cobrar, monto, metodo_pago, numero_recibo, notas)
        VALUES (?, ?, ?, ?, ?)
      `).run(idCuentaCobrar, montoNum, metodoPago, nRecibo, notas);

      db.exec('COMMIT;');

      return {
        exito: true,
        pagoId: resPago.lastInsertRowid,
        numeroRecibo: nRecibo,
        balancePendienteRestante: Math.max(0, nuevoBalance)
      };
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Obtiene el historial completo de pagos/abonos realizados por clientes.
   */
  static obtenerHistorialPagos(idCliente = null) {
    const db = getDatabaseConnection();
    let sql = `
      SELECT p.*, cxc.id_venta, cxc.id_cliente, c.nombre as cliente_nombre
      FROM pagos_clientes p
      JOIN cuentas_por_cobrar cxc ON p.id_cuenta_cobrar = cxc.id
      JOIN clientes c ON cxc.id_cliente = c.id
    `;
    const params = [];
    if (idCliente) {
      sql += ` WHERE cxc.id_cliente = ?`;
      params.push(idCliente);
    }
    sql += ` ORDER BY p.id DESC`;
    return db.prepare(sql).all(...params);
  }

  /**
   * Actualiza la información de un cliente existente.
   */
  static actualizarCliente(clienteData) {
    const { id, rncCedula, nombre, telefono = '', direccion = '', tipoNcfDefecto = 'B02', limiteCredito = 0.00 } = clienteData;

    if (!id || isNaN(id)) throw new Error('ID de cliente no válido.');
    if (!nombre || !nombre.trim()) throw new Error('El nombre del cliente es obligatorio.');
    const cleanRnc = (rncCedula || '').replace(/\D/g, '');
    if (cleanRnc && cleanRnc.length !== 9 && cleanRnc.length !== 11) {
      throw new Error(`El RNC o Cédula '${rncCedula}' debe tener 9 dígitos (RNC) u 11 dígitos (Cédula).`);
    }
    const db = getDatabaseConnection();

    // Verificar duplicado
    const existStmt = db.prepare(`SELECT id FROM clientes WHERE rnc_cedula = ? AND id != ? AND ? != ''`);
    if (existStmt.get(cleanRnc, id, cleanRnc)) {
      throw new Error(`El RNC/Cédula ${cleanRnc} ya pertenece a otro cliente.`);
    }

    db.prepare(`
      UPDATE clientes
      SET rnc_cedula = ?, tipo_ncf_defecto = ?, nombre = ?, telefono = ?, direccion = ?, limite_credito = ?
      WHERE id = ?
    `).run(cleanRnc, tipoNcfDefecto, nombre.trim(), telefono, direccion, limiteCredito, id);

    return { exito: true };
  }

  /**
   * Elimina un cliente si no tiene deudas pendientes activas.
   */
  static eliminarCliente(idCliente) {
    if (!idCliente || isNaN(idCliente)) throw new Error('ID de cliente no válido.');
    if (parseInt(idCliente, 10) === 1) throw new Error('No se puede eliminar el cliente predeterminado CONSUMIDOR FINAL.');

    const db = getDatabaseConnection();
    
    // Verificar CXC pendientes
    const cxcCount = db.prepare(`SELECT COUNT(*) as total FROM cuentas_por_cobrar WHERE id_cliente = ? AND balance_pendiente > 0`).get(idCliente).total;
    if (cxcCount > 0) {
      throw new Error('No se puede eliminar este cliente porque tiene cuentas a crédito (CXC) pendientes de cobro.');
    }

    db.prepare(`DELETE FROM clientes WHERE id = ?`).run(idCliente);
    return { exito: true };
  }
}

module.exports = CustomerService;
