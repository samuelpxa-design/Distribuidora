const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Distribuidora Rojas');
const PASSWORD_FILE = path.join(CONFIG_DIR, 'reset-password.json');
const MIN_PASSWORD_LENGTH = 8;

function readPasswordRecord() {
  if (!fs.existsSync(PASSWORD_FILE)) return null;

  try {
    const record = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'));
    if (record.version !== 1 || typeof record.salt !== 'string' || typeof record.hash !== 'string') {
      throw new Error('formato inválido');
    }
    return record;
  } catch (err) {
    throw new Error('No se pudo leer la protección de borrado. Pide ayuda al administrador del sistema.');
  }
}

function isConfigured() {
  return Boolean(readPasswordRecord());
}

function configurePassword(password, confirmation) {
  if (readPasswordRecord()) {
    throw new Error('La contraseña de borrado ya está configurada.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password !== confirmation) {
    throw new Error('Las contraseñas no coinciden.');
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  const record = JSON.stringify({
    version: 1,
    salt: salt.toString('hex'),
    hash: hash.toString('hex')
  }, null, 2);
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tempFile = `${PASSWORD_FILE}.${process.pid}.tmp`;

  fs.writeFileSync(tempFile, record, { mode: 0o600 });
  fs.chmodSync(tempFile, 0o600);
  fs.renameSync(tempFile, PASSWORD_FILE);

  return { configurada: true };
}

function verifyPassword(password) {
  const record = readPasswordRecord();
  if (!record || typeof password !== 'string') return false;

  const expected = Buffer.from(record.hash, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(record.salt, 'hex'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  isConfigured,
  configurePassword,
  verifyPassword
};
