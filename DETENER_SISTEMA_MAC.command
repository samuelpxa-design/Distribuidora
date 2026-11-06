#!/bin/bash

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$LAUNCH_AGENTS_DIR/com.rojas.distribuidora.localserver.plist"
AGENT_LABEL="com.rojas.distribuidora.localserver"
CURRENT_UID="$(id -u)"

if [ ! -f "$PLIST_FILE" ]; then
  echo "El inicio automático del sistema no está configurado."
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 0
fi

launchctl bootout "gui/$CURRENT_UID" "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"
echo "Servidor detenido y retirado del inicio automático."
echo "Para volver a iniciarlo, abre INICIAR_SISTEMA_MAC.command."
read -r -p "Presiona Enter para cerrar esta ventana..."
