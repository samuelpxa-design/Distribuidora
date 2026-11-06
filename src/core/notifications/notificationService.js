const { getDatabaseConnection } = require('../../data/connection');

class NotificationService {
  /**
   * Genera y retorna el listado consolidado de alertas y notificaciones activas en tiempo real.
   */
  static obtenerNotificaciones() {
    const db = getDatabaseConnection();
    const notificaciones = [];

    // Obtener claves de notificaciones descartadas hoy
    let descartadas = new Set();
    try {
      const descartadasRows = db.prepare(`SELECT clave_notificacion FROM notificaciones_descartadas WHERE DATE(fecha_descarte) = CURRENT_DATE`).all();
      descartadas = new Set(descartadasRows.map(d => d.clave_notificacion));
    } catch (e) {}

    // 1. ALERTA: Stock bajo de producto (< 6 unidades)
    try {
      const prodsBajos = db.prepare(`
        SELECT id, codigo_interno, nombre, stock_total, unidad_medida
        FROM productos
        WHERE stock_total < 6
        ORDER BY stock_total ASC;
      `).all();

      prodsBajos.forEach(p => {
        const clave = `stock_bajo_${p.id}`;
        if (!descartadas.has(clave)) {
          notificaciones.push({
            id: clave,
            categoria: 'inventario',
            nivel: 'critica',
            titulo: 'Stock Crítico (< 6 Unidades)',
            mensaje: `El producto "${p.nombre}" (${p.codigo_interno}) solo tiene ${p.stock_total} ${p.unidad_medida} en stock disponible.`,
            accion_view: 'inventory',
            fecha: new Date().toISOString()
          });
        }
      });
    } catch (e) {}

    // 2. ALERTA: Cliente con crédito casi al tope (>= 85% de límite)
    try {
      const clientesCredito = db.prepare(`
        SELECT c.id, c.nombre, c.balance_pendiente, COALESCE(c.limite_credito, 50000.00) as limite_credito
        FROM clientes c
        WHERE c.balance_pendiente > 0
          AND c.balance_pendiente >= (COALESCE(c.limite_credito, 50000.00) * 0.85);
      `).all();

      clientesCredito.forEach(c => {
        const pct = Math.round((c.balance_pendiente / c.limite_credito) * 100);
        const clave = `credito_tope_${c.id}`;
        if (!descartadas.has(clave)) {
          notificaciones.push({
            id: clave,
            categoria: 'credito',
            nivel: pct >= 100 ? 'critica' : 'advertencia',
            titulo: pct >= 100 ? 'Límite de Crédito Superado' : 'Crédito de Cliente Casi al Tope',
            mensaje: `El cliente "${c.nombre}" adeuda RD$ ${c.balance_pendiente.toLocaleString('es-DO', { minimumFractionDigits: 2 })} (${pct}% de su límite).`,
            accion_view: 'customers',
            fecha: new Date().toISOString()
          });
        }
      });
    } catch (e) {}

    // 3. ALERTA: Adelantos pendientes de empleado superan el 80% de su sueldo base
    try {
      const empleadosAdelanto = db.prepare(`
        SELECT e.id, e.nombre, e.salario_base, e.sueldo_base,
               COALESCE(SUM(CASE WHEN a.estado = 'Pendiente' THEN a.monto ELSE 0 END), 0) as total_adelantos
        FROM empleados e
        LEFT JOIN adelantos_empleados a ON e.id = a.id_empleado
        WHERE e.activo = 1
        GROUP BY e.id
        HAVING total_adelantos >= (COALESCE(e.salario_base, e.sueldo_base, 0) * 0.80) AND total_adelantos > 0;
      `).all();

      empleadosAdelanto.forEach(emp => {
        const sueldo = emp.salario_base || emp.sueldo_base || 1;
        const pct = Math.round((emp.total_adelantos / sueldo) * 100);
        const clave = `adelanto_alto_${emp.id}`;
        if (!descartadas.has(clave)) {
          notificaciones.push({
            id: clave,
            categoria: 'payroll',
            nivel: 'advertencia',
            titulo: 'Adelantos de Sueldo Elevados',
            mensaje: `El empleado "${emp.nombre}" acumula RD$ ${emp.total_adelantos.toLocaleString('es-DO', { minimumFractionDigits: 2 })} en adelantos (${pct}% de su sueldo base).`,
            accion_view: 'payroll',
            fecha: new Date().toISOString()
          });
        }
      });
    } catch (e) {}

    // 4. ALERTA: Próxima fecha de pago a empleados (3 días o menos antes)
    try {
      const hoy = new Date();
      const diaHoy = hoy.getDate();

      const empleadosProximoPago = db.prepare(`
        SELECT id, nombre, puesto, COALESCE(dia_pago, 15) as dia_pago, frecuencia_pago
        FROM empleados
        WHERE activo = 1;
      `).all();

      empleadosProximoPago.forEach(emp => {
        const diaNom = emp.dia_pago || 15;
        let diasFaltantes = diaNom - diaHoy;
        if (diasFaltantes < 0) {
          const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
          diasFaltantes = (diasEnMes - diaHoy) + diaNom;
        }

        if (diasFaltantes >= 0 && diasFaltantes <= 3) {
          const clave = `proximo_pago_emp_${emp.id}_${hoy.getMonth()}`;
          if (!descartadas.has(clave)) {
            const txtTiempo = diasFaltantes === 0 ? '¡HOY es el día de pago!' : diasFaltantes === 1 ? 'mañana' : `en ${diasFaltantes} días`;
            notificaciones.push({
              id: clave,
              categoria: 'payroll',
              nivel: diasFaltantes === 0 ? 'critica' : 'info',
              titulo: 'Recordatorio de Pago de Nómina',
              mensaje: `El pago de nómina (${emp.frecuencia_pago}) para "${emp.nombre}" corresponde ${txtTiempo} (Día ${diaNom}).`,
              accion_view: 'payroll',
              fecha: new Date().toISOString()
            });
          }
        }
      });
    } catch (e) {}

    // 5. ALERTA: Gastos acumulados del mes cercanos o superando ventas
    try {
      const hoy = new Date();
      const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
      const resVentas = db.prepare(`SELECT COALESCE(SUM(total), 0) as total_ventas FROM ventas WHERE DATE(fecha_venta) >= ?`).get(inicioMes);
      const resGastos = db.prepare(`SELECT COALESCE(SUM(monto), 0) as total_gastos FROM gastos WHERE DATE(fecha) >= ?`).get(inicioMes);

      const ventasMes = resVentas ? resVentas.total_ventas : 0;
      const gastosMes = resGastos ? resGastos.total_gastos : 0;

      if (ventasMes > 0) {
        const pctGastos = Math.round((gastosMes / ventasMes) * 100);
        if (pctGastos >= 75) {
          const clave = `gastos_altos_mes_${hoy.getMonth()}`;
          if (!descartadas.has(clave)) {
            notificaciones.push({
              id: clave,
              categoria: 'finanzas',
              nivel: pctGastos >= 100 ? 'critica' : 'advertencia',
              titulo: pctGastos >= 100 ? 'Gastos Superan las Ventas del Mes' : 'Gastos Elevados del Mes',
              mensaje: `Los gastos del mes (RD$ ${gastosMes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}) equivalen al ${pctGastos}% de las ventas totales.`,
              accion_view: 'reports',
              fecha: new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {}

    // 6. ALERTA SUGERIDA: Cuentas por Cobrar Vencidas (> 30 días en mora)
    try {
      const hoy = new Date();
      const cxcVencidas = db.prepare(`
        SELECT c.id, cl.nombre as cliente_nombre, c.monto_pendiente, c.fecha_emision
        FROM cuentas_por_cobrar c
        JOIN clientes cl ON c.id_cliente = cl.id
        WHERE c.estado != 'Pagado'
          AND JULIANDAY('now') - JULIANDAY(c.fecha_emision) > 30;
      `).all();

      if (cxcVencidas.length > 0) {
        const totalMora = cxcVencidas.reduce((sum, item) => sum + item.monto_pendiente, 0);
        const clave = `cxc_vencidas_${hoy.getDate()}`;
        if (!descartadas.has(clave)) {
          notificaciones.push({
            id: clave,
            categoria: 'credito',
            nivel: 'critica',
            titulo: 'Facturas a Crédito en Mora (> 30 Días)',
            mensaje: `Hay ${cxcVencidas.length} cuenta(s) vencidas a crédito sumando RD$ ${totalMora.toLocaleString('es-DO', { minimumFractionDigits: 2 })} en mora.`,
            accion_view: 'customers',
            fecha: new Date().toISOString()
          });
        }
      }
    } catch (e) {}

    // 7. ALERTA SUGERIDA: Mercancía dañada / mermas reportadas hoy
    try {
      const hoy = new Date();
      const mermasHoy = db.prepare(`
        SELECT m.id, p.nombre as producto_nombre, m.cantidad, m.motivo
        FROM mermas_camion m
        JOIN productos p ON m.id_producto = p.id
        WHERE DATE(m.fecha) = CURRENT_DATE;
      `).all();

      if (mermasHoy.length > 0) {
        const cantMermas = mermasHoy.reduce((s, item) => s + item.cantidad, 0);
        const clave = `mermas_hoy_${hoy.getDate()}`;
        if (!descartadas.has(clave)) {
          notificaciones.push({
            id: clave,
            categoria: 'rutas',
            nivel: 'advertencia',
            titulo: 'Mermas / Mercancía Rota en Ruta',
            mensaje: `Se han reportado ${cantMermas} unidad(es) de mercancía dañada en ruta el día de hoy.`,
            accion_view: 'trucks',
            fecha: new Date().toISOString()
          });
        }
      }
    } catch (e) {}

    const resumen = {
      total: notificaciones.length,
      criticas: notificaciones.filter(n => n.nivel === 'critica').length,
      advertencias: notificaciones.filter(n => n.nivel === 'advertencia').length,
      info: notificaciones.filter(n => n.nivel === 'info' || n.nivel === 'exito').length
    };

    return { resumen, lista: notificaciones };
  }

  /**
   * Marca una notificación como descartada/leída para el día de hoy.
   */
  static descartarNotificacion(clave) {
    if (!clave) return { exito: false };
    const db = getDatabaseConnection();
    try {
      db.prepare(`INSERT OR IGNORE INTO notificaciones_descartadas (clave_notificacion) VALUES (?)`).run(clave);
      return { exito: true };
    } catch (e) {
      return { exito: false, error: e.message };
    }
  }
}

module.exports = NotificationService;