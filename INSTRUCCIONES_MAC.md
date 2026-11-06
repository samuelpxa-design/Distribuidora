# 🍎 Guía de Instalación y Uso en MacBook / macOS

Este sistema es **100% compatible** con cualquier computadora Mac:
- **MacBook Air** y **MacBook Pro**
- **iMac**, **Mac mini** y **Mac Studio**
- Compatible con **Apple Silicon (M1, M2, M3, M4)** y procesadores **Intel**.

---

## ⚡ Requisito Único (Solo la primera vez)

El sistema opera de forma local y autónoma con **cero dependencias externas** (no requiere compilar herramientas ni ejecutar `npm install`). Solo necesitas tener instalado **Node.js**:

1. Ingresa a la página oficial: **[https://nodejs.org](https://nodejs.org)**.
2. Descarga la versión **LTS recomendada** (**Node.js 22 LTS o superior**).
   > [!IMPORTANT]
   > Requiere **Node.js v22.5.0 o superior** (Node 22 LTS o Node 24) debido a que utiliza el motor nativo de alta velocidad integrado `node:sqlite`. No utilices Node 20 o versiones anteriores.
3. Abre el archivo descargado (`.pkg`) y sigue los pasos del asistente de instalación estándar de macOS.

---

## 🚀 Cómo Iniciar el Sistema

Para abrir el sistema en cualquier momento, haz **doble clic** en cualquiera de estos dos accesos directos:

- **`INICIAR_SISTEMA_MAC.command`**
- o **`DISTRIBUIDORA_ROJAS_MAC.command`**

### ¿Qué ocurrirá automáticamente?
1. Configurará el servidor local para iniciarse en segundo plano al iniciar sesión; no necesitas dejar Terminal abierta.
2. Abrirá el sistema en el navegador predeterminado, normalmente en **http://127.0.0.1:5000** (o **http://127.0.0.1:5050** si el puerto 5000 está ocupado).
3. Después de configurarlo la primera vez, el servidor arrancará al iniciar sesión en el Mac y podrás abrir el acceso de Safari directamente.
4. Para detenerlo y quitarlo del inicio automático, haz doble clic en **`DETENER_SISTEMA_MAC.command`**.

## 🔐 Protección para borrar la base de datos

La primera vez que abras **Configuración > Zona de Peligro > Borrar Base de Datos**, el sistema te pedirá crear una contraseña exclusiva de al menos 8 caracteres. Después, para borrar, tendrás que escribir esa contraseña, confirmar con **BORRAR** y aceptar la confirmación final. Guarda la contraseña en un lugar seguro; el sistema almacena solo una huella y no puede recuperarla.

---

## 🔐 Primera vez en Mac: Permisos de Seguridad (Gatekeeper)

macOS cuenta con un sistema de seguridad (Gatekeeper) que protege los archivos descargados de internet. Si al hacer doble clic por primera vez te aparece un mensaje como *"No se puede abrir porque proviene de un desarrollador no identificado"* o *"No tienes privilegios de acceso"*, aplica cualquiera de estas dos soluciones rápidas:

### Opción A (La más sencilla - Clic Derecho):
1. Haz **Control + Clic** (o clic derecho) sobre **`INICIAR_SISTEMA_MAC.command`**.
2. Selecciona **Abrir** en el menú contextual.
3. En el cuadro de diálogo que aparece, haz clic en el botón **Abrir**.
*(Solo necesitas hacer esto la primera vez; a partir de ahí se abrirá con doble clic normal).*

### Opción B (Terminal - En un solo paso):
1. Abre la aplicación **Terminal** (presiona `Cmd + Espacio` y escribe `Terminal`).
2. Escribe `cd ` (con un espacio al final) y arrastra la carpeta del sistema a la ventana de la Terminal, luego presiona `Enter`.
3. Escribe este comando y presiona `Enter`:
   ```bash
   chmod +x *.command
   ```
4. Listo, ahora todos los accesos directos funcionarán directamente con doble clic.

> [!TIP]
> También puedes iniciar el sistema directamente desde la Terminal escribiendo:
> ```bash
> bash INICIAR_SISTEMA_MAC.command
> ```
> El comando `bash` se ejecuta de inmediato sin requerir permisos previos de Gatekeeper y auto-habilita los permisos para el futuro.

---

## 💡 Manejo Automático de Puerto y AirPlay en macOS

En versiones modernas de macOS (Monterey, Ventura, Sonoma, Sequoia), el sistema operativo activa por defecto el **Receptor AirPlay** de Apple, el cual ocupa el puerto `5000`.

**No te preocupes:** Nuestro script lanzador detecta automáticamente si AirPlay está ocupando el puerto 5000 y conmuta al instante al puerto **`5050`**, abriendo tu navegador en la dirección correcta sin errores ni bloqueos.

---

## 🛠️ Herramientas Adicionales Incluidas para Mac

| Archivo | Función |
| :--- | :--- |
| **`INICIAR_SISTEMA_MAC.command`** | Inicia el sistema, valida Node.js, resuelve puertos y abre el navegador. |
| **`DISTRIBUIDORA_ROJAS_MAC.command`** | Acceso directo rápido de escritorio. |
| **`DETENER_SISTEMA_MAC.command`** | Detiene el servidor que se inició en segundo plano. |
| **`Actualizar_Sistema_Mac.command`** | Descarga las últimas funciones y mejoras desde GitHub sin tocar tu base de datos ni ventas. |
| **`Resetear_Base_Datos_Mac.command`** | Reinicio manual de emergencia protegido por la misma contraseña de borrado. |

---

## 🛡️ Seguridad y Respaldo de Datos en Mac

- Todos tus datos, facturas, clientes, nóminas e inventarios se almacenan localmente en:
  `database/distribuidora.db`
- El sistema funciona **100% sin conexión a internet**.
- Para hacer un respaldo manual en Mac, simplemente copia el archivo `database/distribuidora.db` a una memoria USB, carpeta de iCloud Drive o disco externo.


---
**Versión 1.1.0:** lee `CAMBIOS_v1.1.md` para ver qué cambió. Antes de actualizar, copia `database/distribuidora.db` como respaldo.
