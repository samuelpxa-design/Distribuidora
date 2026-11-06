/**
 * Utilidades de fecha en HORA LOCAL del equipo.
 * SQLite usa UTC por defecto en CURRENT_DATE / CURRENT_TIMESTAMP; en República Dominicana (UTC-4)
 * eso cambia el "día" a las 8:00 PM. Por eso todo el sistema usa estas funciones o
 * date('now','localtime') / datetime('now','localtime') en SQL.
 */
function pad(n) { return String(n).padStart(2, '0'); }

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ahoraLocal() {
  const d = new Date();
  return `${hoyLocal()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = { hoyLocal, ahoraLocal };
