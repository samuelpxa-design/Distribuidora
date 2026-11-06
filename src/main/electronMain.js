const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { startServer } = require('./index');

let mainWindow;

async function createWindow() {
  // 1. Iniciar servidor local HTTP en puerto 5000 en segundo plano
  try {
    startServer();
  } catch (e) {
    console.log('El servidor ya se encuentra operando en puerto 5000');
  }

  // 2. Crear la ventana nativa de escritorio
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Distribuidoras Rojas Peralta - Sistema de Ventas & DGII',
    icon: path.join(__dirname, '../ui/assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Ocultar barra de menú predeterminada de navegador
  Menu.setApplicationMenu(null);
  mainWindow.maximize();

  // Cargar la aplicación local
  mainWindow.loadURL('http://localhost:5000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
