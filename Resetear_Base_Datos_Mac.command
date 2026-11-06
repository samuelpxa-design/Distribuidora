#!/bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR" || exit 1

echo "======================================================="
echo "   DISTRIBUIDORA ROJAS PERALTA - REINICIO PROTEGIDO"
echo "======================================================="
echo "Este proceso elimina todas las operaciones y reinicia la base de datos."
echo "La contraseña de borrado debe configurarse primero desde el sistema."
echo ""

read -r -p "Escribe BORRAR para continuar: " CONFIRMATION
if [ "$CONFIRMATION" != "BORRAR" ]; then
  echo "Operación cancelada."
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 0
fi

read -r -s -p "Contraseña exclusiva de borrado: " RESET_KEY
echo ""

RESET_KEY="$RESET_KEY" node --no-warnings -e '
  const ResetPasswordService = require("./resetPasswordService");
  if (!ResetPasswordService.verifyPassword(process.env.RESET_KEY)) process.exit(1);
' 2>/dev/null
PASSWORD_STATUS=$?
unset RESET_KEY

if [ "$PASSWORD_STATUS" -ne 0 ]; then
  echo "Contraseña incorrecta o todavía no configurada. No se modificó la base de datos."
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$LAUNCH_AGENTS_DIR/com.rojas.distribuidora.localserver.plist"
AGENT_LABEL="com.rojas.distribuidora.localserver"
CURRENT_UID="$(id -u)"

# Pausar el servicio mientras se reconstruyen las tablas.
if [ -f "$PLIST_FILE" ]; then
  launchctl bootout "gui/$CURRENT_UID" "$PLIST_FILE" 2>/dev/null || true
fi

node --no-warnings -e 'const { resetDatabase } = require("./src/data/connection"); console.log(resetDatabase().mensaje);'
RESET_STATUS=$?

# Volver a levantar el servicio después del reinicio de la base de datos.
if [ -f "$PLIST_FILE" ]; then
  launchctl bootstrap "gui/$CURRENT_UID" "$PLIST_FILE" 2>/dev/null || true
  launchctl kickstart "gui/$CURRENT_UID/$AGENT_LABEL" 2>/dev/null || true
fi

read -r -p "Presiona Enter para cerrar esta ventana..."
exit "$RESET_STATUS"
