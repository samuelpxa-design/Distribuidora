# Distribuidora Rojas Peralta — Versión 1.1.0

## Antes de actualizar
Copia el archivo `database/distribuidora.db` a un lugar seguro (por ejemplo, el escritorio). La actualización
no borra datos: al iniciar, el sistema agrega solo lo que le falta a la base de datos. Este paquete **no incluye** la
base de datos, así que tus datos no se sobrescriben al copiar los archivos.

Para actualizar: reemplaza los archivos del sistema por estos (sin tocar la carpeta `database/*.db`) y abre
`INICIAR_SISTEMA_MAC.command` como siempre.

## Finanzas (capital vs. ganancias)
- El **capital inicial** se muestra aparte y nunca cuenta como pérdida ni como ganancia.
- Comprar mercancía **no es un gasto**: es capital convertido en inventario. Su costo pasa a resultados solo cuando se vende.
- Estructura única en Gastos y Dividendos, Reportes y Dashboard:
  Ventas netas − Costo de lo vendido = **Ganancia bruta** → − Gastos operativos − Mermas = **Ganancia neta**
  → − Dividendos = **Ganancia disponible**. Capital de trabajo = capital inicial + ganancia disponible.
- Se muestra la mercancía en inventario (a costo), las cuentas por cobrar, el desglose de gastos por categoría y el ITBIS.
- La mercancía dañada (merma) se registra como gasto al costo. Las mermas anteriores se agregaron automáticamente a los gastos.
- Se pueden editar gastos, dividendos y compras a suplidores (la compra ajusta el inventario y no cuenta como gasto).

## Camiones y rutas
- **Error corregido:** después de liquidar un camión, el modal del siguiente no abría hasta refrescar la página.
- La liquidación muestra **efectivo, transferencias, cheques y crédito** por separado; solo el efectivo se entrega.
- Cada venta se liquida una sola vez (antes se volvía a contar). Un camión puede acumular ventas de varios días hasta liquidarse.
- El reporte de cuadres (pantalla, PDF y Excel) incluye la columna de transferencias.

## Actualización inmediata
- Después de cada venta, compra, carga, merma, gasto o liquidación, existencias y pantallas se actualizan solas.
- En el POS ya no se espera a salir del módulo ni a que termine la impresión: la existencia baja al momento.
- Al cambiar de almacén a camión en el POS se recargan las existencias.

## Otros errores corregidos
- Editar una venta fallaba siempre (error de base de datos). Ahora funciona y conserva el descuento.
- Las ventas por transferencia y cheque se contaban como efectivo en el cuadre.
- Fechas en hora local (antes, después de las 8:00 PM, los registros caían en el día siguiente).
- El NCF ya no se gasta si la venta falla por falta de stock.
- Reporte 607: ya no incluye tickets sin NCF ni deja fuera el último día del mes.
- El Kardex ahora registra todos los movimientos (antes estaba vacío).
- Crédito: no se permite al Consumidor Final y se respeta el límite del cliente (si es mayor que 0).
- Al anular una venta ya liquidada, la mercancía vuelve al Almacén Central.
- Seguridad local: el servidor rechaza peticiones que no sean del propio sistema y no sirve archivos fuera de la interfaz.

## Diseño
- Logo y paleta del uniforme (negro, violeta, magenta y blanco). Sin dependencias de internet (fuentes del sistema).
- El nombre de la empresa se puede cambiar en Configuración.

## Pruebas
`npm test` ejecuta 16 pruebas del flujo real del negocio sobre una base de datos temporal.
