const { getDatabaseConnection } = require('../../data/connection');
const { NCF_TIPOS } = require('../../config/constants');

/**
 * Módulo de Gestión Fiscal DGII (República Dominicana)
 */
class NCFManager {
  /**
   * Valida un RNC (9 dígitos) o Cédula (11 dígitos) según el algoritmo Módulo 11 de la DGII.
   * @param {string} documento 
   * @returns {boolean}
   */
  static validarRncCedula(documento) {
    if (!documento) return false;
    const cleanDoc = documento.toString().replace(/\D/g, '');
    
    if (cleanDoc.length === 9) {
      // Validación de RNC (9 dígitos)
      const peso = [7, 9, 8, 6, 5, 4, 3, 2];
      let suma = 0;
      for (let i = 0; i < 8; i++) {
        suma += parseInt(cleanDoc[i], 10) * peso[i];
      }
      let resto = suma % 11;
      let digitoVerificador = resto === 0 ? 2 : resto === 1 ? 1 : 11 - resto;
      return digitoVerificador === parseInt(cleanDoc[8], 10);
    } else if (cleanDoc.length === 11) {
      // Validación de Cédula (11 dígitos)
      const peso = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
      let suma = 0;
      for (let i = 0; i < 10; i++) {
        let mult = parseInt(cleanDoc[i], 10) * peso[i];
        if (mult >= 10) mult = Math.floor(mult / 10) + (mult % 10);
        suma += mult;
      }
      let digitoVerificador = (10 - (suma % 10)) % 10;
      return digitoVerificador === parseInt(cleanDoc[10], 10);
    }
    return false;
  }

  /**
   * Genera el siguiente Comprobante Fiscal NCF válido para una venta.
   * @param {string} tipoNCF - Ej: 'B01', 'B02', 'B14', 'B15'
   * @returns {object} { ncf: string, secuenciaId: number }
   */
  static obtenerSiguienteNCF(tipoNCF = 'B02') {
    const db = getDatabaseConnection();
    
    const stmt = db.prepare(`
      SELECT * FROM ncf_secuencias 
      WHERE tipo_ncf = ? AND activo = 1 
      ORDER BY id ASC LIMIT 1
    `);
    const secuencia = stmt.get(tipoNCF);

    if (!secuencia) {
      throw new Error(`No existe una secuencia de comprobante fiscal activa para el tipo ${tipoNCF}.`);
    }

    if (secuencia.secuencia_actual > secuencia.secuencia_fin) {
      throw new Error(`La secuencia de comprobante fiscal para ${tipoNCF} ha alcanzado su límite máximo.`);
    }

    const hoy = require('../../config/dateUtil').hoyLocal();
    if (secuencia.fecha_vencimiento < hoy) {
      throw new Error(`La secuencia de comprobantes para ${tipoNCF} se encuentra vencida desde ${secuencia.fecha_vencimiento}.`);
    }

    // Formatear el NCF de 11 caracteres (ej. B0100000001)
    const numeroPadded = secuencia.secuencia_actual.toString().padStart(8, '0');
    const ncfGenerado = `${secuencia.tipo_ncf}${numeroPadded}`;

    // Incrementar la secuencia en la base de datos
    const updateStmt = db.prepare(`
      UPDATE ncf_secuencias 
      SET secuencia_actual = secuencia_actual + 1 
      WHERE id = ?
    `);
    updateStmt.run(secuencia.id);

    const restantes = secuencia.secuencia_fin - secuencia.secuencia_actual;
    let alertaRestantes = null;
    if (restantes <= 50) {
      alertaRestantes = `Quedan únicamente ${restantes} NCF disponibles para ${tipoNCF}. Solicitud de renovación requerida ante la DGII.`;
    }

    return {
      ncf: ncfGenerado,
      secuenciaId: secuencia.id,
      tipoNCF: secuencia.tipo_ncf,
      alertaRestantes
    };
  }

  /**
   * Previsualiza el próximo NCF sin incrementar la secuencia en la base de datos.
   * @param {string} tipoNCF 
   */
  static obtenerProximoNCF(tipoNCF = 'B02') {
    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      SELECT * FROM ncf_secuencias 
      WHERE tipo_ncf = ? AND activo = 1 
      ORDER BY id ASC LIMIT 1
    `);
    const secuencia = stmt.get(tipoNCF);

    if (!secuencia) {
      return { ncf: 'SIN SECUENCIA', disponibles: 0, vencimiento: 'N/A' };
    }

    const numeroPadded = secuencia.secuencia_actual.toString().padStart(8, '0');
    const ncf = `${secuencia.tipo_ncf}${numeroPadded}`;
    const disponibles = secuencia.secuencia_fin - secuencia.secuencia_actual + 1;

    return {
      ncf,
      tipoNCF: secuencia.tipo_ncf,
      descripcion: secuencia.descripcion,
      disponibles,
      vencimiento: secuencia.fecha_vencimiento
    };
  }

  /**
   * Obtiene la lista completa de secuencias NCF configuradas en el sistema.
   */
  static obtenerTodasSecuencias() {
    const db = getDatabaseConnection();
    const secuencias = db.prepare(`SELECT * FROM ncf_secuencias WHERE activo = 1 ORDER BY id ASC`).all();
    return secuencias.map(s => {
      const numeroPadded = s.secuencia_actual.toString().padStart(8, '0');
      return {
        ...s,
        proximo_ncf: `${s.tipo_ncf}${numeroPadded}`,
        disponibles: s.secuencia_fin - s.secuencia_actual + 1
      };
    });
  }

  /**
   * Actualiza los valores autorizados de una secuencia NCF (Secuencia Actual, Inicio, Fin y Vencimiento).
   */
  static actualizarSecuenciaNCF(datosSecuencia) {
    const { id, secuenciaActual, secuenciaInicio, secuenciaFin, fechaVencimiento } = datosSecuencia;

    if (!id || isNaN(secuenciaActual) || isNaN(secuenciaInicio) || isNaN(secuenciaFin) || !fechaVencimiento) {
      throw new Error('Todos los campos de la secuencia NCF son obligatorios y deben ser válidos.');
    }

    if (parseInt(secuenciaActual, 10) > parseInt(secuenciaFin, 10)) {
      throw new Error('La secuencia actual no puede ser mayor que la secuencia final autorizada.');
    }

    const db = getDatabaseConnection();
    const stmt = db.prepare(`
      UPDATE ncf_secuencias
      SET secuencia_actual = ?, secuencia_inicio = ?, secuencia_fin = ?, fecha_vencimiento = ?
      WHERE id = ?
    `);

    stmt.run(parseInt(secuenciaActual, 10), parseInt(secuenciaInicio, 10), parseInt(secuenciaFin, 10), fechaVencimiento, id);
    return { exito: true };
  }

  /**
   * Genera la matriz de datos para el reporte 607 (Ventas de bienes y servicios) de la DGII.
   * @param {number} mes 
   * @param {number} anio 
   */
  static generarReporte607(mes, anio) {
    const db = getDatabaseConnection();
    const mesStr = mes.toString().padStart(2, '0');
    const fechaInicio = `${anio}-${mesStr}-01`;
    const fechaFin = `${anio}-${mesStr}-31`;

    const stmt = db.prepare(`
      SELECT 
        COALESCE(rnc_cliente, 'CONSUMIDOR') as rnc_cedula,
        CASE WHEN rnc_cliente IS NULL OR LENGTH(rnc_cliente) < 9 THEN 2 ELSE 1 END as tipo_identificacion,
        ncf,
        '' as ncf_modificado,
        strftime('%Y%m%d', fecha) as fecha_comprobante,
        subtotal,
        itbis_total,
        total,
        tipo_pago
      FROM ventas
      WHERE DATE(fecha) BETWEEN ? AND ? AND estado_venta = 'Completada'
        AND estado_fiscal = 'Facturada NCF' AND ncf NOT LIKE 'SIN NCF%' AND ncf != 'PENDIENTE'
      ORDER BY fecha ASC
    `);

    return stmt.all(fechaInicio, fechaFin);
  }

  /**
   * Genera la matriz de datos para el reporte 606 (Compras y gastos) de la DGII.
   * @param {number} mes 
   * @param {number} anio 
   */
  static generarReporte606(mes, anio) {
    const db = getDatabaseConnection();
    const mesStr = mes.toString().padStart(2, '0');
    const fechaInicio = `${anio}-${mesStr}-01`;
    const fechaFin = `${anio}-${mesStr}-31`;

    const stmt = db.prepare(`
      SELECT 
        COALESCE(rnc_proveedor, '') as rnc_cedula,
        ncf_comprobante as ncf,
        strftime('%Y%m%d', fecha) as fecha_comprobante,
        monto as subtotal,
        0 as itbis_facturado,
        monto as total,
        categoria
      FROM gastos
      WHERE DATE(fecha) BETWEEN ? AND ? AND ncf_comprobante IS NOT NULL AND TRIM(ncf_comprobante) != ''
      ORDER BY fecha ASC
    `);

    return stmt.all(fechaInicio, fechaFin);
  }
}

module.exports = NCFManager;
