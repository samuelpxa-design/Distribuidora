@echo off
chcp 65001 > nul
title Resetear Base de Datos a Limpio - Distribuidora Rojas Peralta

echo =======================================================
echo    DISTRIBUIDORA ROJAS PERALTA - RESET BASE DE DATOS
echo =======================================================
echo.
echo ADVERTENCIA: Este proceso borrará las ventas de prueba actuales
echo y dejará el sistema 100%% limpio para la entrega oficial al cliente.
echo.
set /p confirm="¿Estás seguro de resetear la base de datos a limpia? (S/N): "

if /i "%confirm%"=="S" (
    echo.
    echo [1/2] Deteniendo servidor si está activo...
    taskkill /f /im node.exe >nul 2>&1
    
    echo [2/2] Eliminando base de datos con ventas de prueba...
    if exist "database\distribuidora.db" del /f /q "database\distribuidora.db"
    if exist "database\distribuidora.db-wal" del /f /q "database\distribuidora.db-wal"
    if exist "database\distribuidora.db-shm" del /f /q "database\distribuidora.db-shm"
    
    echo.
    echo ¡LISTO! La base de datos ha sido reseteada.
    echo Al iniciar el sistema, se creará automáticamente una base de datos 100%% limpia.
    echo.
) else (
    echo.
    echo Operación cancelada. No se realizó ningún cambio.
    echo.
)

pause
