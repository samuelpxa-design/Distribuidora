const NCFManager = require('../core/dgii/ncfManager');
const InventoryService = require('../core/inventory/inventoryService');
const SalesService = require('../core/sales/salesService');
const RouteService = require('../core/liquidation/routeService');
const FinanceService = require('../core/finance/financeService');
const CustomerService = require('../core/customers/customerService');
const PayrollService = require('../core/payroll/payrollService');
const NotificationService = require('../core/notifications/notificationService');
const ResetPasswordService = require('../../resetPasswordService');
const { getDatabaseConnection, resetDatabase } = require('../data/connection');
const { VERSION } = require('../config/constants');

class ApiController {
  /**
   * Manejador centralizado de peticiones de la interfaz local.
   */
  static handleRequest(action, payload = {}) {
    try {
      switch (action) {
        case 'get_app_version':
          return { status: 'ok', data: { version: VERSION } };

        // --- INFORMACIÓN GENERAL / DASHBOARD ---
        case 'get_dashboard_summary': {
          const db = getDatabaseConnection();
          const nowObj = new Date();
          const hoy = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}-${String(nowObj.getDate()).padStart(2, '0')}`;
          const inicioMes = `${hoy.slice(0, 7)}-01`;
          
          // 1. Métricas de Ventas
          const ventasHoy = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE DATE(fecha) = ? AND estado_venta = 'Completada'`).get(hoy).total;
          const facturasHoy = db.prepare(`SELECT COUNT(id) as total FROM ventas WHERE DATE(fecha) = ? AND estado_venta = 'Completada'`).get(hoy).total;
          
          const ventasMes = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE DATE(fecha) >= ? AND estado_venta = 'Completada'`).get(inicioMes).total;
          const facturasMes = db.prepare(`SELECT COUNT(id) as total FROM ventas WHERE DATE(fecha) >= ? AND estado_venta = 'Completada'`).get(inicioMes).total;
          
          const cxcPendientes = db.prepare(`SELECT COALESCE(SUM(balance_pendiente), 0) as total FROM cuentas_por_cobrar WHERE estado = 'Pendiente'`).get().total;
          const efectivoCajaHoy = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE DATE(fecha) = ? AND tipo_pago = 'Contado' AND estado_venta = 'Completada'`).get(hoy).total;
          
          const resumenFinanciero = FinanceService.calcularBalanceFinancieroGeneral();
          const resultadoMes = FinanceService.obtenerEstadoResultadosContable({ fechaInicio: inicioMes, fechaFin: hoy });

          // 2. Alertas de Inventario Bajo Mínimo
          const alertasStockBajo = db.prepare(`
            SELECT p.id, p.codigo_interno, p.nombre, p.stock_minimo,
                   COALESCE(SUM(s.cantidad), 0) as stock_actual
            FROM productos p
            LEFT JOIN inventario_stock s ON p.id = s.id_producto
            GROUP BY p.id
            HAVING stock_actual <= p.stock_minimo
            ORDER BY stock_actual ASC
          `).all();

          // 3. Alertas de Secuencias NCF
          const secuenciasNCF = NCFManager.obtenerTodasSecuencias();
          const alertasNCF = secuenciasNCF.filter(s => s.disponibles <= 20 || new Date(s.fecha_vencimiento) < new Date());

          // 4. Ventas Diarias Últimos 7 Días (Gráfico)
          const ventas7Dias = db.prepare(`
            SELECT DATE(fecha) as fecha, COALESCE(SUM(total), 0) as total
            FROM ventas
            WHERE estado_venta = 'Completada' AND DATE(fecha) >= DATE(?, '-6 days')
            GROUP BY DATE(fecha)
            ORDER BY DATE(fecha) ASC
          `).all(hoy);

          // 5. Ventas por Almacén / Vehículo
          const ventasPorAlmacen = db.prepare(`
            SELECT a.nombre as almacen_nombre, COALESCE(SUM(v.total), 0) as total
            FROM ventas v
            JOIN almacenes a ON v.id_almacen = a.id
            WHERE v.estado_venta = 'Completada'
            GROUP BY a.id
          `).all();

          // 6. Top 5 Productos
          const top5Productos = InventoryService.obtenerTopProductos(5, inicioMes, hoy);

          // 7. Estado de Vehículos
          const vehiculosStatus = db.prepare(`
            SELECT a.id, a.nombre, a.placa_camion, a.chofer_asignado,
                   COALESCE(SUM(v.total), 0) as ventas_hoy
            FROM almacenes a
            LEFT JOIN ventas v ON a.id = v.id_almacen AND DATE(v.fecha) = ? AND v.estado_venta = 'Completada'
            WHERE a.tipo = 'Camion' AND a.activo = 1
            GROUP BY a.id
          `).all(hoy);

          // 8. Camiones activos operando hoy
          const camionesActivosCount = vehiculosStatus.filter(v => v.ventas_hoy > 0).length;
          const camionesTotalesCount = vehiculosStatus.length;

          return {
            status: 'ok',
            data: {
              ventas_hoy: ventasHoy,
              facturas_hoy: facturasHoy,
              ventas_mes: ventasMes,
              facturas_mes: facturasMes,
              cxc_pendientes: cxcPendientes,
              efectivo_caja_hoy: efectivoCajaHoy,
              ganancia_disponible: resumenFinanciero.ganancia_neta_disponible,
              ganancia_neta_mes: resultadoMes.ganancia_neta_periodo,
              capital_inicial: resumenFinanciero.capital_inicial,
              inventario_costo_actual: resumenFinanciero.inventario_costo_actual,
              ganancia_bruta_mes: resultadoMes.ganancia_bruta,
              gastos_mes: resultadoMes.total_gastos,
              total_gastos: resumenFinanciero.total_gastos,
              alertas_stock_bajo: alertasStockBajo,
              alertas_ncf: alertasNCF,
              ventas_7_dias: ventas7Dias,
              ventas_por_almacen: ventasPorAlmacen,
              top_productos: top5Productos,
              vehiculos_status: vehiculosStatus,
              camiones_activos_count: camionesActivosCount,
              camiones_totales_count: camionesTotalesCount
            }
          };
        }

        // --- PRODUCTOS E INVENTARIO ---
        case 'get_productos':
          return { status: 'ok', data: InventoryService.obtenerProductos() };

        case 'get_categorias':
          return { status: 'ok', data: InventoryService.obtenerCategorias() };

        case 'registrar_producto':
          return { status: 'ok', data: InventoryService.registrarProducto(payload) };

        case 'actualizar_producto':
          return { status: 'ok', data: InventoryService.actualizarProducto(payload) };

        case 'eliminar_producto':
          return { status: 'ok', data: InventoryService.eliminarProducto(payload.idProducto) };

        case 'get_proveedores':
          return { status: 'ok', data: InventoryService.obtenerProveedores() };

        case 'registrar_proveedor':
          return { status: 'ok', data: InventoryService.registrarProveedor(payload) };

        case 'actualizar_proveedor':
          return { status: 'ok', data: InventoryService.actualizarProveedor(payload) };

        case 'eliminar_proveedor':
          return { status: 'ok', data: InventoryService.desactivarProveedor(payload.idProveedor) };

        case 'get_compras_proveedor':
          return { status: 'ok', data: InventoryService.obtenerHistorialComprasProveedor(payload.idProveedor) };

        case 'get_detalle_compra':
          return { status: 'ok', data: InventoryService.obtenerDetalleCompra(payload.idCompra) };

        case 'registrar_entrada_compra':
          return { status: 'ok', data: InventoryService.registrarEntradaCompra(payload) };

        case 'actualizar_entrada_compra':
          return { status: 'ok', data: InventoryService.actualizarEntradaCompra(payload) };

        case 'get_reporte_inventario':
          return { status: 'ok', data: InventoryService.obtenerReporteInventario(payload) };

        case 'cargar_camion': {
          const result = InventoryService.cargarCamion(
            payload.idAlmacenOrigen || 1,
            payload.idCamionDestino,
            payload.items,
            payload.idUsuario || 1
          );
          return { status: 'ok', data: result };
        }

        // --- VENTAS Y DGII ---
        case 'registrar_venta': {
          const result = SalesService.registrarVenta(payload);
          return { status: 'ok', data: result };
        }

        case 'asignar_ncf': {
          const result = SalesService.asignarNCFaVenta(payload.idVenta, payload.tipoNCF || 'B02');
          return { status: 'ok', data: result };
        }

        case 'get_ventas':
          return { status: 'ok', data: SalesService.obtenerVentas(payload.limit || 50) };

        case 'get_venta_detalle':
          return { status: 'ok', data: SalesService.obtenerVentaDetalle(payload.idVenta) };

        case 'editar_venta':
          return { status: 'ok', data: SalesService.editarVenta(payload) };

        case 'anular_venta':
          return { status: 'ok', data: SalesService.anularVenta(payload.idVenta, payload.motivo) };

        case 'eliminar_venta':
          return { status: 'ok', data: SalesService.eliminarVenta(payload.idVenta) };

        // --- CLIENTES Y CRÉDITOS ---
        case 'get_clientes':
          return { status: 'ok', data: CustomerService.obtenerClientes() };

        case 'registrar_cliente':
          return { status: 'ok', data: CustomerService.registrarCliente(payload) };

        case 'actualizar_cliente':
          return { status: 'ok', data: CustomerService.actualizarCliente(payload) };

        case 'eliminar_cliente':
          return { status: 'ok', data: CustomerService.eliminarCliente(payload.idCliente) };

        case 'get_cxc':
          return { status: 'ok', data: CustomerService.obtenerCuentasPorCobrar(payload.idCliente) };

        case 'registrar_cobro_cxc':
          return { status: 'ok', data: CustomerService.registrarCobroCliente(payload) };

        case 'get_pagos_cxc':
          return { status: 'ok', data: CustomerService.obtenerHistorialPagos(payload.idCliente) };

        case 'validar_rnc':
          return { status: 'ok', valido: NCFManager.validarRncCedula(payload.rnc) };

        case 'get_proximo_ncf':
          return { status: 'ok', data: NCFManager.obtenerProximoNCF(payload.tipoNCF) };

        case 'get_secuencias_ncf':
          return { status: 'ok', data: NCFManager.obtenerTodasSecuencias() };

        case 'actualizar_secuencia_ncf':
          return { status: 'ok', data: NCFManager.actualizarSecuenciaNCF(payload) };

        case 'get_reporte_607':
          return { status: 'ok', data: NCFManager.generarReporte607(payload.mes, payload.anio) };

        case 'get_reporte_606':
          return { status: 'ok', data: NCFManager.generarReporte606(payload.mes, payload.anio) };

        // --- LIQUIDACIÓN DE RUTAS DE CAMIONES ---
        case 'get_resumen_cuadre_camion':
          return { status: 'ok', data: RouteService.obtenerResumenCuadreCamion(payload.idCamion) };

        case 'cerrar_cuadre_ruta':
          return { status: 'ok', data: RouteService.cerrarCuadreRuta(payload) };

        case 'get_historial_cuadres':
          return { status: 'ok', data: RouteService.obtenerHistorialCuadres(payload.idCamion) };

        case 'get_reporte_cuadres':
          return { status: 'ok', data: RouteService.obtenerReporteCuadresUnificados(payload) };

        case 'registrar_merma_camion':
          return { status: 'ok', data: RouteService.registrarMermaCamion(payload) };

        case 'get_vehiculos':
          return { status: 'ok', data: RouteService.obtenerVehiculos() };

        case 'registrar_vehiculo':
          return { status: 'ok', data: RouteService.registrarVehiculo(payload) };

        case 'actualizar_vehiculo':
          return { status: 'ok', data: RouteService.actualizarVehiculo(payload) };

        case 'descargar_inventario_camion':
          return { status: 'ok', data: RouteService.descargarInventarioCamionCentral(payload.idCamion) };

        case 'get_detalle_transferencia':
          return { status: 'ok', data: RouteService.obtenerDetalleTransferencia(payload.idTransferencia) };

        // --- GASTOS, NÓMINA Y DIVIDENDOS ---
        case 'registrar_gasto':
          return { status: 'ok', data: FinanceService.registrarGasto(payload) };

        case 'actualizar_gasto':
          return { status: 'ok', data: FinanceService.actualizarGasto(payload) };

        case 'get_gastos':
          return { status: 'ok', data: FinanceService.obtenerGastos(payload.limit || 200) };

        case 'registrar_pago_nomina':
          return { status: 'ok', data: FinanceService.registrarPagoNomina(payload) };

        case 'registrar_retiro_dividendo':
          return { status: 'ok', data: FinanceService.registrarRetiroDividendos(payload.monto, payload.concepto, payload.idUsuario, payload.fecha) };

        case 'actualizar_retiro_dividendo':
          return { status: 'ok', data: FinanceService.actualizarRetiroDividendos(payload) };

        case 'get_dividendos':
          return { status: 'ok', data: FinanceService.obtenerDividendos(payload.limit || 200) };

        case 'get_balance_financiero':
          return { status: 'ok', data: FinanceService.calcularBalanceFinancieroGeneral() };

        case 'get_estado_resultados':
          return { status: 'ok', data: FinanceService.obtenerEstadoResultadosContable(payload) };

        case 'get_kardex_producto':
          return { status: 'ok', data: InventoryService.obtenerKardexProducto(payload.idProducto) };

        case 'get_top_productos':
          return { status: 'ok', data: InventoryService.obtenerTopProductos(payload.limit || 10) };

        case 'get_ranking_clientes':
          return { status: 'ok', data: InventoryService.obtenerRankingClientes(payload.limit || 10) };

        case 'get_resumen_caja_pos':
          return { status: 'ok', data: SalesService.obtenerResumenCajaActual(payload.idCajero || 1) };

        case 'registrar_cierre_caja_pos':
          return { status: 'ok', data: SalesService.registrarCierreCajaPOS(payload) };

        case 'get_cierres_caja_pos':
          return { status: 'ok', data: SalesService.obtenerCierresCajaPOS() };

        case 'get_configuracion_empresa': {
          const db = getDatabaseConnection();
          const config = db.prepare(`SELECT * FROM configuracion_empresa WHERE id = 1`).get() || {
            nombre_empresa: 'DISTRIBUIDORAS ROJAS PERALTA',
            rnc: '1-01-82934-1',
            telefono: '(809) 555-0199',
            email: 'contacto@rojasperalta.com',
            direccion: 'Av. Principal #45, Santo Domingo, Rep. Dom.',
            mensaje_factura: '¡Gracias por su compra en Distribuidoras Rojas Peralta!'
          };
          return { status: 'ok', data: config };
        }

        case 'guardar_configuracion_empresa': {
          const db = getDatabaseConnection();
          const { nombre_empresa, rnc, telefono, email, direccion, mensaje_factura } = payload;
          const capitalInicial = Number(payload.capital_inicial ?? 0);
          if (!nombre_empresa || !nombre_empresa.trim()) {
            throw new Error('El nombre de la empresa es obligatorio.');
          }
          if (!Number.isFinite(capitalInicial) || capitalInicial < 0) {
            throw new Error('El capital inicial debe ser un monto igual o mayor que cero.');
          }

          db.prepare(`
            UPDATE configuracion_empresa
            SET nombre_empresa = ?, rnc = ?, telefono = ?, email = ?, direccion = ?, mensaje_factura = ?, capital_inicial = ?
            WHERE id = 1
          `).run(nombre_empresa.trim(), (rnc || '').trim(), (telefono || '').trim(), (email || '').trim(), (direccion || '').trim(), (mensaje_factura || '').trim(), capitalInicial);

          return { status: 'ok', data: { exito: true } };
        }

        // --- MÓDULO DE NÓMINAS, EMPLEADOS Y ADELANTOS ---
        case 'get_empleados': {
          return { status: 'ok', data: PayrollService.obtenerEmpleados() };
        }

        case 'guardar_empleado':
        case 'actualizar_empleado': {
          return { status: 'ok', data: PayrollService.guardarEmpleado(payload) };
        }

        case 'desactivar_empleado': {
          return { status: 'ok', data: PayrollService.desactivarEmpleado(payload.idEmpleado) };
        }

        case 'registrar_adelanto_empleado': {
          return { status: 'ok', data: PayrollService.registrarAdelanto(payload) };
        }

        case 'get_adelantos_empleado': {
          return { status: 'ok', data: PayrollService.obtenerAdelantos() };
        }

        case 'preparar_nomina': {
          return { status: 'ok', data: PayrollService.prepararNomina(payload.frecuencia) };
        }

        case 'procesar_pago_nomina': {
          return { status: 'ok', data: PayrollService.procesarPagoNomina(payload) };
        }

        case 'get_historial_nominas': {
          return { status: 'ok', data: PayrollService.obtenerHistorialNominas() };
        }

        case 'check_remote_update': {
          const { execSync } = require('child_process');
          const path = require('path');
          const rootDir = path.join(__dirname, '../../');
          try {
            execSync('git fetch origin main', { cwd: rootDir, timeout: 6000, stdio: 'ignore' });
            const output = execSync('git status -uno', { cwd: rootDir, encoding: 'utf8' });
            const hasUpdate = output.includes('behind') || output.includes('atrás') || output.includes('atras') || output.includes('can be fast-forwarded');
            return { status: 'ok', updateAvailable: hasUpdate };
          } catch (e) {
            return { status: 'ok', updateAvailable: false };
          }
        }

        case 'apply_remote_update': {
          const { execSync } = require('child_process');
          const path = require('path');
          const rootDir = path.join(__dirname, '../../');
          try {
            const output = execSync('git pull origin main', { cwd: rootDir, encoding: 'utf8' });
            return { status: 'ok', message: output };
          } catch (e) {
            throw new Error(`Error al descargar actualización: ${e.message}`);
          }
        }

        case 'get_notificaciones': {
          return { status: 'ok', data: NotificationService.obtenerNotificaciones() };
        }

        case 'marcar_notificacion_leida': {
          return { status: 'ok', data: NotificationService.descartarNotificacion(payload.clave) };
        }

        case 'get_reset_password_status': {
          return { status: 'ok', data: { configurada: ResetPasswordService.isConfigured() } };
        }

        case 'set_reset_password': {
          return {
            status: 'ok',
            data: ResetPasswordService.configurePassword(payload.password, payload.confirmation)
          };
        }

        case 'reset_database': {
          if (!ResetPasswordService.isConfigured()) {
            throw new Error('Primero debes crear una contraseña exclusiva para el borrado.');
          }
          if (payload.confirmation !== 'BORRAR') {
            throw new Error('Debes confirmar el borrado escribiendo BORRAR.');
          }
          if (!ResetPasswordService.verifyPassword(payload.password)) {
            throw new Error('La contraseña de borrado es incorrecta.');
          }
          return { status: 'ok', data: resetDatabase() };
        }

        default:
          return { status: 'error', message: `Acción '${action}' no reconocida.` };
      }
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }
}

module.exports = ApiController;
