/**
 * CONSTANTES GLOBALES Y CONFIGURACIÓN FISCAL DE REPÚBLICA DOMINICANA (DGII)
 */

module.exports = {
  APP_NAME: 'Sistema de Ventas & Distribuidora Rojas Peralta',
  VERSION: '1.1.0',
  MONEDA_SIMBOLO: 'RD$',
  MONEDA_CODIGO: 'DOP',
  
  // ALMACENES PRECONFIGURADOS
  ALMACEN_PRINCIPAL_ID: 1,

  // TIPOS DE COMPROBANTES FISCALES NCF (DGII REPÚBLICA DOMINICANA)
  NCF_TIPOS: {
    B01: { codigo: 'B01', nombre: 'Factura de Crédito Fiscal', requiere_rnc: true },
    B02: { codigo: 'B02', nombre: 'Factura de Consumidor Final', requiere_rnc: false },
    B03: { codigo: 'B03', nombre: 'Nota de Débito', requiere_rnc: true },
    B04: { codigo: 'B04', nombre: 'Nota de Crédito', requiere_rnc: true },
    B14: { codigo: 'B14', nombre: 'Regímenes Especiales de Tributación', requiere_rnc: true },
    B15: { codigo: 'B15', nombre: 'Comprobante Gubernamental', requiere_rnc: true }
  },

  // PORCENTAJES DE ITBIS
  ITBIS_RATES: [
    { label: '18% (Estándar)', val: 18.0 },
    { label: '16% (Reducido)', val: 16.0 },
    { label: '0% (Exento)', val: 0.0 }
  ],

  // TIPOS DE PAGO
  TIPOS_PAGO: ['Contado', 'Credito', 'Transferencia', 'Cheque'],

  // CATEGORÍAS DE GASTOS
  CATEGORIAS_GASTOS: [
    'Combustible de Vehículo',
    'Mantenimiento Vehicular',
    'Nómina de Empleados',
    'Alquiler / Renta Almacén',
    'Electricidad y Servicios',
    'Imprevistos y Varios'
  ],

  // ROLES DE USUARIO
  ROLES: {
    ADMINISTRADOR: 'Administrador',
    CAJERO: 'Cajero',
    VENDEDOR: 'Vendedor',
    CHOFER: 'Chofer'
  }
};
