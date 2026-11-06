const http = require('http');
const fs = require('fs');
const path = require('path');
const { getDatabaseConnection } = require('../data/connection');
const ApiController = require('../controllers/apiController');
const { APP_NAME, VERSION } = require('../config/constants');

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, '../ui');

// Inicializar la base de datos al arrancar
getDatabaseConnection();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Manejo de la API REST local
  if (req.method === 'POST' && req.url.startsWith('/api/v1')) {
    // Protección: sólo se aceptan peticiones JSON (el navegador exige permiso previo a otros sitios web,
    // así una página externa abierta en el mismo Mac no puede enviar órdenes al sistema).
    const ctype = String(req.headers['content-type'] || '').toLowerCase();
    if (!ctype.startsWith('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Tipo de contenido no permitido.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const action = req.url.replace('/api/v1/', '');
        const responseData = ApiController.handleRequest(action, payload);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // Manejo de archivos estáticos (Frontend UI)
  let urlPath = req.url.split('?')[0];
  try { urlPath = decodeURIComponent(urlPath); } catch (e) { urlPath = '/'; }
  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Nunca servir archivos fuera de la carpeta de la interfaz (evita leer la base de datos por URL).
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end(`Error del servidor: ${err.code}`);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: El puerto ${PORT} ya está en uso.`);
    if (process.platform === 'darwin' && PORT === 5000) {
      console.error('💡 En macOS, el servicio "Receptor AirPlay" suele ocupar el puerto 5000.');
      console.error('   Puedes iniciar el sistema en el puerto alternativo ejecutando:');
      console.error('   PORT=5050 npm start\n');
    }
    process.exit(1);
  } else {
    console.error('Error en el servidor HTTP:', err);
    process.exit(1);
  }
});

function startServer() {
  if (!server.listening) {
    server.listen(PORT, HOST, () => {
      console.log(`=======================================================`);
      console.log(`   ${APP_NAME} v${VERSION}`);
      console.log(`   Servidor Local Autónomo Operando 100% Offline`);
      console.log(`   Acceso Local: http://${HOST}:${PORT}`);
      console.log(`=======================================================`);
    });
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, server };
