#!/bin/bash

# =============================================================================
# ACTUALIZADOR DE SISTEMA - DISTRIBUIDORA ROJAS PERALTA (macOS)
# =============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo "   ACTUALIZADOR DE SISTEMA - DISTRIBUIDORA ROJAS PERALTA"
echo "   Versión macOS (MacBook Pro / MacBook Air / iMac)"
echo "======================================================="
echo ""

if [ ! -d ".git" ]; then
  echo "ℹ️  Esta copia del sistema fue descargada directamente (archivo ZIP)"
  echo "   y no está vinculada a un repositorio Git local."
  echo ""
  echo "Para actualizar:"
  echo "1. Descarga la versión más reciente del sistema."
  echo "2. Tu base de datos (ventas, clientes, inventario) se conserva en la carpeta 'database/'."
  echo ""
  read -p "Presiona Enter para cerrar esta ventana..."
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "❌ Error: Git no está disponible en este Mac."
  echo "Instala las herramientas de línea de comandos ejecutando en la Terminal:"
  echo "xcode-select --install"
  echo ""
  read -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi

echo "Descargando las últimas mejoras y funciones desde el repositorio..."
echo ""

git pull origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "======================================================="
  echo "   ¡SISTEMA ACTUALIZADO CON ÉXITO!"
  echo "   Tus ventas e inventarios se mantienen 100% seguros."
  echo "======================================================="
else
  echo ""
  echo "⚠️ Hubo un problema al sincronizar con el servidor remoto."
  echo "Verifica tu conexión a internet o si hay cambios locales no guardados."
fi

echo ""
read -p "Presiona Enter para cerrar esta ventana..."
