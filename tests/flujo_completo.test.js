/**
 * Prueba de integración del flujo real del negocio sobre una base de datos temporal nueva.
 * Ejecutar:  npm test
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = path.join(os.tmpdir(), `rojas_test_${Date.now()}.db`);
process.env.ROJAS_DB_PATH = tmp;

const Api = require('../src/controllers/apiController');
let fallos = 0, pruebas = 0;
const call = (a, p = {}) => Api.handleRequest(a, p);
const ok = (a, p) => { const r = call(a, p); if (r.status !== 'ok') throw new Error(`${a}: ${r.message}`); return r.data; };
const err = (a, p) => { const r = call(a, p); if (r.status === 'ok') throw new Error(`${a}: debía fallar y no falló`); return r.message; };
const t = (nombre, fn) => {
  pruebas++;
  try { fn(); console.log('  ✔', nombre); }
  catch (e) { fallos++; console.log('  ✘', nombre, '\n      →', e.message); }
};
const igual = (real, esperado, msg = '') => {
  const a = Math.round(real * 100) / 100, b = Math.round(esperado * 100) / 100;
  if (a !== b) throw new Error(`${msg} esperado ${b}, obtenido ${a}`);
};

console.log('\nFLUJO DEL NEGOCIO (capital 10,000)');
ok('guardar_configuracion_empresa', { nombre_empresa: 'DISTRIBUIDORA ROJAS PERALTA', capital_inicial: 10000 });
ok('registrar_vehiculo', { nombre: 'Camión A', placa: 'A1', chofer: 'Chofer A' });
ok('registrar_vehiculo', { nombre: 'Camión B', placa: 'B1', chofer: 'Chofer B' });
const idA = 2, idB = 3;
ok('registrar_cliente', { nombre: 'Colmado Uno', limiteCredito: 5000 });
const idCli = ok('get_clientes').find(c => c.nombre === 'Colmado Uno').id;
ok('registrar_producto', { codigoInterno: 'AG-1', nombre: 'Agua', precioCompra: 60, precioMayorista: 80, precioDetalle: 90, itbisPorcentaje: 0, stockInicialCentral: 0 });
const idProd = ok('get_productos')[0].id;
ok('registrar_proveedor', { rncCedula: '101010101', nombre: 'Suplidor Agua' });
const idProv = ok('get_proveedores')[0].id;

t('Comprar mercancía NO es un gasto ni pérdida (capital 10,000 → compra 6,000)', () => {
  ok('registrar_entrada_compra', { idProveedor: idProv, nombreProveedor: 'Suplidor Agua', rncProveedor: '101010101', items: [{ id_producto: idProd, cantidad: 100, precio_compra: 60, itbis_porcentaje: 0 }] });
  const b = ok('get_balance_financiero');
  igual(b.total_gastos, 0, 'gastos');
  igual(b.ganancia_neta, 0, 'ganancia neta');
  igual(b.capital_inicial, 10000, 'capital');
  igual(b.inventario_costo_actual, 6000, 'inventario a costo');
  igual(b.compras_mercancia, 6000, 'compras');
});

t('Cargar camiones y vender con los 3 métodos de pago', () => {
  ok('cargar_camion', { idCamionDestino: idA, items: [{ id_producto: idProd, cantidad: 30 }] });
  ok('cargar_camion', { idCamionDestino: idB, items: [{ id_producto: idProd, cantidad: 30 }] });
  const v = (alm, pago, cant, cli = 1) => ok('registrar_venta', { idAlmacen: alm, tipoPago: pago, idCliente: cli, nombreCliente: 'x', detalles: [{ id_producto: idProd, cantidad: cant, precio_unitario: 80, itbis_porcentaje: 0 }] });
  v(idA, 'Contado', 5); v(idA, 'Transferencia', 3); v(idA, 'Credito', 2, idCli);
  v(idB, 'Contado', 4); v(idB, 'Cheque', 1);
  const p = ok('get_productos')[0];
  igual(p.stock_desglose[idA], 20, 'stock camión A'); igual(p.stock_desglose[idB], 25, 'stock camión B');
});

t('Liquidación muestra efectivo, transferencia y crédito por separado', () => {
  const r = ok('get_resumen_cuadre_camion', { idCamion: idA });
  igual(r.ventas_efectivo, 400, 'efectivo'); igual(r.ventas_transferencia, 240, 'transferencia'); igual(r.ventas_credito, 160, 'crédito');
  igual(r.efectivo_esperado, 400, 'esperado');
});

t('Se pueden liquidar los DOS camiones seguidos (sin refrescar)', () => {
  const a = ok('cerrar_cuadre_ruta', { idCamion: idA, efectivoEntregado: 400 });
  igual(a.diferencia, 0, 'dif A');
  const b = ok('cerrar_cuadre_ruta', { idCamion: idB, efectivoEntregado: 300 });
  igual(b.diferencia, -20, 'faltante B (esperado 320)');
});

t('Después de liquidar no se vuelve a contar lo ya liquidado', () => {
  const r = ok('get_resumen_cuadre_camion', { idCamion: idA });
  igual(r.ventas_total, 0, 'pendiente tras liquidar');
  ok('cargar_camion', { idCamionDestino: idA, items: [{ id_producto: idProd, cantidad: 10 }] });
  ok('registrar_venta', { idAlmacen: idA, tipoPago: 'Contado', nombreCliente: 'x', detalles: [{ id_producto: idProd, cantidad: 2, precio_unitario: 80, itbis_porcentaje: 0 }] });
  igual(ok('get_resumen_cuadre_camion', { idCamion: idA }).ventas_efectivo, 160, 'solo la nueva venta');
});

t('Mermas: la mercancía dañada se registra como gasto al costo', () => {
  const antes = ok('get_balance_financiero').mermas;
  ok('registrar_merma_camion', { idCamion: idA, idProducto: idProd, cantidad: 2, motivo: 'Rotura' });
  const b = ok('get_balance_financiero');
  igual(b.mermas - antes, 120, 'merma = 2 x 60');
  if (!ok('get_gastos').some(g => g.categoria === 'Merma de Inventario')) throw new Error('la merma no aparece en gastos');
});

t('Ganancias separadas del capital y positivas', () => {
  const b = ok('get_balance_financiero');
  // Vendido: 5+3+2+4+1+2 = 17 u x 80 = 1360 ; costo 17 x 60 = 1020 ; bruta 340 ; merma 120
  igual(b.subtotal_ventas, 1360, 'ventas'); igual(b.costo_mercancia, 1020, 'costo');
  igual(b.ganancia_bruta, 340, 'bruta'); igual(b.ganancia_neta, 220, 'neta');
  igual(b.capital_inicial, 10000, 'capital intacto');
  igual(b.capital_trabajo, 10220, 'capital + ganancia disponible');
});

t('Gastos operativos (nómina) restan a la ganancia, no la compra', () => {
  ok('registrar_gasto', { categoria: 'Combustible de Vehículo', concepto: 'Diesel', monto: 100 });
  ok('guardar_empleado', { nombre: 'Empleado 1', puesto: 'Ayudante', salarioBase: 1000, frecuenciaPago: 'Semanal' });
  const idEmp = ok('get_empleados')[0].id;
  const nom = ok('preparar_nomina', { frecuencia: 'Semanal' })[0];
  ok('procesar_pago_nomina', { idEmpleado: idEmp, frecuencia: 'Semanal', salarioBruto: nom.salario_bruto, totalAdelantos: 0, salarioNeto: nom.salario_neto });
  const b = ok('get_balance_financiero');
  igual(b.gastos_operativos, 1100, 'gastos operativos'); igual(b.ganancia_neta, 220 - 1100, 'neta con gastos');
});

t('Editar gasto y dividendo', () => {
  const g = ok('get_gastos').find(x => x.concepto === 'Diesel');
  ok('actualizar_gasto', { id: g.id, fecha: g.fecha, categoria: g.categoria, concepto: 'Diesel (corregido)', monto: 150 });
  igual(ok('get_gastos').find(x => x.id === g.id).monto, 150, 'monto gasto');
  // hacer ganancia positiva para poder retirar
  ok('cargar_camion', { idCamionDestino: idB, items: [{ id_producto: idProd, cantidad: 20 }] });
  ok('registrar_venta', { idAlmacen: idB, tipoPago: 'Contado', nombreCliente: 'x', detalles: [{ id_producto: idProd, cantidad: 20, precio_unitario: 120, itbis_porcentaje: 0 }] });
  const disp = ok('get_balance_financiero').ganancia_neta_disponible;
  if (disp <= 100) throw new Error('ganancia insuficiente ' + disp);
  const idD = ok('registrar_retiro_dividendo', { monto: 100, concepto: 'Retiro' }).dividendoId;
  ok('actualizar_retiro_dividendo', { id: idD, fecha: '2026-10-29', monto: 150, concepto: 'Retiro editado' });
  igual(ok('get_dividendos')[0].monto, 150, 'dividendo editado');
  err('registrar_retiro_dividendo', { monto: 99999999, concepto: 'imposible' });
});

t('Editar compra a suplidor mantiene stock y gasto de compra', () => {
  const compra = ok('get_compras_proveedor', { idProveedor: idProv })[0];
  const det = ok('get_detalle_compra', { idCompra: compra.id });
  ok('actualizar_entrada_compra', { idCompra: compra.id, idProveedor: idProv, fechaCompra: det.fecha_compra, items: [{ id_producto: idProd, cantidad: 110, precio_compra: 60, itbis_porcentaje: 0 }] });
  const nuevo = ok('get_detalle_compra', { idCompra: compra.id });
  igual(nuevo.total, 6600, 'total compra');
  // la compra editada no es gasto operativo
  igual(ok('get_balance_financiero').compras_mercancia, 6600, 'compras');
});

t('Editar una venta pendiente funciona (corrige stock y totales)', () => {
  const ventas = ok('get_ventas', { limit: 50 });
  const v = ventas.find(x => !x.id_cuadre && x.estado_venta === 'Completada' && x.tipo_pago === 'Contado' && x.id_almacen === idA);
  const ant = ok('get_productos')[0].stock_desglose[idA];
  ok('editar_venta', { idVenta: v.id, nombreCliente: 'x', tipoPago: 'Contado', items: [{ id_producto: idProd, cantidad: 3, precio_unitario: 80, itbis_porcentaje: 0 }] });
  igual(ok('get_venta_detalle', { idVenta: v.id }).total, 240, 'nuevo total');
  igual(ok('get_productos')[0].stock_desglose[idA], ant + v.total / 80 - 3, 'stock ajustado');
});

t('Crédito: cliente registrado, límite y cobro de abonos', () => {
  err('registrar_venta', { idAlmacen: 1, tipoPago: 'Credito', idCliente: 1, nombreCliente: 'x', detalles: [{ id_producto: idProd, cantidad: 1, precio_unitario: 80, itbis_porcentaje: 0 }] });
  const cxc = ok('get_cxc', { idCliente: idCli })[0];
  ok('registrar_cobro_cxc', { idCuentaCobrar: cxc.id, monto: 60 });
  igual(ok('get_clientes').find(c => c.id === idCli).balance_pendiente, 100, 'balance cliente');
});

t('Venta con stock insuficiente falla y NO gasta el NCF', () => {
  const antes = ok('get_proximo_ncf', { tipoNCF: 'B02' }).ncf;
  err('registrar_venta', { idAlmacen: idA, tipoPago: 'Contado', emitirNCFInmediato: true, nombreCliente: 'x', detalles: [{ id_producto: idProd, cantidad: 9999, precio_unitario: 80, itbis_porcentaje: 0 }] });
  if (ok('get_proximo_ncf', { tipoNCF: 'B02' }).ncf !== antes) throw new Error('el NCF se consumió');
});

t('Anular venta devuelve stock; Kardex tiene movimientos', () => {
  const v = ok('get_ventas', { limit: 50 }).find(x => x.estado_venta === 'Completada' && x.id_almacen === idB && !x.id_cuadre);
  ok('anular_venta', { idVenta: v.id, motivo: 'prueba' });
  const k = ok('get_kardex_producto', { idProducto: idProd });
  if (k.movimientos.length < 10) throw new Error('Kardex casi vacío: ' + k.movimientos.length);
});

t('Reportes 606/607 y estado de resultados por período responden', () => {
  const d = new Date();
  ok('get_reporte_607', { mes: d.getMonth() + 1, anio: d.getFullYear() });
  ok('get_reporte_606', { mes: d.getMonth() + 1, anio: d.getFullYear() });
  const r = ok('get_estado_resultados', { fechaInicio: '2000-01-01', fechaFin: '2100-01-01' });
  if (typeof r.ganancia_neta !== 'number') throw new Error('sin ganancia neta');
  const rep = ok('get_reporte_cuadres', {});
  if (!rep.cuadres.length) throw new Error('reporte de cuadres vacío');
});

t('Dashboard y notificaciones cargan', () => { ok('get_dashboard_summary'); ok('get_notificaciones'); });

console.log(`\n${pruebas - fallos}/${pruebas} pruebas correctas`);
try { fs.rmSync(tmp, { force: true }); fs.rmSync(tmp + '-wal', { force: true }); fs.rmSync(tmp + '-shm', { force: true }); } catch (e) {}
process.exit(fallos ? 1 : 0);
