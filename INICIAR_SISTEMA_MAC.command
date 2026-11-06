#!/bin/bash

# Lanzador local para macOS. Recarga solo el servicio propio para aplicar la versión actual.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR" || exit 1

# Detectar Node.js instalado con Homebrew, NVM, Volta, fnm o asdf.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.volta/bin:$HOME/.fnm/current/bin:$HOME/.asdf/shims:/opt/local/bin:$HOME/.local/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
  . "/usr/local/opt/nvm/nvm.sh"
fi

echo "======================================================="
echo "   DISTRIBUIDORAS ROJAS PERALTA - SISTEMA LOCAL"
echo "======================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instálalo desde https://nodejs.org"
  open "https://nodejs.org" 2>/dev/null || true
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi

NODE_VER="$(node -v 2>/dev/null)"
IS_VALID_NODE="$(node -e 'const [major, minor] = process.versions.node.split(".").map(Number); console.log(major > 22 || (major === 22 && minor >= 5) ? "OK" : "OLD");' 2>/dev/null)"
if [ "$IS_VALID_NODE" != "OK" ]; then
  echo "Node.js $NODE_VER no es compatible. Se requiere v22.5.0 o superior."
  open "https://nodejs.org" 2>/dev/null || true
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi

APP_VERSION="1.1.0"
CURRENT_UID="$(id -u)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$LAUNCH_AGENTS_DIR/com.rojas.distribuidora.localserver.plist"
AGENT_LABEL="com.rojas.distribuidora.localserver"

# Descarga únicamente el servicio de esta aplicación antes de elegir puerto y arrancar
# el código actualizado. No termina servidores de otras aplicaciones.
launchctl bootout "gui/$CURRENT_UID" "$PLIST_FILE" 2>/dev/null || true

is_port_busy() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

is_this_app_running() {
  curl -fsS --max-time 2 -X POST "http://127.0.0.1:$1/api/v1/get_app_version" \
    -H 'Content-Type: application/json' -d '{}' 2>/dev/null | grep -Fq "\"version\":\"$APP_VERSION\""
}

# Si ya está abierto, reutilizarlo y no iniciar otra copia.
for CANDIDATE in 5000 5050; do
  if is_port_busy "$CANDIDATE" && is_this_app_running "$CANDIDATE"; then
    APP_URL="http://127.0.0.1:$CANDIDATE"
    echo "El sistema ya estaba activo en $APP_URL"
    open "$APP_URL" 2>/dev/null || true
    exit 0
  fi
done

# macOS suele reservar el puerto 5000 para AirPlay; usar 5050 en ese caso.
PORT=""
for CANDIDATE in 5000 5050; do
  if ! is_port_busy "$CANDIDATE"; then
    PORT="$CANDIDATE"
    break
  fi
done

if [ -z "$PORT" ]; then
  echo "Los puertos 5000 y 5050 están ocupados por otros programas."
  echo "Cierra uno de esos programas e intenta abrir este archivo otra vez."
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi

APP_URL="http://127.0.0.1:$PORT"
LOG_DIR="$HOME/Library/Logs/DistribuidoraRojas"
APP_SUPPORT_DIR="$HOME/Library/Application Support/Distribuidora Rojas"
mkdir -p "$LOG_DIR" "$APP_SUPPORT_DIR" "$LAUNCH_AGENTS_DIR"
LOG_FILE="$LOG_DIR/sistema-local.log"
NODE_BIN="$(command -v node)"

# Instalar el servidor como servicio invisible del usuario: arranca al iniciar sesión
# y no depende de que Terminal siga abierto.
cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--no-warnings</string>
    <string>$DIR/src/main/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>HOST</key><string>127.0.0.1</string>
    <key>PATH</key><string>$PATH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_FILE</string>
  <key>StandardErrorPath</key><string>$LOG_FILE</string>
</dict>
</plist>
EOF
chmod 600 "$PLIST_FILE"

if ! launchctl bootstrap "gui/$CURRENT_UID" "$PLIST_FILE"; then
  echo "macOS no pudo registrar el inicio automático del sistema."
  echo "Detalle: $LOG_FILE"
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi
launchctl kickstart "gui/$CURRENT_UID/$AGENT_LABEL" 2>/dev/null || true

# Esperar hasta que el servidor responda antes de abrir Safari o el navegador predeterminado.
SERVER_READY="NO"
for ATTEMPT in {1..20}; do
  if is_this_app_running "$PORT"; then
    SERVER_READY="YES"
    break
  fi
  sleep 0.25
done

if [ "$SERVER_READY" != "YES" ]; then
  echo "No se pudo iniciar el sistema. Detalle del servidor:"
  tail -n 20 "$LOG_FILE" 2>/dev/null || true
  read -r -p "Presiona Enter para cerrar esta ventana..."
  exit 1
fi

open "$APP_URL" 2>/dev/null || true
echo "Sistema abierto en $APP_URL. macOS lo mantendrá activo en segundo plano."
echo "Al iniciar sesión en el Mac, el servidor arrancará automáticamente."
exit 0
