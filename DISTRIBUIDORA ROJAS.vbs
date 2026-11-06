Set WshShell = CreateObject("WScript.Shell")

' 1. Descargar actualizaciones silenciosamente desde GitHub al abrir el sistema
WshShell.Run "cmd /c git pull origin main", 0, True

' 2. Iniciar servidor local autonomo en segundo plano sin ventana negra
WshShell.Run "cmd /c node src/main/index.js", 0, False

' 3. Esperar 1 segundo para inicializacion de base de datos y puerto 5000
WScript.Sleep 1000

' 4. Abrir la aplicacion nativa de escritorio
WshShell.Run "msedge --app=http://localhost:5000", 1, False
