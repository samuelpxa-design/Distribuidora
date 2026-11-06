let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error('\n' + '='.repeat(60));
  console.error('❌ ERROR DE COMPATIBILIDAD DE NODE.JS');
  console.error('='.repeat(60));
  console.error(`Tu versión actual de Node.js es: ${process.version}`);
  console.error('Este sistema requiere Node.js v22.5.0 o superior (Node 22 LTS o Node 24).');
  console.error('Motivo: Utiliza el motor de base de datos integrado de alta velocidad (node:sqlite).');
  console.error('\n👉 Por favor descarga e instala la versión recomendada gratis desde:');
  console.error('   https://nodejs.org');
  console.error('='.repeat(60) + '\n');
  process.exit(1);
}
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.ROJAS_DB_PATH || path.join(__dirname, '../../database/distribuidora.db');
const SCHEMA_PATH = path.join(__dirname, '../../database/migrations/init_schema.sql');
const SEED_PATH = path.join(__dirname, '../../database/seeds/initial_data.sql');

let dbInstance = null;

function applySchemaAndMigrations(db, isNewDatabase = false) {
  try {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);

    // Migración retrocompatible para agregar columna estado_fiscal a ventas si no existe
    try {
      db.exec(`ALTER TABLE ventas ADD COLUMN estado_fiscal VARCHAR(30) DEFAULT 'Facturada NCF';`);
    } catch (e) {}

    // Migración retrocompatible para empleados (salario_base, frecuencia_pago, dia_pago)
    try {
      db.exec(`ALTER TABLE empleados ADD COLUMN salario_base DECIMAL(12,2) NOT NULL DEFAULT 0.00;`);
    } catch (e) {}
    try {
      db.exec(`ALTER TABLE empleados ADD COLUMN frecuencia_pago VARCHAR(20) NOT NULL DEFAULT 'Quincenal';`);
    } catch (e) {}
    try {
      db.exec(`ALTER TABLE empleados ADD COLUMN dia_pago INTEGER DEFAULT 15;`);
    } catch (e) {}
    try {
      db.exec(`UPDATE empleados SET salario_base = sueldo_base WHERE (salario_base IS NULL OR salario_base = 0) AND sueldo_base > 0;`);
    } catch (e) {}

    // Migración retrocompatible para clientes (limite_credito)
    try {
      db.exec(`ALTER TABLE clientes ADD COLUMN limite_credito DECIMAL(12,2) DEFAULT 50000.00;`);
    } catch (e) {}

    // Costo unitario histórico para no recalcular ventas anteriores con el precio actual del producto.
    try {
      db.exec(`ALTER TABLE venta_detalles ADD COLUMN costo_unitario DECIMAL(12,2) DEFAULT NULL;`);
    } catch (e) {}
    try {
      db.exec(`
        UPDATE venta_detalles
        SET costo_unitario = COALESCE((SELECT precio_compra FROM productos WHERE productos.id = venta_detalles.id_producto), 0)
        WHERE costo_unitario IS NULL;
      `);
    } catch (e) {}

    // Tabla para notificaciones leídas/descartadas por usuario
    db.exec(`
      CREATE TABLE IF NOT EXISTS notificaciones_descartadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clave_notificacion VARCHAR(100) UNIQUE NOT NULL,
        fecha_descarte DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migración retrocompatible para crear tablas de proveedores y compras
    db.exec(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rnc_cedula VARCHAR(11) UNIQUE NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        telefono VARCHAR(20),
        direccion TEXT,
        email VARCHAR(100),
        activo INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS compras_inventario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_proveedor INTEGER REFERENCES proveedores(id),
        rnc_proveedor VARCHAR(11),
        nombre_proveedor VARCHAR(150),
        ncf_compra VARCHAR(19),
        fecha_compra DATETIME DEFAULT CURRENT_TIMESTAMP,
        id_almacen INTEGER DEFAULT 1,
        subtotal DECIMAL(12,2) NOT NULL,
        itbis_total DECIMAL(12,2) NOT NULL,
        total DECIMAL(12,2) NOT NULL,
        tipo_pago VARCHAR(20) DEFAULT 'Contado',
        notas TEXT
      );

      CREATE TABLE IF NOT EXISTS compra_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_compra INTEGER NOT NULL REFERENCES compras_inventario(id),
        id_producto INTEGER NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL,
        precio_compra DECIMAL(12,2) NOT NULL,
        itbis_monto DECIMAL(12,2) NOT NULL,
        total DECIMAL(12,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mermas_camion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_camion INTEGER NOT NULL REFERENCES almacenes(id),
        id_producto INTEGER NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        id_usuario INTEGER REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS kardex_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_producto INTEGER NOT NULL REFERENCES productos(id),
        id_almacen INTEGER REFERENCES almacenes(id),
        tipo_movimiento VARCHAR(30) NOT NULL,
        cantidad INTEGER NOT NULL,
        stock_anterior INTEGER NOT NULL,
        stock_nuevo INTEGER NOT NULL,
        referencia VARCHAR(100),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        id_usuario INTEGER REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS cierres_caja_pos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_cierre DATETIME DEFAULT CURRENT_TIMESTAMP,
        id_cajero INTEGER REFERENCES usuarios(id),
        total_ventas_efectivo DECIMAL(12,2) NOT NULL,
        total_ventas_credito DECIMAL(12,2) NOT NULL,
        monto_esperado_efectivo DECIMAL(12,2) NOT NULL,
        efectivo_contado_fisico DECIMAL(12,2) NOT NULL,
        diferencia DECIMAL(12,2) NOT NULL,
        estado VARCHAR(20) DEFAULT 'Cerrado',
        notas TEXT
      );

      CREATE TABLE IF NOT EXISTS configuracion_empresa (
        id INTEGER PRIMARY KEY DEFAULT 1,
        nombre_empresa VARCHAR(150) NOT NULL DEFAULT 'DISTRIBUIDORA ROJAS PERALTA',
        rnc VARCHAR(20) DEFAULT '1-01-82934-1',
        telefono VARCHAR(30) DEFAULT '(809) 555-0199',
        email VARCHAR(100) DEFAULT 'contacto@rojasperalta.com',
        direccion TEXT DEFAULT 'Av. Principal #45, Santo Domingo, Rep. Dom.',
        mensaje_factura TEXT DEFAULT '¡Gracias por su compra en Distribuidora Rojas Peralta!',
        capital_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00
      );

      CREATE TABLE IF NOT EXISTS empleados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cedula VARCHAR(20),
        nombre VARCHAR(150) NOT NULL,
        puesto VARCHAR(100) NOT NULL,
        telefono VARCHAR(20),
        salario_base DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        frecuencia_pago VARCHAR(20) NOT NULL DEFAULT 'Quincenal',
        fecha_ingreso DATE DEFAULT (CURRENT_DATE),
        activo INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS adelantos_empleados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_empleado INTEGER NOT NULL REFERENCES empleados(id),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        monto DECIMAL(12,2) NOT NULL,
        concepto TEXT,
        estado VARCHAR(20) DEFAULT 'Pendiente',
        id_pago_nomina INTEGER REFERENCES pagos_nomina(id),
        id_gasto INTEGER REFERENCES gastos(id)
      );

      CREATE TABLE IF NOT EXISTS pagos_nomina (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_empleado INTEGER NOT NULL REFERENCES empleados(id),
        fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
        frecuencia VARCHAR(20) NOT NULL,
        periodo_cierre VARCHAR(50),
        salario_bruto DECIMAL(12,2) NOT NULL,
        total_adelantos DECIMAL(12,2) DEFAULT 0.00,
        salario_neto DECIMAL(12,2) NOT NULL,
        notas TEXT,
        id_gasto INTEGER REFERENCES gastos(id)
      );

      INSERT OR IGNORE INTO configuracion_empresa (id, nombre_empresa, rnc, telefono, email, direccion, mensaje_factura)
      VALUES (1, 'DISTRIBUIDORA ROJAS PERALTA', '1-01-82934-1', '(809) 555-0199', 'contacto@rojasperalta.com', 'Av. Principal #45, Santo Domingo, Rep. Dom.', '¡Gracias por su compra en Distribuidora Rojas Peralta!');
    `);

    // Campo contable separado de ventas y utilidades.
    try {
      db.exec(`ALTER TABLE configuracion_empresa ADD COLUMN capital_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00;`);
    } catch (e) {}

    aplicarMigracionesV11(db);

    if (isNewDatabase) {
      bootstrapCleanZero(db);
      console.log(' Base de Datos local inicializada limpia desde CERO (0 datos de prueba).');
    }
  } catch (err) {
    console.error('Error al inicializar las tablas de la base de datos:', err);
    throw err;
  }
}


function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

/**
 * Migraciones v1.1: liquidación por ventas pendientes, desglose por método de pago y vínculo gasto-compra.
 * Son aditivas: no borran ni modifican datos existentes.
 */
function aplicarMigracionesV11(db) {
  // 1. Cada venta de camión queda marcada con el cuadre que la liquidó (NULL = pendiente de liquidar).
  if (!columnExists(db, 'ventas', 'id_cuadre')) {
    db.exec(`ALTER TABLE ventas ADD COLUMN id_cuadre INTEGER;`);
    const cuadres = db.prepare(`SELECT * FROM cuadre_rutas ORDER BY id ASC`).all();
    const pendientes = db.prepare(`
      SELECT id, total FROM ventas
      WHERE id_almacen = ? AND id_cuadre IS NULL AND estado_venta = 'Completada' AND DATE(fecha) <= DATE(?)
      ORDER BY id ASC
    `);
    const marcar = db.prepare(`UPDATE ventas SET id_cuadre = ? WHERE id = ?`);
    for (const c of cuadres) {
      const limite = (Number(c.total_ventas_contado) || 0) + (Number(c.total_ventas_credito) || 0);
      let acumulado = 0;
      for (const v of pendientes.all(c.id_camion, c.fecha_cuadre)) {
        if (acumulado + v.total <= limite + 0.01) {
          acumulado += v.total;
          marcar.run(c.id, v.id);
        }
      }
    }
  }

  // 2. Desglose por método de pago en cada liquidación.
  if (!columnExists(db, 'cuadre_rutas', 'total_ventas_transferencia')) {
    db.exec(`ALTER TABLE cuadre_rutas ADD COLUMN total_ventas_transferencia DECIMAL(12,2) DEFAULT 0.00;`);
  }
  if (!columnExists(db, 'cuadre_rutas', 'total_ventas_cheque')) {
    db.exec(`ALTER TABLE cuadre_rutas ADD COLUMN total_ventas_cheque DECIMAL(12,2) DEFAULT 0.00;`);
  }
  if (!columnExists(db, 'cuadre_rutas', 'creado_en')) {
    db.exec(`ALTER TABLE cuadre_rutas ADD COLUMN creado_en DATETIME;`);
  }

  // 3. Vínculo directo entre el gasto automático y la compra que lo originó.
  if (!columnExists(db, 'gastos', 'id_compra')) {
    db.exec(`ALTER TABLE gastos ADD COLUMN id_compra INTEGER;`);
    const filas = db.prepare(`SELECT id, concepto FROM gastos WHERE categoria = 'Compras de Inventario'`).all();
    const vincular = db.prepare(`UPDATE gastos SET id_compra = ? WHERE id = ?`);
    for (const f of filas) {
      const m = /Factura #(\d+)/.exec(f.concepto || '');
      if (m) vincular.run(Number(m[1]), f.id);
    }
  }

  // 4. Mermas anteriores: la mercancía dañada debe figurar como gasto (pérdida de inversión).
  if (!columnExists(db, 'mermas_camion', 'id_gasto')) {
    db.exec(`ALTER TABLE mermas_camion ADD COLUMN id_gasto INTEGER;`);
    const mermas = db.prepare(`
      SELECT m.id, m.id_camion, m.cantidad, m.motivo, m.fecha, m.id_usuario, p.nombre, p.precio_compra
      FROM mermas_camion m JOIN productos p ON p.id = m.id_producto
    `).all();
    const insGasto = db.prepare(`
      INSERT INTO gastos (fecha, categoria, concepto, monto, id_camion, id_usuario)
      VALUES (DATE(?), 'Merma de Inventario', ?, ?, ?, ?)
    `);
    const vinc = db.prepare(`UPDATE mermas_camion SET id_gasto = ? WHERE id = ?`);
    for (const m of mermas) {
      const yaExiste = db.prepare(`SELECT id FROM gastos WHERE categoria = 'Merma de Inventario' AND concepto LIKE ? AND id_camion = ? LIMIT 1`)
        .get(`${m.nombre} (${m.cantidad} unidad(es))%`, m.id_camion);
      if (yaExiste) { vinc.run(yaExiste.id, m.id); continue; }
      const r = insGasto.run(m.fecha, `${m.nombre} (${m.cantidad} unidad(es)) - ${m.motivo}`, m.cantidad * m.precio_compra, m.id_camion, m.id_usuario || 1);
      vinc.run(Number(r.lastInsertRowid), m.id);
    }
  }

  // 5. Índices para mantener el sistema rápido con muchos registros.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
    CREATE INDEX IF NOT EXISTS idx_ventas_almacen_cuadre ON ventas(id_almacen, id_cuadre);
    CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
    CREATE INDEX IF NOT EXISTS idx_gastos_compra ON gastos(id_compra);
    CREATE INDEX IF NOT EXISTS idx_kardex_producto ON kardex_movimientos(id_producto, id);
  `);
}

/**
 * Inserta exclusivamente la configuración base y requerimientos técnicos del sistema:
 * - 1 Usuario Administrador (admin / admin123)
 * - 1 Almacén Principal (0 Camiones de prueba)
 * - 1 Cliente Contado Genérico para POS (0 Clientes de prueba)
 * - Secuencias NCF de la DGII en 1
 * - Categorías estándar de catálogo
 * - CERO EMPLEADOS, CERO NÓMINAS, CERO PRODUCTOS DEMO, CERO GASTOS, CERO CAMIONES
 */
function bootstrapCleanZero(db) {
  db.exec(`
    -- 1. Empresa y Configuración Fiscal
    INSERT OR REPLACE INTO empresa (id, rnc, razon_social, nombre_comercial, telefono, direccion, pie_factura)
    VALUES (1, '1-01-82934-1', 'DISTRIBUIDORA ROJAS PERALTA', 'Distribuidora Rojas Peralta', '(809) 555-0199', 'Santo Domingo, Rep. Dom.', '¡Gracias por su compra!');

    INSERT OR REPLACE INTO configuracion_empresa (id, nombre_empresa, rnc, telefono, email, direccion, mensaje_factura)
    VALUES (1, 'DISTRIBUIDORA ROJAS PERALTA', '1-01-82934-1', '(809) 555-0199', 'contacto@rojasperalta.com', 'Santo Domingo, Rep. Dom.', '¡Gracias por su compra!');

    -- 2. Usuario Administrador Inicial
    INSERT OR REPLACE INTO usuarios (id, nombre, username, password_hash, rol)
    VALUES (1, 'Administrador Sistema', 'admin', 'admin123', 'Administrador');

    -- 3. Único Almacén Central (CERO camiones ni choferes de prueba)
    INSERT OR REPLACE INTO almacenes (id, nombre, tipo, placa_camion, chofer_asignado)
    VALUES (1, 'Almacén Principal Central', 'Principal', NULL, NULL);

    -- 4. Secuencias NCF Oficiales DGII en 1
    INSERT OR REPLACE INTO ncf_secuencias (id, tipo_ncf, descripcion, prefijo, secuencia_inicio, secuencia_actual, secuencia_fin, fecha_vencimiento)
    VALUES 
    (1, 'B01', 'Factura de Crédito Fiscal', 'B01', 1, 1, 1000, '2027-12-31'),
    (2, 'B02', 'Factura de Consumidor Final', 'B02', 1, 1, 5000, '2027-12-31'),
    (3, 'B04', 'Nota de Crédito', 'B04', 1, 1, 500, '2027-12-31'),
    (4, 'B14', 'Regímenes Especiales de Tributación', 'B14', 1, 1, 200, '2027-12-31'),
    (5, 'B15', 'Comprobante Gubernamental', 'B15', 1, 1, 200, '2027-12-31');

    -- 5. Categorías estándar para productos
    INSERT OR REPLACE INTO categorias (id, nombre) VALUES 
    (1, 'Bebidas y Refrescos'),
    (2, 'Embutidos y Lácteos'),
    (3, 'Enlatados y Conservas'),
    (4, 'Granos y Cereales'),
    (5, 'Productos de Limpieza');

    -- 6. Único cliente genérico para venta al detalle (CERO clientes de prueba)
    INSERT OR REPLACE INTO clientes (id, rnc_cedula, tipo_ncf_defecto, nombre, telefono, direccion, limite_credito, dias_credito)
    VALUES (1, '22300189211', 'B02', 'CLIENTE CONTADO / CONSUMIDOR FINAL', '809-000-0000', 'Local', 0.00, 0);
  `);
}

function getDatabaseConnection() {
  if (dbInstance) return dbInstance;

  // Asegurar que la carpeta database exista
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const isNewDatabase = !fs.existsSync(DB_PATH);
  dbInstance = new DatabaseSync(DB_PATH);

  // Habilitar claves foráneas y modo WAL para alta velocidad local
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  // Inicializar esquema si la base de datos es nueva o no tiene tablas
  applySchemaAndMigrations(dbInstance, isNewDatabase);

  return dbInstance;
}

/**
 * Borra por completo toda la base de datos y la reinicia a 0 ABSOLUTO (sin datos de prueba).
 */
function resetDatabase() {
  const db = getDatabaseConnection();

  // 1. Deshabilitar claves foráneas para poder vaciar / eliminar todas las tablas sin conflicto
  db.exec('PRAGMA foreign_keys = OFF;');

  // 2. Obtener todas las vistas y tablas de usuario
  const objects = db.prepare(`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%';`).all();
  for (const obj of objects) {
    if (obj.type === 'view') {
      db.exec(`DROP VIEW IF EXISTS "${obj.name}";`);
    } else {
      db.exec(`DROP TABLE IF EXISTS "${obj.name}";`);
    }
  }

  // 3. Compactar base de datos
  db.exec('VACUUM;');

  // 4. Reactivar claves foráneas y modo WAL
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // 5. Aplicar esquema limpio
  applySchemaAndMigrations(db, false);

  // 6. Cargar datos estrictamente desde CERO (0 camiones, 0 empleados, 0 nóminas, 0 clientes demo, 0 productos demo)
  bootstrapCleanZero(db);

  console.log(' Base de datos reseteada a CERO absoluto (sin datos de prueba).');
  return { exito: true, mensaje: 'Base de datos reiniciada a cero exitosamente. Todos los datos de prueba han sido eliminados.' };
}

module.exports = {
  getDatabaseConnection,
  resetDatabase,
  DB_PATH
};
