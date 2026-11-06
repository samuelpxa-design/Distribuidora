-- =============================================================================
-- ESQUEMA DE BASE DE DATOS LOCAL - SISTEMA DE VENTAS & DISTRIBUIDORA DGII
-- =============================================================================

PRAGMA foreign_keys = ON;

-- 1. CONFIGURACIÓN DE LA EMPRESA
CREATE TABLE IF NOT EXISTS empresa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rnc VARCHAR(11) NOT NULL UNIQUE,
    razon_social VARCHAR(150) NOT NULL,
    nombre_comercial VARCHAR(150),
    telefono VARCHAR(20),
    direccion TEXT,
    email VARCHAR(100),
    pie_factura TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. ROLES Y USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Cajero', 'Vendedor', 'Chofer')),
    activo INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. ALMACENES Y CAMIONES DE REPARTO
CREATE TABLE IF NOT EXISTS almacenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Principal', 'Camion')),
    placa_camion VARCHAR(20),
    chofer_asignado VARCHAR(100),
    activo INTEGER DEFAULT 1
);

-- 4. EMPLEADOS (CHOFERES, AYUDANTES, ALMACENISTAS, CAJEROS)
CREATE TABLE IF NOT EXISTS empleados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cedula VARCHAR(20),
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    puesto VARCHAR(100) NOT NULL,
    salario_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    sueldo_base DECIMAL(12,2) DEFAULT 0.00,
    frecuencia_pago VARCHAR(20) NOT NULL DEFAULT 'Quincenal',
    activo INTEGER DEFAULT 1,
    fecha_ingreso DATE
);

-- 5. SECUENCIAS NCF (DGII REPÚBLICA DOMINICANA)
CREATE TABLE IF NOT EXISTS ncf_secuencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_ncf VARCHAR(5) NOT NULL, -- B01, B02, B03, B04, B14, B15, E31, E32...
    descripcion VARCHAR(100) NOT NULL,
    prefijo VARCHAR(3) NOT NULL DEFAULT 'B',
    secuencia_inicio INTEGER NOT NULL,
    secuencia_actual INTEGER NOT NULL,
    secuencia_fin INTEGER NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    activo INTEGER DEFAULT 1
);

-- 6. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rnc_cedula VARCHAR(11) NOT NULL,
    tipo_ncf_defecto VARCHAR(5) DEFAULT 'B02',
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    direccion TEXT,
    limite_credito DECIMAL(12,2) DEFAULT 0.00,
    dias_credito INTEGER DEFAULT 30,
    balance_pendiente DECIMAL(12,2) DEFAULT 0.00,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. CATEGORÍAS DE PRODUCTOS
CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

-- 8. CATÁLOGO DE PRODUCTOS (PRECIO MAYORISTA, DETALLE E ITBIS)
CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras VARCHAR(50),
    codigo_interno VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    id_categoria INTEGER REFERENCES categorias(id),
    unidad_medida VARCHAR(20) DEFAULT 'Caja', -- Caja, Unidad, Saco, Fardo, Paquete
    precio_compra DECIMAL(12,2) NOT NULL,
    precio_mayorista DECIMAL(12,2) NOT NULL,
    precio_detalle DECIMAL(12,2) NOT NULL,
    itbis_porcentaje DECIMAL(5,2) DEFAULT 18.00, -- 0%, 16%, 18%
    stock_minimo INTEGER DEFAULT 10,
    activo INTEGER DEFAULT 1
);

-- 9. STOCK POR ALMACÉN Y CAMIÓN
CREATE TABLE IF NOT EXISTS inventario_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_almacen INTEGER NOT NULL REFERENCES almacenes(id),
    id_producto INTEGER NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL DEFAULT 0,
    UNIQUE(id_almacen, id_producto)
);

-- 10. TRANSFERENCIAS Y CARGA A CAMIONES DE REPARTO
CREATE TABLE IF NOT EXISTS transferencias_camion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_almacen_origen INTEGER NOT NULL REFERENCES almacenes(id),
    id_almacen_destino INTEGER NOT NULL REFERENCES almacenes(id),
    fecha_transferencia DATETIME DEFAULT CURRENT_TIMESTAMP,
    id_usuario INTEGER REFERENCES usuarios(id),
    estado VARCHAR(20) DEFAULT 'Despachado' CHECK (estado IN ('Despachado', 'Liquidado', 'Cancelado')),
    notas TEXT
);

CREATE TABLE IF NOT EXISTS transferencia_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_transferencia INTEGER NOT NULL REFERENCES transferencias_camion(id),
    id_producto INTEGER NOT NULL REFERENCES productos(id),
    cantidad_cargada INTEGER NOT NULL,
    cantidad_devuelta INTEGER DEFAULT 0,
    cantidad_vendida INTEGER DEFAULT 0
);

-- 11. VENTAS Y FACTURACIÓN FISCAL DGII
CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ncf VARCHAR(19) DEFAULT 'PENDIENTE',
    tipo_ncf VARCHAR(5) DEFAULT 'B02',
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    id_cliente INTEGER REFERENCES clientes(id),
    rnc_cliente VARCHAR(11),
    nombre_cliente VARCHAR(150),
    id_usuario INTEGER REFERENCES usuarios(id),
    id_almacen INTEGER REFERENCES almacenes(id), -- Almacén de donde salió el stock (Principal o Camión)
    subtotal DECIMAL(12,2) NOT NULL,
    itbis_total DECIMAL(12,2) NOT NULL,
    descuento DECIMAL(12,2) DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL,
    tipo_pago VARCHAR(20) NOT NULL CHECK (tipo_pago IN ('Contado', 'Credito', 'Transferencia', 'Cheque')),
    estado_pago VARCHAR(20) DEFAULT 'Pagado' CHECK (estado_pago IN ('Pagado', 'Pendiente')),
    estado_venta VARCHAR(20) DEFAULT 'Completada' CHECK (estado_venta IN ('Completada', 'Anulada')),
    estado_fiscal VARCHAR(30) DEFAULT 'Facturada NCF' CHECK (estado_fiscal IN ('Pendiente NCF', 'Facturada NCF'))
);

CREATE TABLE IF NOT EXISTS venta_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_venta INTEGER NOT NULL REFERENCES ventas(id),
    id_producto INTEGER NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    itbis_monto DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL
);

-- 12. CUADRE Y LIQUIDACIÓN DE RUTA (CAMIONES)
CREATE TABLE IF NOT EXISTS cuadre_rutas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_cuadre DATE DEFAULT CURRENT_DATE,
    id_camion INTEGER NOT NULL REFERENCES almacenes(id),
    id_chofer INTEGER REFERENCES empleados(id),
    total_ventas_contado DECIMAL(12,2) DEFAULT 0.00,
    total_ventas_credito DECIMAL(12,2) DEFAULT 0.00,
    total_cobros_credito DECIMAL(12,2) DEFAULT 0.00,
    efectivo_entregado DECIMAL(12,2) DEFAULT 0.00,
    diferencia_cuadre DECIMAL(12,2) DEFAULT 0.00, -- Cuadre exacto, sobrante o faltante
    estado VARCHAR(20) DEFAULT 'Cerrado',
    notas TEXT
);

-- 13. CUENTAS POR COBRAR Y RECIBOS DE INGRESO
CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_venta INTEGER NOT NULL REFERENCES ventas(id),
    id_cliente INTEGER NOT NULL REFERENCES clientes(id),
    monto_original DECIMAL(12,2) NOT NULL,
    monto_pagado DECIMAL(12,2) DEFAULT 0.00,
    balance_pendiente DECIMAL(12,2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pagado', 'Vencido'))
);

CREATE TABLE IF NOT EXISTS pagos_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cuenta_cobrar INTEGER NOT NULL REFERENCES cuentas_por_cobrar(id),
    fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
    monto DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(20) DEFAULT 'Efectivo',
    numero_recibo VARCHAR(50),
    notas TEXT
);

-- 14. GASTOS OPERATIVOS DE LA EMPRESA (COMBUSTIBLE, MANTENIMIENTO, NÓMINA, OTROS)
CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE DEFAULT CURRENT_DATE,
    categoria VARCHAR(50) NOT NULL, -- Combustible Camión 1, Combustible Camión 2, Mantenimiento, Nómina, Renta, Servicios, Otros
    concepto TEXT NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    ncf_comprobante VARCHAR(19), -- NCF del proveedor para reporte 606 DGII
    rnc_proveedor VARCHAR(11),
    id_camion INTEGER REFERENCES almacenes(id),
    id_usuario INTEGER REFERENCES usuarios(id)
);

-- 15. NÓMINA DE EMPLEADOS
CREATE TABLE IF NOT EXISTS nomina_pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empleado INTEGER NOT NULL REFERENCES empleados(id),
    fecha_pago DATE DEFAULT CURRENT_DATE,
    periodo VARCHAR(50) NOT NULL, -- Quincenal, Mensual
    sueldo_bruto DECIMAL(12,2) NOT NULL,
    incentivo_ventas DECIMAL(12,2) DEFAULT 0.00,
    descuentos DECIMAL(12,2) DEFAULT 0.00,
    sueldo_neto DECIMAL(12,2) NOT NULL
);

-- 16. CONTROL DE GANANCIAS Y DIVIDENDOS DEL PROPIETARIO
CREATE TABLE IF NOT EXISTS dividendos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE DEFAULT CURRENT_DATE,
    monto DECIMAL(12,2) NOT NULL,
    concepto TEXT NOT NULL,
    id_usuario INTEGER REFERENCES usuarios(id)
);
