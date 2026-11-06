-- =============================================================================
-- SEMILLAS Y DATOS INICIALES POR DEFECTO - REPUBLICA DOMINICANA (DOP)
-- =============================================================================

-- 1. EMPRESA
INSERT OR IGNORE INTO empresa (id, rnc, razon_social, nombre_comercial, telefono, direccion, pie_factura)
VALUES (1, '130123456', 'DISTRIBUIDORA SAMUEL SRL', 'Distribuidora Samuel', '809-555-0199', 'Av. 27 de Febrero #102, Rep. Dominicana', '¡Gracias por su compra! Conserve este comprobante fiscal.');

-- 2. USUARIO ADMINISTRADOR DEFAULT
INSERT OR IGNORE INTO usuarios (id, nombre, username, password_hash, rol)
VALUES (1, 'Administrador Sistema', 'admin', 'admin123', 'Administrador');

-- 3. ALMACENES (PRINCIPAL Y 2 CAMIONES DE REPARTO)
INSERT OR IGNORE INTO almacenes (id, nombre, tipo, placa_camion, chofer_asignado)
VALUES 
(1, 'Almacén Principal Central', 'Principal', NULL, NULL),
(2, 'Camión 1 - Isuzu Blanco', 'Camion', 'L348912', 'Carlos Martínez'),
(3, 'Camión 2 - Daihatsu Rojo', 'Camion', 'L490211', 'Juan Pérez');

-- 4. EMPLEADOS (4 EMPLEADOS DEL NEGOCIO)
INSERT OR IGNORE INTO empleados (id, cedula, nombre, telefono, puesto, sueldo_base)
VALUES 
(1, '00118923412', 'Carlos Martínez', '809-555-0101', 'Chofer Vendedor Camión 1', 25000.00),
(2, '00119283419', 'Juan Pérez', '809-555-0102', 'Chofer Vendedor Camión 2', 25000.00),
(3, '40219823411', 'Pedro Gómez', '809-555-0103', 'Ayudante de Reparto', 18000.00),
(4, '00109283711', 'Ana Sánchez', '809-555-0104', 'Almacenista / Cajera', 22000.00);

-- 5. SECUENCIAS NCF DE LA DGII (REPUBLICA DOMINICANA)
INSERT OR IGNORE INTO ncf_secuencias (id, tipo_ncf, descripcion, prefijo, secuencia_inicio, secuencia_actual, secuencia_fin, fecha_vencimiento)
VALUES 
(1, 'B01', 'Factura de Crédito Fiscal', 'B01', 1, 1, 1000, '2027-12-31'),
(2, 'B02', 'Factura de Consumidor Final', 'B02', 1, 1, 5000, '2027-12-31'),
(3, 'B04', 'Nota de Crédito', 'B04', 1, 1, 500, '2027-12-31'),
(4, 'B14', 'Regímenes Especiales de Tributación', 'B14', 1, 1, 200, '2027-12-31'),
(5, 'B15', 'Comprobante Gubernamental', 'B15', 1, 1, 200, '2027-12-31');

-- 6. CATEGORÍAS
INSERT OR IGNORE INTO categorias (id, nombre) VALUES 
(1, 'Bebidas y Refrescos'),
(2, 'Embutidos y Lácteos'),
(3, 'Enlatados y Conservas'),
(4, 'Granos y Cereales'),
(5, 'Productos de Limpieza');

-- 7. CLIENTES DE PRUEBA
INSERT OR IGNORE INTO clientes (id, rnc_cedula, tipo_ncf_defecto, nombre, telefono, direccion, limite_credito, dias_credito)
VALUES 
(1, '22300189211', 'B02', 'CLIENTE CONTADO / CONSUMIDOR FINAL', '809-000-0000', 'Local', 0.00, 0),
(2, '101829341', 'B01', 'Colmado La Bendición (RNC 101829341)', '809-555-4433', 'Calle El Sol #45, Santiago', 50000.00, 30),
(3, '131920394', 'B01', 'Supermercado El Económico SRL', '809-555-8899', 'Av. Venezuela #12, Sto Dgo Este', 150000.00, 45);

-- 8. PRODUCTOS INICIALES CON PRECIO MAYORISTA Y DETALLE (DOP)
INSERT OR IGNORE INTO productos (id, codigo_barras, codigo_interno, nombre, id_categoria, unidad_medida, precio_compra, precio_mayorista, precio_detalle, itbis_porcentaje, stock_minimo)
VALUES 
(1, '74601928301', 'BEB-001', 'Refresco Kola Real 2 Litros (Caja 6 unid)', 1, 'Caja', 320.00, 410.00, 450.00, 18.00, 20),
(2, '74601928302', 'BEB-002', 'Agua Planeta Azul 600ml (Fardo 24 unid)', 1, 'Fardo', 180.00, 240.00, 270.00, 0.00, 30),
(3, '74601928303', 'EMB-001', 'Salami Induveca Súper Especial 3.5 lb (Caja 10 unid)', 2, 'Caja', 1850.00, 2250.00, 2450.00, 18.00, 10),
(4, '74601928304', 'ENL-001', 'Habichuelas Negras Victorina 15 oz (Caja 24 unid)', 3, 'Caja', 890.00, 1120.00, 1250.00, 18.00, 15),
(5, '74601928305', 'GRA-001', 'Arroz Campos Grano Selecto (Saco 50 lb)', 4, 'Saco', 1650.00, 1950.00, 2100.00, 0.00, 25),
(6, '74601928306', 'LIM-001', 'Detergente Fab 500g (Caja 24 unid)', 5, 'Caja', 920.00, 1180.00, 1300.00, 18.00, 15);

-- 9. INVENTARIO INICIAL EN ALMACÉN PRINCIPAL Y CAMIONES
INSERT OR IGNORE INTO inventario_stock (id_almacen, id_producto, cantidad) VALUES 
(1, 1, 150), (1, 2, 200), (1, 3, 40), (1, 4, 80), (1, 5, 100), (1, 6, 60),
(2, 1, 30),  (2, 2, 40),  (2, 3, 10), (2, 4, 15), (2, 5, 20),  (2, 6, 12),
(3, 1, 25),  (3, 2, 35),  (3, 3, 8),  (3, 4, 12), (3, 5, 15),  (3, 6, 10);
