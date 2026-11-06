/**
 * LÓGICA DE INTERFAZ Y COMUNICACIÓN CON SERVER LOCAL - DISTRIBUIDORA ROJAS PERALTA
 */

let state = {
  productos: [],
  clientes: [],
  vehiculos: [],
  cart: [],
  currentAlmacenId: 1,
  cuadreCamionId: null,
  cuadreEfectivoEsperado: 0,
  cuadreGuardando: false,
  compraOriginal: null,
  ultimoReporteCuadres: null
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initClock();
  loadConfiguracionEmpresa();
  loadDashboardData();
  loadProductosData();
  loadVehiculosData();
  loadNotificaciones();
  initLiveUpdateChecker();

  // Actualizar notificaciones periódicamente cada 30 segundos
  setInterval(loadNotificaciones, 30000);

  // Atajo F2 para enfocar el buscador POS
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      switchView('pos');
      const searchInput = document.getElementById('pos-search');
      if (searchInput) searchInput.focus();
    }
  });

  // Cierra cualquier menú desplegable abierto al hacer clic fuera o hacer scroll
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.actions-dropdown') && !e.target.closest('.dropdown-content')) {
      document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
    }
    if (!e.target.closest('.notification-dropdown-container')) {
      const notifMenu = document.getElementById('notification-menu-dropdown');
      if (notifMenu) notifMenu.classList.remove('show');
    }
  });

  window.addEventListener('scroll', () => {
    document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));
  }, true);
});

function toggleDropdownMenu(event, id) {
  if (event) event.stopPropagation();
  const btn = event ? event.currentTarget : null;
  const targetDropdown = document.getElementById(id);
  const isShow = targetDropdown ? targetDropdown.classList.contains('show') : false;

  document.querySelectorAll('.dropdown-content.show').forEach(el => el.classList.remove('show'));

  if (!isShow && targetDropdown && btn) {
    const rect = btn.getBoundingClientRect();
    const dropdownWidth = 185;
    
    // Posicionamiento fixed dinámico para evitar cortes por desborde de tablas o contenedores
    targetDropdown.style.position = 'fixed';
    targetDropdown.style.top = `${rect.bottom + 4}px`;
    targetDropdown.style.left = `${Math.max(10, rect.right - dropdownWidth)}px`;
    targetDropdown.style.zIndex = '999999';
    targetDropdown.classList.add('show');
  }
}

// Reloj en tiempo real
function initClock() {
 const clockEl = document.getElementById('clock-display');
 function updateTime() {
 const now = new Date();
 clockEl.textContent = now.toLocaleDateString('es-DO', {
 weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
 hour: '2-digit', minute: '2-digit', second: '2-digit'
 });
 }
 updateTime();
 setInterval(updateTime, 1000);
}

// Navegación entre vistas (Sidebar)
function initNavigation() {
 const navItems = document.querySelectorAll('.nav-item');
 const viewTitle = document.getElementById('current-view-title');

 const titles = {
 dashboard: 'Dashboard General',
 pos: 'Punto de Venta (POS)',
 sales: 'Ventas & Estado Fiscal DGII',
 trucks: 'Camiones & Rutas de Reparto',
 inventory: 'Inventario Central & Almacenes',
 billing: 'Facturación DGII & NCF',
 customers: 'Clientes & Cuentas por Cobrar',
 finance: 'Gastos, Nómina & Dividendos'
 };

 navItems.forEach(item => {
 item.addEventListener('click', (e) => {
 e.preventDefault();
 const view = item.getAttribute('data-view');
 
 navItems.forEach(n => n.classList.remove('active'));
 item.classList.add('active');

 const titleEl = document.getElementById('current-view-title');
 const viewPanels = document.querySelectorAll('.view-panel');

 const titleMap = {
 'dashboard': 'Dashboard General & KPIs',
 'pos': 'Punto de Venta (POS)',
 'sales': 'Historial General de Ventas',
 'trucks': 'Control de Camiones & Rutas de Reparto',
 'inventory': 'Catálogo e Inventario Multi-Almacén',
 'billing': 'Facturación Fiscal & Comprobantes NCF (DGII)',
 'reports': 'Reportes & Contabilidad',
 'suppliers': 'Gestión de Proveedores & Suplidores',
 'payroll': 'Gestión de Nóminas, Empleados & Adelantos',
 'customers': 'Cartera de Clientes & Cuentas por Cobrar',
 'finance': 'Gastos Operativos & Ganancias Limpias',
 'settings': 'Perfil & Configuración de la Empresa'
 };

 if (titleEl) titleEl.textContent = titleMap[view] || 'Sistema de Ventas';

 navItems.forEach(item => {
 if (item.dataset.view === view) {
 item.classList.add('active');
 } else {
 item.classList.remove('active');
 }
 });

 viewPanels.forEach(panel => {
 if (panel.id === `view-${view}`) {
 panel.classList.add('active');
 } else {
 panel.classList.remove('active');
 }
 });

 // Cargar datos según la vista
 if (view === 'dashboard') loadDashboardData();
 if (view === 'pos') renderPOS();
 if (view === 'sales') renderVentasHistorialView();
 if (view === 'inventory') renderInventarioCompleto();
 if (view === 'trucks') renderCamiones();
 if (view === 'billing') loadFacturasDGIITable();
 if (view === 'reports') renderReportesContabilidad();
 if (view === 'suppliers') loadProveedoresData();
 if (view === 'payroll') renderPayrollView();
 if (view === 'customers') renderClientes();
 if (view === 'finance') renderFinanzas();
 if (view === 'settings') loadConfiguracionEmpresa();

 // Auto-cerrar menú lateral en móviles al seleccionar una vista
 const sidebar = document.querySelector('aside.sidebar');
 const overlay = document.getElementById('sidebar-overlay');
 if (sidebar && sidebar.classList.contains('mobile-open')) {
   sidebar.classList.remove('mobile-open');
   if (overlay) overlay.classList.remove('active');
 }
 });
 });
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('aside.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
}

function switchView(viewName) {
 const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
 if (navItem) navItem.click();
}

// Petición genérica a la API local con reintento automático offline
const ACCIONES_SOLO_LECTURA = /^(get_|validar_|check_|is_|buscar_|listar_)/;

async function apiCall(action, payload = {}, retries = 2) {
 for (let attempt = 0; attempt <= retries; attempt++) {
 try {
 const res = await fetch(`/api/v1/${action}`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload)
 });
 const data = await res.json();
 // Toda operación que cambia datos (venta, compra, gasto, carga, liquidación...) actualiza la pantalla al instante.
 if (data && data.status === 'ok' && !ACCIONES_SOLO_LECTURA.test(action)) {
   programarRefrescoGlobal();
 }
 return data;
 } catch (err) {
 if (attempt < retries) {
 await new Promise(r => setTimeout(r, 500));
 continue;
 }
 console.error('Error de API local:', err);
 return { 
 status: 'error', 
 message: 'No se pudo conectar con el servidor local. Revisa que el sistema esté encendido.' 
 };
 }
 }
}

// =============================================================================
// ACTUALIZACIÓN INMEDIATA: tras cualquier cambio se recargan existencias, camiones y la vista abierta
// =============================================================================
let refrescoGlobalTimer = null;
let refrescoGlobalEnCurso = false;

function programarRefrescoGlobal() {
  clearTimeout(refrescoGlobalTimer);
  refrescoGlobalTimer = setTimeout(refrescarVistaActiva, 80);
}

async function refrescarVistaActiva() {
  if (refrescoGlobalEnCurso) { programarRefrescoGlobal(); return; }
  refrescoGlobalEnCurso = true;
  try {
    const panel = document.querySelector('.view-panel.active');
    const vista = panel ? panel.id.replace('view-', '') : 'dashboard';

    // Datos compartidos por varios módulos
    await Promise.all([loadProductosData(), loadVehiculosData()]);

    if (vista === 'pos') { renderPOSList(); if (typeof updateCartUI === 'function') updateCartUI(); }
    else if (vista === 'dashboard') await loadDashboardData();
    else if (vista === 'sales') await renderVentasHistorialView();
    else if (vista === 'trucks') await renderCamiones();
    else if (vista === 'inventory') await renderInventarioCompleto();
    else if (vista === 'reports') await renderReportesContabilidad();
    else if (vista === 'suppliers') await loadProveedoresData();
    else if (vista === 'customers') await renderClientes();
    else if (vista === 'finance') await renderFinanzas();
    loadNotificaciones();
  } catch (e) {
    console.error('Error al refrescar la vista:', e);
  } finally {
    refrescoGlobalEnCurso = false;
  }
}

// Al volver a la ventana del sistema se vuelve a sincronizar
document.addEventListener('visibilitychange', () => { if (!document.hidden) programarRefrescoGlobal(); });
window.addEventListener('focus', programarRefrescoGlobal);

function fmtRD(n) {
  return `RD$ ${(Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function escHtml(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Cargar resumen del Dashboard Ejecutivo
async function loadDashboardData() {
  const res = await apiCall('get_dashboard_summary');
  if (res.status === 'ok') {
    const d = res.data;
    
    // 1. Poblar Métricas KPI
    const vHoy = document.getElementById('kpi-ventas-hoy');
    const fCount = document.getElementById('kpi-facturas-count');
    const cxcEl = document.getElementById('kpi-cxc-pendiente');
    const camionesEl = document.getElementById('kpi-camiones-activos');
    const ganEl = document.getElementById('kpi-ganancia-mes');

    if (vHoy) vHoy.textContent = `RD$ ${(d.ventas_hoy || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (fCount) fCount.textContent = `${d.facturas_hoy || 0} Facturas Emitidas Hoy`;
    if (cxcEl) cxcEl.textContent = `RD$ ${(d.cxc_pendientes || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (camionesEl) camionesEl.textContent = `${d.camiones_activos_count || 0} / ${d.camiones_totales_count || 0}`;
    const invEl = document.getElementById('kpi-inventario-costo');
    const capSub = document.getElementById('kpi-capital-sub');
    if (invEl) invEl.textContent = fmtRD(d.inventario_costo_actual || 0);
    if (capSub) capSub.textContent = `Valor a costo · Capital inicial ${fmtRD(d.capital_inicial || 0)}`;
    if (ganEl) {
      const ganVal = Number(d.ganancia_neta_mes) || 0;
      ganEl.textContent = `RD$ ${ganVal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
      ganEl.style.color = ganVal >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    }

    // 2. Alertas de Inventario Bajo Mínimo
    const invAlertContainer = document.getElementById('dash-alertas-inventario');
    if (invAlertContainer) {
      const stockBajo = d.alertas_stock_bajo || [];
      if (stockBajo.length === 0) {
        invAlertContainer.innerHTML = `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">Todos los productos con stock óptimo</span>`;
      } else {
        invAlertContainer.innerHTML = stockBajo.map(p => `
          <div style="margin-bottom: 4px;">
            <span class="badge" style="background:#fef2f2; color:#991b1b; font-weight:700;">[REORDEN URGENTE]</span>
            <b>${p.nombre}</b>: Quedan <b>${p.stock_actual}</b> unid (Mínimo: ${p.stock_minimo})
          </div>
        `).join('');
      }
    }

    // 3. Alertas de Secuencias NCF
    const ncfAlertContainer = document.getElementById('dash-alertas-ncf');
    if (ncfAlertContainer) {
      const ncfAlerts = d.alertas_ncf || [];
      if (ncfAlerts.length === 0) {
        ncfAlertContainer.innerHTML = `<span class="badge" style="background:#efe5f8; color:#5a189a; font-weight:700;">Todas las secuencias NCF operando con buen margen</span>`;
      } else {
        ncfAlertContainer.innerHTML = ncfAlerts.map(s => `
          <div style="margin-bottom: 4px;">
            <span class="badge" style="background:#fff3dc; color:#92400e; font-weight:700;">[ATENCIÓN NCF]</span>
            <b>${s.tipo_ncf}</b>: ${s.disponibles} secuencias disponibles (Vence: ${s.fecha_vencimiento})
          </div>
        `).join('');
      }
    }

    // 4. Top 5 Productos
    const topTable = document.getElementById('tbl-dash-top-productos');
    if (topTable) {
      const topProds = d.top_productos || [];
      if (topProds.length === 0) {
        topTable.innerHTML = `<tr><td colspan="3" style="text-align:center;">No hay ventas este mes.</td></tr>`;
      } else {
        topTable.innerHTML = topProds.map(p => `
          <tr>
            <td><b>${p.nombre}</b></td>
            <td>${p.total_unidades_vendidas} unid</td>
            <td><strong>RD$ ${p.total_monto_generado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
          </tr>
        `).join('');
      }
    }

    // 5. Estado de Vehículos en Ruta Hoy
    const vehTable = document.getElementById('tbl-dash-vehiculos-status');
    if (vehTable) {
      const vehs = d.vehiculos_status || [];
      if (vehs.length === 0) {
        vehTable.innerHTML = `<tr><td colspan="3" style="text-align:center;">No hay vehículos registrados.</td></tr>`;
      } else {
        vehTable.innerHTML = vehs.map(v => `
          <tr>
            <td><b>${v.nombre}</b> (Placa: ${v.placa_camion || 'N/A'})</td>
            <td>${v.chofer_asignado || 'Sin chofer'}</td>
            <td><strong style="color:var(--color-primary);">RD$ ${v.ventas_hoy.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
          </tr>
        `).join('');
      }
    }
  }

  // 6. Cargar tabla de últimas ventas
  const ventasRes = await apiCall('get_ventas', { limit: 10 });
  if (ventasRes.status === 'ok') {
    const tbody = document.getElementById('tbl-ultimas-ventas');
    if (!ventasRes.data || ventasRes.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No hay ventas registradas aún.</td></tr>`;
      return;
    }
    tbody.innerHTML = ventasRes.data.map(v => `
      <tr>
        <td>#${v.id}</td>
        <td><strong style="color: var(--color-primary);">${v.ncf}</strong></td>
        <td><span class="badge" style="background: #efe5f8; color: #5a189a; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${v.tipo_ncf}</span></td>
        <td>${v.nombre_cliente || 'Consumidor Final'}</td>
        <td>${v.almacen_nombre || 'Almacén Central'}</td>
        <td>${v.tipo_pago}</td>
        <td><strong>RD$ ${v.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        <td>${new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
    `).join('');
  }
}

// Cargar productos
async function loadProductosData() {
 const res = await apiCall('get_productos');
 if (res.status === 'ok') {
 state.productos = res.data;
 }
}

// Cargar clientes para POS y listas
async function loadClientesData() {
 const res = await apiCall('get_clientes');
 if (res.status === 'ok') {
 state.clientes = res.data;
 const select = document.getElementById('pos-cliente-select');
 if (select) {
 select.innerHTML = state.clientes.map(c => `
 <option value="${c.id}">${c.id} - ${c.nombre}${c.rnc_cedula ? ` (RNC/Cédula: ${c.rnc_cedula})` : ''}</option>
 `).join('');
 }
 }
}

function togglePOSNCFSelect() {
 const check = document.getElementById('pos-emitir-ncf-check');
 const container = document.getElementById('pos-ncf-container');
 if (check && container) {
 container.style.display = check.checked ? 'block' : 'none';
 }
}

function onClienteSelectChange() {
 const select = document.getElementById('pos-cliente-select');
 if (!select) return;
 const clienteId = parseInt(select.value, 10);
 const cliente = state.clientes.find(c => c.id === clienteId);
 if (cliente && cliente.tipo_ncf_defecto) {
 document.getElementById('pos-ncf-select').value = cliente.tipo_ncf_defecto;
 }
}

// Normalizador de texto para búsqueda inteligente (ignora mayúsculas y tildes)
function normalizeText(str) {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Emisor de tono de audio para escáner POS
function playScannerBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {}
}

function onPOSAlmacenChange() {
  const almacenSelect = document.getElementById('pos-almacen-select');
  if (!almacenSelect) return;

  state.currentAlmacenId = parseInt(almacenSelect.value, 10);
  const veh = (state.vehiculos || []).find(v => v.id === state.currentAlmacenId);
  const badge = document.getElementById('pos-origen-badge');
  
  if (badge) {
    if (state.currentAlmacenId === 1) {
      badge.textContent = 'Venta desde: Almacén Principal Central';
      badge.style.color = 'var(--color-primary)';
      badge.style.background = '#f4edfa';
    } else if (veh) {
      badge.textContent = `Venta asignada a: ${veh.nombre} (${veh.chofer_asignado || 'Sin chofer'})`;
      badge.style.color = '#d97706';
      badge.style.background = '#fffbeb';
    }
  }

  renderPOSList();
  // Las existencias se recargan al cambiar de almacén/camión para no mostrar cantidades viejas
  loadProductosData().then(() => { if (state.currentAlmacenId === parseInt(almacenSelect.value, 10)) renderPOSList(); });
}

// Renderizar POS
function renderPOS() {
  Promise.all([loadClientesData(), loadProductosData(), loadVehiculosData()]).then(() => {
    onPOSAlmacenChange();

    const searchInput = document.getElementById('pos-search');
    if (searchInput) {
      searchInput.oninput = () => renderPOSList();
      searchInput.onkeydown = handlePOSSearchKeyDown;
      setTimeout(() => searchInput.focus(), 100);
    }
  });
}

// Manejador de tecla Enter en el buscador (Escáner de código de barras)
function handlePOSSearchKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const searchInput = document.getElementById('pos-search');
    const query = normalizeText(searchInput.value);
    if (!query) return;

    // Buscar coincidencia exacta por código de barras o código interno
    const exactMatch = state.productos.find(p => 
      normalizeText(p.codigo_barras) === query || 
      normalizeText(p.codigo_interno) === query
    );

    const filtered = getFilteredPOSProducts();

    let targetProduct = exactMatch;
    if (!targetProduct && filtered.length === 1) {
      targetProduct = filtered[0];
    }

    if (targetProduct) {
      const stock = targetProduct.stock_desglose[state.currentAlmacenId] || 0;
      if (stock > 0) {
        addToCart(targetProduct.id);
        playScannerBeep();
        searchInput.value = '';
        renderPOSList();
      } else {
        alert(` El producto "${targetProduct.nombre}" no tiene stock disponible en el origen seleccionado.`);
      }
    }
  }
}

// Obtener lista filtrada de productos POS
function getFilteredPOSProducts() {
  const searchInput = document.getElementById('pos-search');
  const query = normalizeText(searchInput ? searchInput.value : '');

  if (!query) return state.productos || [];

  return (state.productos || []).filter(p => {
    const codInt = normalizeText(p.codigo_interno);
    const codBar = normalizeText(p.codigo_barras);
    const nom = normalizeText(p.nombre);
    const cat = normalizeText(p.categoria_nombre);

    return codInt.includes(query) || codBar.includes(query) || nom.includes(query) || cat.includes(query);
  });
}

function renderPOSList() {
  const tbody = document.getElementById('pos-products-list');
  const filteredProds = getFilteredPOSProducts();

  if (!filteredProds || filteredProds.length === 0) {
    const searchInput = document.getElementById('pos-search');
    const query = searchInput ? searchInput.value : '';
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding: 24px; color: var(--color-text-muted);">
          No se encontraron productos que coincidan con "<b>${query}</b>".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredProds.map(p => {
    const stockDispon = p.stock_desglose[state.currentAlmacenId] || 0;
    return `
      <tr>
        <td><code>${p.codigo_interno}</code></td>
        <td><strong>${p.nombre}</strong> <span style="font-size: 11px; color: #666;">(${p.unidad_medida})</span></td>
        <td>RD$ ${p.precio_mayorista.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td><span style="font-weight: 700; color: ${stockDispon > 0 ? 'var(--color-success)' : 'var(--color-danger)'}">${stockDispon} ${p.unidad_medida}</span></td>
        <td>
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" 
            ${stockDispon <= 0 ? 'disabled' : ''} 
            onclick="addToCart(${p.id})">
            + Agregar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Carrito de compras POS
function addToCart(productoId) {
 const prod = state.productos.find(p => p.id === productoId);
 if (!prod) return;

 const itemExist = state.cart.find(i => i.id_producto === productoId);
 if (itemExist) {
 itemExist.cantidad += 1;
 } else {
 state.cart.push({
 id_producto: prod.id,
 nombre: prod.nombre,
 precio_unitario: prod.precio_mayorista,
 itbis_porcentaje: prod.itbis_porcentaje,
 cantidad: 1
 });
 }
 updateCartUI();
}

function updateCartUI() {
  const cartContainer = document.getElementById('pos-cart-items');
  if (!cartContainer) return;

  if (state.cart.length === 0) {
    cartContainer.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 40px 10px;">Selecciona productos para armar la venta.</div>`;
    recalcularTotalesCarrito();
    return;
  }

  cartContainer.innerHTML = state.cart.map((item, idx) => {
    const qty = parseFloat(item.cantidad) || 0;
    const price = parseFloat(item.precio_unitario) || 0;
    const itemTotal = qty * price;

    return `
      <div class="cart-item-row" style="display: grid; grid-template-columns: 1.2fr 65px 95px 85px 25px; gap: 6px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1edf6;">
        <div>
          <div style="font-weight: 600; font-size: 12px; line-height: 1.2;">${item.nombre}</div>
        </div>
        <div>
          <label style="font-size: 9px; color: #6b6578; font-weight:700; display: block;">Cant.</label>
          <input type="number" min="1" step="1" value="${item.cantidad}" class="input-control" style="padding: 2px 4px; font-size: 12px; font-weight:700;" oninput="updateCartQty(${idx}, this.value)">
        </div>
        <div>
          <label style="font-size: 9px; color: #6b6578; font-weight:700; display: block;">Precio c/u</label>
          <input type="number" step="0.01" value="${item.precio_unitario}" class="input-control" style="padding: 2px 4px; font-size: 12px; font-weight:700;" oninput="updateCartPrice(${idx}, this.value)">
        </div>
        <div style="font-weight: 700; font-size: 12px; text-align: right; color: var(--color-primary);" id="pos-item-total-${idx}">
          RD$ ${itemTotal.toFixed(2)}
        </div>
        <div style="text-align: center;">
          <button style="border: none; background: none; color: var(--color-danger); cursor: pointer; font-size: 18px; font-weight: 800;" onclick="removeFromCart(${idx})" title="Eliminar ítem">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  recalcularTotalesCarrito();
}

function updateCartQty(idx, val) {
  if (!state.cart[idx]) return;
  const qty = parseFloat(val);
  state.cart[idx].cantidad = (!isNaN(qty) && qty >= 0) ? qty : 0;
  
  actualizarFilaCart(idx);
  recalcularTotalesCarrito();
}

function updateCartPrice(idx, val) {
  if (!state.cart[idx]) return;
  const price = parseFloat(val);
  state.cart[idx].precio_unitario = (!isNaN(price) && price >= 0) ? price : 0;
  
  actualizarFilaCart(idx);
  recalcularTotalesCarrito();
}

function actualizarFilaCart(idx) {
  const item = state.cart[idx];
  if (!item) return;
  const qty = parseFloat(item.cantidad) || 0;
  const price = parseFloat(item.precio_unitario) || 0;
  const itemTotal = qty * price;

  const itemTotalEl = document.getElementById(`pos-item-total-${idx}`);
  if (itemTotalEl) {
    itemTotalEl.textContent = `RD$ ${itemTotal.toFixed(2)}`;
  }
}

function recalcularTotalesCarrito() {
  let subtotal = 0;

  state.cart.forEach(item => {
    const qty = parseFloat(item.cantidad) || 0;
    const price = parseFloat(item.precio_unitario) || 0;
    subtotal += (qty * price);
  });

  const descPctInput = document.getElementById('pos-descuento-pct');
  const descPct = descPctInput ? (parseFloat(descPctInput.value) || 0) : 0;
  const descuentoMonto = subtotal * (descPct / 100);
  const total = Math.max(0, subtotal - descuentoMonto);

  const subEl = document.getElementById('pos-subtotal');
  const itbEl = document.getElementById('pos-itbis');
  const totEl = document.getElementById('pos-total');
  const rowDescEl = document.getElementById('pos-row-descuento');
  const descLabelEl = document.getElementById('pos-descuento-pct-label');
  const descMontoEl = document.getElementById('pos-descuento-monto');

  if (subEl) subEl.textContent = `RD$ ${subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  if (itbEl) itbEl.textContent = `RD$ 0.00`;
  if (totEl) totEl.textContent = `RD$ ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

  if (rowDescEl && descLabelEl && descMontoEl) {
    if (descPct > 0) {
      rowDescEl.style.display = 'flex';
      descLabelEl.textContent = descPct.toString();
      descMontoEl.textContent = `-RD$ ${descuentoMonto.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      rowDescEl.style.display = 'none';
    }
  }

  calcularCambioPOS();
}

function calcularCambioPOS() {
  let subtotal = 0;
  state.cart.forEach(item => {
    const qty = parseFloat(item.cantidad) || 0;
    const price = parseFloat(item.precio_unitario) || 0;
    subtotal += (qty * price);
  });

  const descPctInput = document.getElementById('pos-descuento-pct');
  const descPct = descPctInput ? (parseFloat(descPctInput.value) || 0) : 0;
  const descuentoMonto = subtotal * (descPct / 100);
  const total = Math.max(0, subtotal - descuentoMonto);

  const entregadoInput = document.getElementById('pos-monto-entregado');
  const cambioEl = document.getElementById('pos-cambio-devuelto');
  
  if (!entregadoInput || !cambioEl) return;

  const entregado = parseFloat(entregadoInput.value) || 0;
  const cambio = Math.max(0, entregado - total);

  cambioEl.textContent = `RD$ ${cambio.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function removeFromCart(idx) {
  state.cart.splice(idx, 1);
  updateCartUI();
}

// Procesar Venta POS
async function procesarVentaPOS() {
  if (state.cart.length === 0) {
    alert('El carrito de compras está vacío.');
    return;
  }
  if (state.ventaEnProceso) return; // evita ventas duplicadas por doble clic
  state.ventaEnProceso = true;

  try {
    const idCliente = parseInt(document.getElementById('pos-cliente-select').value, 10);
    const clienteObj = state.clientes.find(c => c.id === idCliente) || { nombre: 'CLIENTE CONTADO', rnc_cedula: null };
    const emitirNCFInmediato = document.getElementById('pos-emitir-ncf-check').checked;
    const tipoNCF = document.getElementById('pos-ncf-select').value;
    const tipoPago = document.getElementById('pos-pago-select').value;

    let subtotal = 0;
    state.cart.forEach(item => {
      const qty = parseFloat(item.cantidad) || 0;
      const price = parseFloat(item.precio_unitario) || 0;
      subtotal += (qty * price);
    });

    const descPctInput = document.getElementById('pos-descuento-pct');
    const descPct = descPctInput ? (parseFloat(descPctInput.value) || 0) : 0;
    const descuentoGlobal = subtotal * (descPct / 100);

    const payload = {
      tipoNCF,
      idCliente,
      rncCliente: clienteObj.rnc_cedula,
      nombreCliente: clienteObj.nombre,
      idAlmacen: state.currentAlmacenId,
      tipoPago,
      emitirNCFInmediato,
      descuentoGlobal,
      detalles: state.cart
    };

    const res = await apiCall('registrar_venta', payload);
    if (res.status !== 'ok') {
      alert(` Error al procesar venta: ${res.message}`);
      return;
    }

    const totalVenta = res.data.total;
    const ventaId = res.data.ventaId;

    // 1) PRIMERO se actualiza la pantalla: carrito vacío y existencias nuevas (antes de imprimir)
    if (descPctInput) descPctInput.value = '0';
    const entregadoInput = document.getElementById('pos-monto-entregado');
    if (entregadoInput) entregadoInput.value = '';
    state.cart = [];
    updateCartUI();
    await loadProductosData();
    renderPOSList();

    showToastNotification('Venta Realizada', `Venta #${ventaId} registrada con éxito por RD$ ${totalVenta.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`, 'exito');
    checkMilestoneVentas20k(totalVenta);

    // 2) El ticket se imprime sin bloquear la pantalla (el diálogo de impresión ya no congela el sistema)
    setTimeout(() => { imprimirTicketTermico(ventaId).catch(e => console.error('Ticket:', e)); }, 60);

    loadDashboardData();
    loadNotificaciones();
  } finally {
    state.ventaEnProceso = false;
  }
}

// Helper para Filtros Rápidos de Período en Inventario
function setFiltroInventarioPeriodo(tipo) {
  document.querySelectorAll('.btn-inv-periodo').forEach(b => b.classList.remove('active'));
  const btnActive = document.getElementById(`btn-inv-${tipo}`);
  if (btnActive) btnActive.classList.add('active');

  const inputDesde = document.getElementById('inv-fecha-desde');
  const inputHasta = document.getElementById('inv-fecha-hasta');
  if (!inputDesde || !inputHasta) return;

  const now = new Date();
  const toLocalISO = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const hoyStr = toLocalISO(now);
  inputHasta.value = hoyStr;

  if (tipo === 'diario') {
    inputDesde.value = hoyStr;
  } else if (tipo === 'semanal') {
    const sem = new Date(now);
    sem.setDate(sem.getDate() - 7);
    inputDesde.value = toLocalISO(sem);
  } else if (tipo === 'quincenal') {
    const quin = new Date(now);
    quin.setDate(quin.getDate() - 15);
    inputDesde.value = toLocalISO(quin);
  } else if (tipo === 'mensual') {
    const mens = new Date(now.getFullYear(), now.getMonth(), 1);
    inputDesde.value = toLocalISO(mens);
  } else if (tipo === 'trimestral') {
    const tri = new Date(now);
    tri.setDate(tri.getDate() - 90);
    inputDesde.value = toLocalISO(tri);
  } else if (tipo === 'semestral') {
    const semes = new Date(now);
    semes.setDate(semes.getDate() - 180);
    inputDesde.value = toLocalISO(semes);
  } else if (tipo === 'anual') {
    const anual = new Date(now.getFullYear(), 0, 1);
    inputDesde.value = toLocalISO(anual);
  }

  renderInventarioCompleto();
}

// Renderizar inventario completo con Reportes y Valoración Financiera
async function renderInventarioCompleto() {
  await loadVehiculosData();
  const fechaDesde = document.getElementById('inv-fecha-desde') ? document.getElementById('inv-fecha-desde').value : '';
  const fechaHasta = document.getElementById('inv-fecha-hasta') ? document.getElementById('inv-fecha-hasta').value : '';
  const idAlmacen = document.getElementById('inv-almacen-select') ? document.getElementById('inv-almacen-select').value : '';

  const res = await apiCall('get_reporte_inventario', { fechaInicio: fechaDesde, fechaFin: fechaHasta, idAlmacen });
  if (res.status === 'ok' && res.data) {
    state.ultimoReporteInventario = res.data;
    const { resumen, productos } = res.data;
    state.productos = productos || [];

    // Actualizar KPI Cards Financieras
    const elTotalProds = document.getElementById('kpi-inv-total-prods');
    const elValorCosto = document.getElementById('kpi-inv-valor-costo');
    const elValorVenta = document.getElementById('kpi-inv-valor-venta');
    const elMargenEst = document.getElementById('kpi-inv-margen-estimado');

    if (elTotalProds) elTotalProds.innerHTML = `${resumen.total_productos} <span style="font-size:12px; color:var(--color-text-muted); font-weight:normal;">(${resumen.stock_total_unidades} unid.)</span>`;
    if (elValorCosto) elValorCosto.textContent = `RD$ ${(resumen.valor_total_costo || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (elValorVenta) elValorVenta.textContent = `RD$ ${(resumen.valor_total_venta || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (elMargenEst) elMargenEst.textContent = `RD$ ${(resumen.ganancia_potencial || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${(resumen.pct_margen || 0).toFixed(1)}%)`;

    // Renderizar Filas de Productos
    const tbody = document.getElementById('tbl-inventario-completo');
    if (tbody) {
      tbody.innerHTML = productos.map(p => `
        <tr>
          <td><code>${p.codigo_interno}</code></td>
          <td><strong>${p.nombre}</strong></td>
          <td>${p.categoria_nombre || 'General'}</td>
          <td>RD$ ${(p.precio_compra || 0).toFixed(2)}</td>
          <td><strong style="color: var(--color-primary);">RD$ ${(p.precio_mayorista || 0).toFixed(2)}</strong></td>
          <td>RD$ ${(p.precio_detalle || 0).toFixed(2)}</td>
          <td><strong>${p.stock_desglose[1] || 0}</strong></td>
          ${(state.vehiculos || []).map(v => `<td>${p.stock_desglose[v.id] || 0}</td>`).join('')}
          <td><span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 800; padding: 4px 8px; border-radius: 4px;">${idAlmacen ? p.stock_evaluado : p.stock_total} ${p.unidad_medida}</span></td>
          <td>
            <div class="actions-dropdown">
              <button class="btn-icon-dots" onclick="toggleDropdownMenu(event, 'drop-prod-${p.id}')">&#8942;</button>
              <div id="drop-prod-${p.id}" class="dropdown-content">
                <button class="dropdown-item" onclick="abrirModalEditarProducto(${p.id})">Editar Producto & Precio</button>
                <button class="dropdown-item" onclick="abrirModalKardex(${p.id})">Historial Kardex 360°</button>
                <button class="dropdown-item text-danger" onclick="confirmarEliminarProducto(${p.id})">Eliminar del Catálogo</button>
              </div>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }
}

// Exportación Profesional PDF de Reporte de Inventario
function exportarInventarioPDF() {
  if (!state.ultimoReporteInventario || !state.ultimoReporteInventario.productos || state.ultimoReporteInventario.productos.length === 0) {
    alert('No hay datos de inventario para exportar a PDF.');
    return;
  }

  const empNombre = state.configEmpresa ? state.configEmpresa.nombre_empresa : 'DISTRIBUIDORA ROJAS PERALTA';
  const empRnc = state.configEmpresa ? state.configEmpresa.rnc : '1-01-82934-1';
  const empTel = state.configEmpresa ? state.configEmpresa.telefono : '(809) 555-0199';
  const empDir = state.configEmpresa ? state.configEmpresa.direccion : 'Santo Domingo, Rep. Dom.';

  const r = state.ultimoReporteInventario.resumen || {};
  const lista = state.ultimoReporteInventario.productos || [];
  const fechaGeneracion = new Date().toLocaleString('es-DO');

  const fechaDesde = document.getElementById('inv-fecha-desde') ? (document.getElementById('inv-fecha-desde').value || 'Inicio') : 'Inicio';
  const fechaHasta = document.getElementById('inv-fecha-hasta') ? (document.getElementById('inv-fecha-hasta').value || 'Hoy') : 'Hoy';
  const selAlmacen = document.getElementById('inv-almacen-select');
  const almacenTxt = selAlmacen && selAlmacen.options[selAlmacen.selectedIndex] ? selAlmacen.options[selAlmacen.selectedIndex].text : 'Todos los Almacenes';

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div style="font-family: Inter, Arial, sans-serif; padding: 20px; color: #1b1226; max-width: 1000px; margin: 0 auto;">
      <!-- MEMBRETE EMPRESARIAL -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0b0912; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h1 style="margin: 0; font-size: 22px; color: #0b0912; font-weight: 800; text-transform: uppercase;">${empNombre}</h1>
          <div style="font-size: 12px; font-weight: 700; color: #51475f; margin-top: 2px;">RNC: ${empRnc} | Tel: ${empTel}</div>
          <div style="font-size: 11px; color: #6b6578;">${empDir}</div>
        </div>
        <div style="text-align: right;">
          <h3 style="margin: 0; font-size: 16px; color: #0b0912; text-transform: uppercase;">REPORTE VALORADO DE INVENTARIO</h3>
          <div style="font-size: 12px; color: #51475f; font-weight: 700; margin-top: 4px;">Filtro: ${almacenTxt}</div>
          <div style="font-size: 11px; color: #6b6578;">Período: ${fechaDesde} al ${fechaHasta}</div>
          <div style="font-size: 10px; color: #9a92ab; margin-top: 2px;">Generado: ${fechaGeneracion}</div>
        </div>
      </div>

      <!-- TARJETAS RESUMEN FINANCIERO KPI -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #faf8fc; border: 1px solid #d9d3e3;">
        <tr style="background: #0b0912; color: #ffffff; text-transform: uppercase; font-size: 10px; font-weight: 800;">
          <th style="padding: 8px; text-align: center;">Total Productos</th>
          <th style="padding: 8px; text-align: center;">Stock Unidades</th>
          <th style="padding: 8px; text-align: right;">Valor a Costo</th>
          <th style="padding: 8px; text-align: right;">Valor a Venta</th>
          <th style="padding: 8px; text-align: right;">Ganancia Estimada</th>
          <th style="padding: 8px; text-align: center;">% Margen</th>
        </tr>
        <tr style="font-size: 12px; font-weight: 800;">
          <td style="padding: 8px; text-align: center;">${r.total_productos || 0}</td>
          <td style="padding: 8px; text-align: center;">${r.stock_total_unidades || 0}</td>
          <td style="padding: 8px; text-align: right; color: #166534;">RD$ ${(r.valor_total_costo || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 8px; text-align: right; color: #5a189a;">RD$ ${(r.valor_total_venta || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 8px; text-align: right; color: #b45309;">RD$ ${(r.ganancia_potencial || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 8px; text-align: center; color: #b45309;">${(r.pct_margen || 0).toFixed(1)}%</td>
        </tr>
      </table>

      <!-- DETALLE DE PRODUCTOS EN CATÁLOGO -->
      <h4 style="margin: 0 0 8px 0; font-size: 12px; color: #3d3550; text-transform: uppercase;">Detalle Valorado por Producto</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1b1226; color: #ffffff; text-align: left;">
            <th style="padding: 6px; border: 1px solid #3d3550;">Código</th>
            <th style="padding: 6px; border: 1px solid #3d3550;">Producto</th>
            <th style="padding: 6px; border: 1px solid #3d3550;">Categoría</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Costo U.</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Venta U.</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: center;">Stock Central</th>
            ${(state.vehiculos || []).map(v => `<th style="padding:6px; border:1px solid #3d3550; text-align:center;">${v.nombre}</th>`).join('')}
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: center;">Stock Total</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Valor Costo Total</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Valor Venta Total</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map((p, i) => `
            <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#faf8fc'}; border-bottom: 1px solid #e8e3f0;">
              <td style="padding: 5px; border: 1px solid #d9d3e3;"><code>${p.codigo_interno}</code></td>
              <td style="padding: 5px; border: 1px solid #d9d3e3;"><b>${p.nombre}</b></td>
              <td style="padding: 5px; border: 1px solid #d9d3e3;">${p.categoria_nombre || 'General'}</td>
              <td style="padding: 5px; border: 1px solid #d9d3e3; text-align: right;">RD$ ${(p.precio_compra || 0).toFixed(2)}</td>
              <td style="padding: 5px; border: 1px solid #d9d3e3; text-align: right;">RD$ ${(p.precio_mayorista || 0).toFixed(2)}</td>
              <td style="padding: 5px; border: 1px solid #d9d3e3; text-align: center;">${p.stock_desglose[1] || 0}</td>
              ${(state.vehiculos || []).map(v => `<td style="padding:5px; border:1px solid #d9d3e3; text-align:center;">${p.stock_desglose[v.id] || 0}</td>`).join('')}
              <td style="padding: 5px; border: 1px solid #d9d3e3; text-align: center;"><b>${p.stock_evaluado} ${p.unidad_medida}</b></td>
              <td style="padding: 5px; border: 1px solid #d9d3e3; text-align: right; font-weight: 700; color: #166534;">RD$ ${(p.valor_costo || 0).toFixed(2)}</td>
              <td style="padding: 5px; border: 1px solid #d9d3e3; text-align: right; font-weight: 700; color: #5a189a;">RD$ ${(p.valor_venta || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- FIRMAS DE RESPONSABILIDAD -->
      <div style="margin-top: 40px; display: flex; justify-content: space-between; padding: 0 40px;">
        <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 6px; font-size: 11px; font-weight: 700;">
          Encargado de Inventario / Auditor
        </div>
        <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 6px; font-size: 11px; font-weight: 700;">
          Gerencia / Administración
        </div>
      </div>
    </div>
  `;

  window.print();
}

// Exportación Profesional a Excel (CSV)
function exportarInventarioExcel() {
  if (!state.ultimoReporteInventario || !state.ultimoReporteInventario.productos || state.ultimoReporteInventario.productos.length === 0) {
    alert('No hay datos de inventario para exportar a Excel.');
    return;
  }

  const empNombre = state.configEmpresa ? state.configEmpresa.nombre_empresa : 'DISTRIBUIDORA ROJAS PERALTA';
  const r = state.ultimoReporteInventario.resumen || {};
  const lista = state.ultimoReporteInventario.productos || [];

  const headers = [
    'Codigo Interno',
    'Nombre Producto',
    'Categoria',
    'Costo Unitario (DOP)',
    'Precio Venta (DOP)',
    'Stock Central (POS)',
    ...(state.vehiculos || []).map(v => `Stock ${v.nombre}`),
    'Stock Evaluado Total',
    'Unidad Medida',
    'Valor Total a Costo (DOP)',
    'Valor Total a Venta (DOP)',
    'Margen Estimado (DOP)'
  ];

  const rows = lista.map(p => [
    `"${p.codigo_interno}"`,
    `"${p.nombre.replace(/"/g, '""')}"`,
    `"${(p.categoria_nombre || 'General').replace(/"/g, '""')}"`,
    (p.precio_compra || 0).toFixed(2),
    (p.precio_mayorista || 0).toFixed(2),
    p.stock_desglose[1] || 0,
    ...(state.vehiculos || []).map(v => p.stock_desglose[v.id] || 0),
    p.stock_evaluado || 0,
    `"${p.unidad_medida || 'UNID'}"`,
    (p.valor_costo || 0).toFixed(2),
    (p.valor_venta || 0).toFixed(2),
    ((p.valor_venta || 0) - (p.valor_costo || 0)).toFixed(2)
  ].join(';'));

  const totalsRow = [
    '"TOTALES GENERALES"',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    r.stock_total_unidades || 0,
    '""',
    (r.valor_total_costo || 0).toFixed(2),
    (r.valor_total_venta || 0).toFixed(2),
    (r.ganancia_potencial || 0).toFixed(2)
  ].join(';');

  const csvContent = '\uFEFFsep=;\n' + [
    `"REPORTE OFICIAL DE INVENTARIO Y VALORACION DE MERCANCIA"`,
    `"Empresa: ${empNombre.replace(/"/g, '""')}"`,
    `"Fecha Generacion: ${new Date().toLocaleString('es-DO')}"`,
    `""`,
    headers.join(';'),
    ...rows,
    totalsRow
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `reporte_inventario_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function confirmarEliminarProducto(idProducto) {
  const prod = (state.productos || []).find(p => p.id === idProducto);
  if (!prod) return;

  if (confirm(`¿Estás seguro de que deseas eliminar la mercancía "${prod.nombre}" del catálogo?`)) {
    const res = await apiCall('eliminar_producto', { idProducto });
    if (res.status === 'ok') {
      alert(` La mercancía "${prod.nombre}" ha sido eliminada del catálogo exitosamente.`);
      loadProductosData();
      renderInventarioCompleto();
    } else {
      alert(` Error al eliminar mercancía: ${res.message}`);
    }
  }
}

// Renderizar Vehículos y Rutas de Reparto Dinámicos
async function renderCamiones() {
 const vehRes = await apiCall('get_vehiculos');
 const prodRes = await apiCall('get_productos');

 if (vehRes.status === 'ok' && prodRes.status === 'ok') {
 state.vehiculos = vehRes.data || [];
 state.productos = prodRes.data || [];
 
 // Actualizar selectores en POS y modales
 actualizarSelectoresVehiculos();

 const container = document.getElementById('vehiculos-cards-container');
 if (!state.vehiculos || state.vehiculos.length === 0) {
 container.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; text-align: center; background: #fff; border-radius: 8px; border: 1px solid var(--border-color);">No hay vehículos de reparto registrados. Haz clic en "+ Crear / Agregar Nuevo Vehículo".</div>`;
 } else {
 container.innerHTML = state.vehiculos.map(v => {
 const inventarioHtml = state.productos.map(p => `
 <tr>
 <td>${p.nombre}</td>
 <td><strong>${p.stock_desglose[v.id] || 0} ${p.unidad_medida}</strong></td>
 </tr>
 `).join('');

 return `
 <div class="table-container">
 <div class="table-header-bar" style="flex-wrap: wrap; gap: 8px;">
 <div>
 <h3 style="margin:0;">${v.nombre}</h3>
 <p style="font-size: 12px; color: var(--color-text-muted); margin:0;">Placa: <b>${v.placa_camion || 'N/A'}</b> | Chofer: <b>${v.chofer_asignado || 'Sin Asignar'}</b></p>
 </div>
 <div style="display: flex; gap: 6px; flex-wrap: wrap;">
 <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 8px;" onclick="abrirModalEditarVehiculo(${v.id})"> Editar</button>
 <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 8px;" onclick="verCuadreCamion(${v.id})">Liquidación</button>
 <button class="btn btn-warning" style="font-size: 11px; padding: 5px 8px;" onclick="descargarCamionACentral(${v.id})"> Vaciar a Central</button>
 </div>
 </div>
 <div style="padding: 16px;">
 <h4 style="font-size: 12px; color: #51475f; margin-bottom: 8px;">Inventario a bordo actual:</h4>
 <table class="data-table">
 <thead><tr><th>Producto</th><th>Cantidad a Bordo</th></tr></thead>
 <tbody>${inventarioHtml}</tbody>
 </table>
 </div>
 </div>
 `;
 }).join('');
 }
 }

 // 2. Cargar historial de liquidaciones
 const cuadresRes = await apiCall('get_historial_cuadres');
 if (cuadresRes.status === 'ok') {
 const tbody = document.getElementById('tbl-historial-cuadres-rutas');
 const cuadres = cuadresRes.data || [];
 if (!cuadres || cuadres.length === 0) {
 tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay cuadres de ruta registrados aún.</td></tr>`;
 } else {
 tbody.innerHTML = cuadres.map(c => {
 const diff = c.diferencia_cuadre || 0;
 let diffBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">Cuadre Exacto (RD$ 0.00)</span>`;
 if (diff < 0) {
 diffBadge = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:700;">Faltante RD$ ${Math.abs(diff).toFixed(2)}</span>`;
 } else if (diff > 0) {
 diffBadge = `<span class="badge" style="background:#efe5f8; color:#5a189a; font-weight:700;">Sobrante RD$ ${diff.toFixed(2)}</span>`;
 }
 return `
 <tr>
 <td><strong>#${c.id}</strong></td>
 <td>${c.fecha_cuadre}</td>
 <td><strong>${c.camion_nombre}</strong></td>
 <td>${c.chofer_nombre || 'Chofer Asignado'}</td>
 <td>${fmtRD(c.total_ventas_contado)}</td>
 <td>${fmtRD((c.total_ventas_transferencia || 0) + (c.total_ventas_cheque || 0))}</td>
 <td>${fmtRD(c.total_ventas_credito)}</td>
 <td><strong>RD$ ${c.efectivo_entregado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
 <td>${diffBadge}</td>
 <td><span class="badge" style="background:#f1edf6; color:#51475f; font-weight:700;">${c.estado}</span></td>
 </tr>
 `;
 }).join('');
 }
 }
}

async function loadVehiculosData() {
 const res = await apiCall('get_vehiculos');
 if (res.status === 'ok') {
   state.vehiculos = res.data || [];
   actualizarSelectoresVehiculos();
 }
}

function getVehiculoNombre(id, fallback = 'Vehículo') {
 const camion = (state.vehiculos || []).find(v => Number(v.id) === Number(id));
 return camion ? camion.nombre : `${fallback} #${id}`;
}

function actualizarSelectoresVehiculos() {
 const vehs = state.vehiculos || [];
 const optsVehs = vehs.map(v => `<option value="${v.id}">${v.nombre}${v.chofer_asignado ? ` (Chofer: ${v.chofer_asignado})` : ''}</option>`).join('');
 const setOptions = (id, html, emptyText = null) => {
   const select = document.getElementById(id);
   if (!select) return;
   const valorActual = select.value;
   select.innerHTML = `${emptyText === null ? '' : `<option value="">${emptyText}</option>`}${html}`;
   if ([...select.options].some(option => option.value === valorActual)) select.value = valorActual;
 };

 setOptions('pos-almacen-select', `<option value="1">Almacén Principal Central</option>${optsVehs}`);
 if (!document.getElementById('pos-almacen-select')?.value) {
   const posSelect = document.getElementById('pos-almacen-select');
   if (posSelect) posSelect.value = '1';
 }
 setOptions('cargar-camion-select', optsVehs, vehs.length ? 'Seleccionar vehículo...' : 'No hay vehículos activos');
 setOptions('modal-merma-camion-select', optsVehs, vehs.length ? 'Seleccionar vehículo...' : 'No hay vehículos activos');
 setOptions('gasto-camion', `<option value="1">Almacén Principal Central</option>${optsVehs}`, 'Sin vehículo');
 setOptions('reporte-almacen-select', `<option value="">Todos los Almacenes & Vehículos</option><option value="1">Almacén Principal Central</option>${vehs.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}`);
 setOptions('inv-almacen-select', `<option value="">Todos los Almacenes & Vehículos</option><option value="1">Almacén Principal Central</option>${vehs.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}`);
 setOptions('ventas-almacen-select', `<option value="">Todos los Orígenes</option><option value="1">Almacén Central</option><option value="camiones">Todos los vehículos / rutas</option>${vehs.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('')}`);

 const ventasSelect = document.getElementById('ventas-almacen-select');
 if (ventasSelect) ventasSelect.dataset.dynamicReady = 'true';
 const head = document.getElementById('tbl-inventario-head');
 if (head) {
   head.innerHTML = `
     <th>Código</th><th>Nombre Producto</th><th>Categoría</th><th>Precio Compra</th><th>Precio Mayorista</th><th>Precio Detalle</th>
     <th>Almacén Central</th>${vehs.map(v => `<th>${v.nombre}</th>`).join('')}
     <th>Stock Total</th><th>Acción</th>`;
 }
}

function abrirModalCrearVehiculo() {
 document.getElementById('modal-vehiculo-id').value = '';
 document.getElementById('modal-vehiculo-titulo').textContent = ' Registrar Nuevo Vehículo de Reparto';
 document.getElementById('vehiculo-nombre').value = '';
 document.getElementById('vehiculo-placa').value = '';
 document.getElementById('vehiculo-chofer').value = '';
 document.getElementById('modal-nuevo-vehiculo').classList.add('active');
}

function abrirModalEditarVehiculo(idVehiculo) {
 const v = (state.vehiculos || []).find(veh => veh.id === idVehiculo);
 if (!v) return;

 document.getElementById('modal-vehiculo-id').value = v.id;
 document.getElementById('modal-vehiculo-titulo').textContent = ` Editar Vehículo: ${v.nombre}`;
 document.getElementById('vehiculo-nombre').value = v.nombre;
 document.getElementById('vehiculo-placa').value = v.placa_camion || '';
 document.getElementById('vehiculo-chofer').value = v.chofer_asignado || '';
 document.getElementById('modal-nuevo-vehiculo').classList.add('active');
}

async function guardarVehiculo() {
 const idStr = document.getElementById('modal-vehiculo-id').value;
 const nombre = document.getElementById('vehiculo-nombre').value.trim();
 const placa = document.getElementById('vehiculo-placa').value.trim();
 const chofer = document.getElementById('vehiculo-chofer').value.trim();

 if (!nombre) {
 alert('Ingresa el nombre o alias del vehículo.');
 return;
 }

 const action = idStr ? 'actualizar_vehiculo' : 'registrar_vehiculo';
 const payload = idStr ? { id: parseInt(idStr, 10), nombre, placa, chofer } : { nombre, placa, chofer };

 const res = await apiCall(action, payload);
 if (res.status === 'ok') {
 alert(idStr ? ' Vehículo actualizado exitosamente!' : ' Nuevo vehículo registrado con éxito!');
 cerrarModales();
 renderCamiones();
 } else {
 alert(` Error al guardar vehículo: ${res.message}`);
 }
}

// Renderizar Finanzas, Gastos y Dividendos

// =============================================================================
// RESUMEN FINANCIERO (capital · mercancía · resultados · ganancia disponible)
// =============================================================================
function filaFin(etiqueta, valor, opts = {}) {
  const { clase = '', nota = '', signo = false, neg = false } = opts;
  const n = Number(valor) || 0;
  const color = signo ? (n >= 0 ? 'pos' : 'neg') : (neg ? 'neg' : '');
  return `<div class="fin-row ${clase}"><span>${etiqueta}${nota ? `<small class="fin-note">${nota}</small>` : ''}</span><strong class="${color}">${neg && n > 0 ? '− ' : ''}${fmtRD(n)}</strong></div>`;
}

function renderResumenFinanciero(containerId, d, opts = {}) {
  const cont = document.getElementById(containerId);
  if (!cont || !d) return;
  const periodo = opts.mostrarPeriodo ? `<small>${escHtml(d.fecha_inicio)} → ${escHtml(d.fecha_fin)}</small>` : '';
  const aviso = (!d.capital_inicial || d.capital_inicial <= 0)
    ? `<div class="fin-aviso">Aún no has indicado el <b>capital inicial</b>. Escríbelo en <b>Configuración &amp; Perfil</b> para ver cuánto dinero se invirtió y cuánto se ha ganado por encima de eso.</div>` : '';
  const cats = (d.gastos_por_categoria || []);
  const catsHtml = cats.length
    ? cats.map(c => filaFin(escHtml(c.categoria), c.total, { clase: 'fin-sub' })).join('')
    : `<div class="fin-row fin-sub"><span>Sin gastos en el período</span><strong>—</strong></div>`;
  const roi = d.retorno_sobre_capital_pct;

  cont.innerHTML = `
    ${aviso}
    <div class="fin-grid">
      <div class="fin-card fin-capital">
        <div class="fin-label">Capital inicial</div>
        <div class="fin-value">${fmtRD(d.capital_inicial)}</div>
        <div class="fin-hint">Lo invertido para arrancar. No es ganancia.</div>
      </div>
      <div class="fin-card fin-capital">
        <div class="fin-label">Mercancía en inventario</div>
        <div class="fin-value">${fmtRD(d.inventario_costo_actual)}</div>
        <div class="fin-hint">${(d.inventario_unidades || 0).toLocaleString('es-DO')} unidades · valor a costo</div>
      </div>
      <div class="fin-card fin-capital">
        <div class="fin-label">Cuentas por cobrar</div>
        <div class="fin-value">${fmtRD(d.cuentas_por_cobrar)}</div>
        <div class="fin-hint">Ventas a crédito aún no cobradas</div>
      </div>
      <div class="fin-card fin-dark">
        <div class="fin-label">Ganancia disponible</div>
        <div class="fin-value" style="color:${d.ganancia_neta_disponible >= 0 ? '#7ee2b0' : '#ff9aa8'};">${fmtRD(d.ganancia_neta_disponible)}</div>
        <div class="fin-hint">Ganancia neta acumulada − dividendos retirados</div>
      </div>
    </div>

    <div class="fin-cols">
      <div class="fin-panel">
        <h3>Resultados del período ${periodo}</h3>
        ${filaFin('Ventas netas', d.subtotal_ventas, { nota: `${d.num_ventas || 0} venta(s), sin ITBIS y después de descuentos` })}
        ${filaFin('Costo de la mercancía vendida', d.costo_mercancia, { neg: true, nota: 'Lo que costó lo que se vendió (la compra pasa a resultados cuando se vende)' })}
        ${filaFin('Ganancia bruta', d.ganancia_bruta, { clase: 'fin-total', signo: true, nota: `Margen bruto ${(d.margen_bruto_pct || 0).toFixed(1)}%` })}
        ${filaFin('Gastos operativos', d.gastos_operativos, { neg: true, nota: 'Nómina, combustible, mantenimiento, servicios… (no incluye compras de mercancía)' })}
        ${filaFin('Mercancía dañada (mermas)', d.mermas, { neg: true, nota: 'Inversión perdida' })}
        ${filaFin('GANANCIA NETA', d.ganancia_neta, { clase: 'fin-final', signo: true })}
      </div>

      <div>
        <div class="fin-panel">
          <h3>Capital y ganancia (acumulado)</h3>
          ${filaFin('Capital inicial', d.capital_inicial)}
          ${filaFin('Ganancia neta acumulada', d.ganancia_neta_total, { signo: true })}
          ${filaFin('Dividendos retirados', d.dividendos_retirados, { neg: true })}
          ${filaFin('Ganancia disponible', d.ganancia_neta_disponible, { clase: 'fin-total', signo: true })}
          ${filaFin('Capital de trabajo (capital + ganancia disponible)', d.capital_trabajo, { clase: 'fin-final' })}
          ${roi !== null && roi !== undefined ? `<div class="fin-row fin-sub"><span>Rendimiento sobre el capital</span><strong class="${roi >= 0 ? 'pos' : 'neg'}">${roi.toFixed(1)}%</strong></div>` : ''}
        </div>
        <div class="fin-panel">
          <h3>Compras de mercancía <small>(inversión, no es gasto)</small></h3>
          ${filaFin(`Compras del período (${d.compras_num || 0})`, d.compras_mercancia)}
        </div>
      </div>
    </div>

    <div class="fin-panel">
      <h3>Detalle de gastos del período <small>sin compras de mercancía</small></h3>
      ${catsHtml}
    </div>

    ${opts.incluirItbis ? `
    <div class="fin-panel">
      <h3>ITBIS del período <small>estimado</small></h3>
      ${filaFin('ITBIS cobrado en ventas', d.itbis_cobrado)}
      ${filaFin('ITBIS deducible (compras y gastos con comprobante)', d.itbis_deducible, { neg: true })}
      ${filaFin('ITBIS estimado a pagar', d.balance_itbis_estimado, { clase: 'fin-total' })}
    </div>` : ''}
  `;
}

async function renderFinanzas() {
 const res = await apiCall('get_balance_financiero');
 if (res.status === 'ok') {
 renderResumenFinanciero('resumen-financiero-gastos', res.data);
 }

 const gastosRes = await apiCall('get_gastos');
 if (gastosRes.status === 'ok') {
 state.gastos = gastosRes.data || [];
 const tbody = document.getElementById('tbl-gastos');
 if (!state.gastos.length) {
 tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No hay gastos operativos registrados.</td></tr>`;
 } else {
 tbody.innerHTML = state.gastos.map(g => `
 <tr>
 <td>${g.fecha}</td>
 <td><strong style="color: var(--color-danger);">${g.categoria}</strong></td>
 <td>${g.concepto}</td>
 <td>${g.camion_nombre || '—'}</td>
 <td><strong>RD$ ${g.monto.toFixed(2)}</strong></td>
 <td><button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="abrirModalGasto(${g.id})">Editar</button></td>
 </tr>
 `).join('');
 }
 }

 const divRes = await apiCall('get_dividendos');
 if (divRes.status === 'ok') {
 state.dividendos = divRes.data || [];
 const tbodyDiv = document.getElementById('tbl-dividendos-historial');
 if (!state.dividendos.length) {
 tbodyDiv.innerHTML = `<tr><td colspan="4" style="text-align:center;">No se han realizado retiros de dividendos aún.</td></tr>`;
 } else {
 tbodyDiv.innerHTML = state.dividendos.map(d => `
 <tr>
 <td>${d.fecha}</td>
 <td><strong>${d.concepto}</strong></td>
 <td><strong style="color: var(--color-success);">RD$ ${d.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
 <td><button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="abrirModalDividendo(${d.id})">Editar</button></td>
 </tr>
 `).join('');
 }
 }
}

// =============================================================================
// CONTROL DE MODALES Y ACCIONES DE BOTONES
// =============================================================================

function cerrarModales() {
  state.cuadreCamionId = null;
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
  ['input-nueva-clave-reset', 'input-confirmar-clave-reset', 'input-clave-reset', 'input-confirmar-reset'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
}

// 1. MODAL REGISTRAR GASTO
function fechaParaInput(valor = null) {
 if (valor) {
   const texto = String(valor);
   if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
 }
 const ahora = new Date();
 return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
}

async function abrirModalGasto(id = null) {
 await loadVehiculosData();
 const gasto = id ? (state.gastos || []).find(g => Number(g.id) === Number(id)) : null;
 document.getElementById('gasto-id').value = gasto ? gasto.id : '';
 document.getElementById('gasto-fecha').value = fechaParaInput(gasto?.fecha);
 document.getElementById('gasto-monto').value = gasto ? gasto.monto : '';
 document.getElementById('gasto-concepto').value = gasto ? gasto.concepto : '';
 document.getElementById('gasto-ncf').value = gasto?.ncf_comprobante || '';
 document.getElementById('gasto-rnc').value = gasto?.rnc_proveedor || '';
 const categoria = document.getElementById('gasto-categoria');
 if (gasto && ![...categoria.options].some(o => o.value === gasto.categoria)) categoria.add(new Option(gasto.categoria, gasto.categoria));
 categoria.value = gasto?.categoria || 'Combustible de Vehículo';
 const camionSelect = document.getElementById('gasto-camion');
 if (camionSelect) camionSelect.value = gasto?.id_camion ? String(gasto.id_camion) : '';
 document.getElementById('modal-gasto-titulo').textContent = gasto ? 'Editar Gasto Operativo' : 'Registrar Nuevo Gasto Operativo';
 document.getElementById('btn-guardar-gasto').textContent = gasto ? 'Guardar Cambios' : 'Guardar Gasto';
 document.getElementById('modal-gasto').classList.add('active');
}

async function guardarGasto() {
 const id = parseInt(document.getElementById('gasto-id').value, 10) || null;
 const categoria = document.getElementById('gasto-categoria').value;
 const concepto = document.getElementById('gasto-concepto').value.trim();
 const monto = parseFloat(document.getElementById('gasto-monto').value);
 const ncfComprobante = document.getElementById('gasto-ncf').value;
 const rncProveedor = document.getElementById('gasto-rnc').value.trim();
 const fecha = document.getElementById('gasto-fecha').value;
 const idCamion = parseInt(document.getElementById('gasto-camion').value, 10) || null;

 if (!fecha || !concepto || isNaN(monto) || monto <= 0) {
 alert('Ingresa una fecha, concepto y monto válido para el gasto.');
 return;
 }

 const action = id ? 'actualizar_gasto' : 'registrar_gasto';
 const res = await apiCall(action, { id, categoria, concepto, monto, fecha, ncfComprobante, rncProveedor, idCamion });
 if (res.status === 'ok') {
 showToastNotification('Gasto', id ? 'Gasto actualizado correctamente.' : 'Gasto registrado correctamente.', 'exito');
 cerrarModales();
 renderFinanzas();
 loadDashboardData();
 } else {
 alert(` Error al guardar gasto: ${res.message}`);
 }
}

// 2. MODAL RETIRAR DIVIDENDO
async function abrirModalDividendo(id = null) {
 const res = await apiCall('get_balance_financiero');
 if (res.status === 'ok') {
 document.getElementById('modal-dividendo-disponible').textContent = `RD$ ${res.data.ganancia_neta_disponible.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
 }
 const dividendo = id ? (state.dividendos || []).find(d => Number(d.id) === Number(id)) : null;
 document.getElementById('dividendo-id').value = dividendo ? dividendo.id : '';
 document.getElementById('dividendo-monto').value = dividendo ? dividendo.monto : '';
 document.getElementById('dividendo-concepto').value = dividendo?.concepto || 'Retiro de utilidades del propietario';
 document.getElementById('dividendo-fecha').value = fechaParaInput(dividendo?.fecha);
 document.getElementById('modal-dividendo-titulo').textContent = dividendo ? 'Editar Retiro de Dividendos' : 'Retirar Dividendo del Propietario';
 document.getElementById('btn-guardar-dividendo').textContent = dividendo ? 'Guardar Cambios' : 'Confirmar Retiro';
 document.getElementById('modal-dividendo').classList.add('active');
}

async function confirmarDividendo() {
 const id = parseInt(document.getElementById('dividendo-id').value, 10) || null;
 const monto = parseFloat(document.getElementById('dividendo-monto').value);
 const concepto = document.getElementById('dividendo-concepto').value.trim();
 const fecha = document.getElementById('dividendo-fecha').value;

 if (isNaN(monto) || monto <= 0 || !fecha || !concepto) {
 alert('Ingresa una fecha, concepto y monto válido para el retiro.');
 return;
 }

 const action = id ? 'actualizar_retiro_dividendo' : 'registrar_retiro_dividendo';
 const res = await apiCall(action, { id, monto, concepto, fecha });
 if (res.status === 'ok') {
 showToastNotification('Dividendos', id ? 'Retiro actualizado correctamente.' : 'Retiro registrado correctamente.', 'exito');
 cerrarModales();
 renderFinanzas();
 loadDashboardData();
 } else {
 alert(` Error al procesar dividendo: ${res.message}`);
 }
}

// 3. MODAL CARGAR CAMIÓN
async function abrirModalCargarCamion() {
 await loadVehiculosData();
 await loadProductosData();
 const camionSelect = document.getElementById('cargar-camion-select');
 if (!state.vehiculos.length) {
   alert('Primero registra al menos un vehículo de reparto.');
   return;
 }
 if (camionSelect && !camionSelect.value) camionSelect.value = String(state.vehiculos[0].id);
 const tbody = document.getElementById('tbl-cargar-camion-items');
 tbody.innerHTML = state.productos.map(p => {
 const stockCentral = p.stock_desglose[1] || 0;
 return `
 <tr>
 <td><strong>${p.nombre}</strong></td>
 <td>${stockCentral} ${p.unidad_medida}</td>
 <td>
 <input type="number" min="0" max="${stockCentral}" value="0" class="input-control carga-item-qty" data-id="${p.id}" style="width: 100px;">
 </td>
 </tr>
 `;
 }).join('');
 document.getElementById('modal-cargar-camion').classList.add('active');
}

async function guardarCargaCamion() {
 const idCamionDestino = parseInt(document.getElementById('cargar-camion-select').value, 10);
 if (!Number.isInteger(idCamionDestino)) {
   alert('Selecciona un vehículo activo para despachar la mercancía.');
   return;
 }
 const qtyInputs = document.querySelectorAll('.carga-item-qty');
 const items = [];

 qtyInputs.forEach(inp => {
 const cant = parseInt(inp.value, 10);
 if (cant > 0) {
 items.push({
 id_producto: parseInt(inp.getAttribute('data-id'), 10),
 cantidad: cant
 });
 }
 });

 if (items.length === 0) {
 alert('Selecciona al menos 1 producto con cantidad mayor a 0 para despachar.');
 return;
 }

 const res = await apiCall('cargar_camion', { idAlmacenOrigen: 1, idCamionDestino, items });
 if (res.status === 'ok') {
 alert(' Mercancía cargada y despachada al camión con éxito!\nSe generará el Conduce de Despacho de Ruta para firma del chofer.');
 cerrarModales();
 renderCamiones();
 loadProductosData();
 if (res.data && res.data.transferenciaId) {
 imprimirConduceDespacho(res.data.transferenciaId);
 }
 renderInventarioCompleto();
 } else {
 alert(` Error al despachar mercancía al camión: ${res.message}`);
 }
}

async function imprimirConduceDespacho(idTransferencia) {
 const res = await apiCall('get_detalle_transferencia', { idTransferencia });
 if (res.status !== 'ok' || !res.data) {
 alert('No se pudo cargar el detalle del conduce de despacho.');
 return;
 }

 const t = res.data;
 const area = document.getElementById('print-area');

 area.innerHTML = `
 <div class="factura-full">
 <div class="factura-header">
 <div>
 <h2>${(state.configEmpresa && state.configEmpresa.nombre_empresa) || 'DISTRIBUIDORA ROJAS PERALTA'}</h2>
 <div>RNC: 1-01-82934-1</div>
 <div>Reparto y Distribución en Ruta</div>
 <div>Teléfono: (809) 555-0199</div>
 </div>
 <div style="text-align: right;">
 <h3 style="color: var(--color-primary); margin:0;">CONDUCE DE DESPACHO</h3>
 <div style="font-weight: 800; font-size:16px;">CONDUCE N° CR-${t.id.toString().padStart(6, '0')}</div>
 <div>Fecha: ${new Date(t.fecha_transferencia).toLocaleString('es-DO')}</div>
 </div>
 </div>

 <div style="border:1px solid #000; padding:10px; margin-bottom:16px; display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
 <div>
 <div><b>CAMIÓN DESTINO:</b> ${t.destino_nombre}</div>
 <div><b>PLACA VEHÍCULO:</b> ${t.placa_camion || 'N/A'}</div>
 </div>
 <div>
 <div><b>CHOFER ASIGNADO:</b> ${t.chofer_asignado || 'Chofer de Ruta'}</div>
 <div><b>ALMACÉN ORIGEN:</b> ${t.origen_nombre}</div>
 </div>
 </div>

 <h4>DESGLOSE DE MERCANCÍA CARGADA A BORDO:</h4>
 <table class="factura-items-table">
 <thead>
 <tr>
 <th>Código</th>
 <th>Descripción del Producto</th>
 <th>Cantidad Cargada</th>
 </tr>
 </thead>
 <tbody>
 ${(t.detalles || []).map(d => `
 <tr>
 <td><code>${d.codigo_interno || 'PROD'}</code></td>
 <td><strong>${d.producto_nombre}</strong></td>
 <td><strong>${d.cantidad_cargada} Cajas / Unidades</strong></td>
 </tr>
 `).join('')}
 </tbody>
 </table>

 <div style="margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center;">
 <div>
 <div style="border-top: 1px solid #000; padding-top: 6px; font-weight:700;">Firma Almacenista (Despachado)</div>
 </div>
 <div>
 <div style="border-top: 1px solid #000; padding-top: 6px; font-weight:700;">Firma Chofer de Ruta (Recibido Conforme)</div>
 </div>
 </div>
 </div>
 `;

 setTimeout(() => {
 window.print();
 }, 300);
}

// 4. MODAL LIQUIDACIÓN Y CUADRE DE CAMIÓN
async function verCuadreCamion(idCamion) {
  // Cada apertura parte de cero: ningún estado de una liquidación anterior puede trabar el botón.
  state.cuadreGuardando = false;
  state.cuadreCamionId = idCamion;
  const btnGuardar = document.getElementById('btn-guardar-cuadre');
  if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Cerrar y Firmar Cuadre'; }

  const nombreCamion = getVehiculoNombre(idCamion);
  document.getElementById('modal-cuadre-titulo').textContent = `Cuadre y Liquidación - ${nombreCamion}`;

  const res = await apiCall('get_resumen_cuadre_camion', { idCamion });
  if (res.status !== 'ok') {
    state.cuadreCamionId = null;
    alert(`No se pudo cargar la liquidación: ${res.message}`);
    return;
  }
  const d = res.data;
  state.cuadreEfectivoEsperado = Number(d.ventas_efectivo) || 0;

  document.getElementById('cuadre-ventas-contado').textContent = fmtRD(d.ventas_efectivo);
  document.getElementById('cuadre-ventas-transferencia').textContent = fmtRD(d.ventas_transferencia);
  document.getElementById('cuadre-ventas-cheque').textContent = fmtRD(d.ventas_cheque);
  document.getElementById('cuadre-ventas-credito').textContent = fmtRD(d.ventas_credito);
  document.getElementById('cuadre-ventas-total').textContent = fmtRD(d.ventas_total);
  document.getElementById('cuadre-facturas-lbl').textContent = `${d.total_facturas || 0} venta(s) pendientes de liquidar`;
  document.getElementById('cuadre-periodo-lbl').textContent = d.total_facturas
    ? `Ventas del ${d.periodo_desde}${d.periodo_hasta && d.periodo_hasta !== d.periodo_desde ? ' al ' + d.periodo_hasta : ''} que todavía no se han liquidado.`
    : 'Este camión no tiene ventas pendientes de liquidar. Al cerrar, la mercancía sobrante vuelve al Almacén Central.';
  document.getElementById('cuadre-efectivo-entregado').value = '';
  document.getElementById('cuadre-notas').value = '';
  calcularDiferenciaCuadre();

  document.getElementById('modal-cuadre-camion').classList.add('active');
}

function calcularDiferenciaCuadre() {
  const crudo = document.getElementById('cuadre-efectivo-entregado').value;
  const entregado = parseFloat(crudo) || 0;
  const diff = Math.round((entregado - state.cuadreEfectivoEsperado) * 100) / 100;
  const box = document.getElementById('cuadre-diferencia-box');

  if (crudo === '') {
    box.style.background = '#f1edf6';
    box.style.color = 'var(--color-text-main)';
    box.innerHTML = `Efectivo esperado del chofer: <strong>${fmtRD(state.cuadreEfectivoEsperado)}</strong>`;
    return;
  }

  if (diff === 0) {
    box.style.background = 'hsl(150, 60%, 94%)';
    box.style.color = 'var(--color-success)';
    box.innerHTML = `Efectivo esperado: ${fmtRD(state.cuadreEfectivoEsperado)}${entregado > 0 || state.cuadreEfectivoEsperado === 0 ? ' · Cuadre exacto' : ''}`;
  } else if (diff > 0) {
    box.style.background = '#efe5f8';
    box.style.color = '#5a189a';
    box.innerHTML = `Sobrante de caja: +${fmtRD(diff)}<br><small>Efectivo esperado: ${fmtRD(state.cuadreEfectivoEsperado)}</small>`;
  } else {
    box.style.background = 'hsl(355, 100%, 95%)';
    box.style.color = 'var(--color-danger)';
    box.innerHTML = `Faltante en caja: -${fmtRD(Math.abs(diff))}<br><small>Efectivo esperado: ${fmtRD(state.cuadreEfectivoEsperado)}</small>`;
  }
}

async function guardarCuadreRuta() {
  if (!state.cuadreCamionId || state.cuadreGuardando) return;
  const idCamion = state.cuadreCamionId;
  const inputEfectivo = document.getElementById('cuadre-efectivo-entregado');
  if (inputEfectivo.value === '' ) {
    alert('Escribe el efectivo que entrega el chofer (puede ser 0).');
    inputEfectivo.focus();
    return;
  }
  const efectivoEntregado = Number(inputEfectivo.value);
  if (!Number.isFinite(efectivoEntregado) || efectivoEntregado < 0) {
    alert('El efectivo entregado debe ser un monto válido.');
    return;
  }

  state.cuadreGuardando = true;
  const btnGuardar = document.getElementById('btn-guardar-cuadre');
  if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando...'; }

  let resultado = null;
  try {
    const res = await apiCall('cerrar_cuadre_ruta', {
      idCamion,
      efectivoEntregado,
      notas: (document.getElementById('cuadre-notas').value || '').trim() || 'Liquidación de ruta'
    });
    if (res.status === 'ok') resultado = res.data;
    else alert(`Error al cerrar cuadre: ${res.message}`);
  } catch (error) {
    alert(`Error al cerrar cuadre: ${error.message}`);
  } finally {
    // Siempre se libera el botón, pase lo que pase: así se puede liquidar el siguiente camión sin refrescar.
    state.cuadreGuardando = false;
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Cerrar y Firmar Cuadre'; }
  }

  if (resultado) {
    cerrarModales();
    const dif = Number(resultado.diferencia) || 0;
    const detalle = dif === 0 ? 'Cuadre exacto.' : (dif > 0 ? `Sobrante de ${fmtRD(dif)}.` : `Faltante de ${fmtRD(Math.abs(dif))}.`);
    showToastNotification('Liquidación cerrada', `${getVehiculoNombre(idCamion)}: efectivo recibido ${fmtRD(resultado.efectivoEntregado)}. ${detalle}`, 'exito');
    await renderCamiones();
    loadDashboardData();
  }
}

// REGISTRO DE MERMAS / MERCANCÍA DAÑADA EN RUTA
async function abrirModalMermaCamion() {
 await loadVehiculosData();
 await loadProductosData();
 const selCamion = document.getElementById('modal-merma-camion-select');
 if (selCamion && !selCamion.value) {
   const primero = [...selCamion.options].find(o => o.value);
   if (primero) selCamion.value = primero.value;
 }
 onMermaCamionChange();
 document.getElementById('modal-merma-motivo').value = '';
 document.getElementById('modal-merma-cant').value = '1';
 document.getElementById('modal-merma-camion').classList.add('active');
}

function onMermaCamionChange() {
 const idCamion = parseInt(document.getElementById('modal-merma-camion-select').value, 10);
 const prodSelect = document.getElementById('modal-merma-prod-select');

 if (state.productos && state.productos.length > 0) {
 prodSelect.innerHTML = state.productos.map(p => {
 const stockCamion = p.stock_desglose[idCamion] || 0;
 return `<option value="${p.id}">${p.nombre} (Stock a Bordo: ${stockCamion} ${p.unidad_medida})</option>`;
 }).join('');
 }
}

async function confirmarRegistroMerma() {
 const idCamion = parseInt(document.getElementById('modal-merma-camion-select').value, 10);
 const idProducto = parseInt(document.getElementById('modal-merma-prod-select').value, 10);
 const cantidad = parseInt(document.getElementById('modal-merma-cant').value, 10);
 const motivo = document.getElementById('modal-merma-motivo').value.trim() || 'Merma / daño en ruta';

 if (!idProducto || isNaN(cantidad) || cantidad <= 0) {
 alert('Selecciona un producto e ingresa una cantidad válida de merma.');
 return;
 }

 const res = await apiCall('registrar_merma_camion', {
 idCamion,
 idProducto,
 cantidad,
 motivo
 });

 if (res.status === 'ok') {
 alert(' Merma registrada exitosamente. El inventario a bordo del camión ha sido actualizado.');
 cerrarModales();
 renderCamiones();
 loadProductosData();
 renderInventarioCompleto();
 } else {
 alert(` Error al registrar merma: ${res.message}`);
 }
}

// 5. EXPORTACIÓN DE REPORTES FISCALES DGII 607 Y 606 (CSV)
async function descargarReporteDGII(tipo) {
 const hoy = new Date();
 const mes = hoy.getMonth() + 1;
 const anio = hoy.getFullYear();

 const action = tipo === '607' ? 'get_reporte_607' : 'get_reporte_606';
 const res = await apiCall(action, { mes, anio });

 if (res.status === 'ok') {
 if (!res.data || res.data.length === 0) {
 alert(`No hay registros fiscales para el Reporte DGII ${tipo} en el período actual (${mes}/${anio}).`);
 return;
 }

 // Convertir objeto a CSV
 const headers = Object.keys(res.data[0]).join(',');
 const rows = res.data.map(row => Object.values(row).map(v => `"${v}"`).join(','));
 const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join('\n');

 const encodedUri = encodeURI(csvContent);
 const link = document.createElement('a');
 link.setAttribute('href', encodedUri);
 link.setAttribute('download', `Reporte_DGII_${tipo}_${anio}_${mes}.csv`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 } else {
 alert(` Error al generar reporte DGII: ${res.message}`);
 }
}

// 6. GESTIÓN DE CLIENTES Y CUENTAS POR COBRAR (CXC)
async function renderClientes() {
  // 1. Cargar tabla de Cuentas por Cobrar Pendientes
  const cxcRes = await apiCall('get_cxc');
  if (cxcRes.status === 'ok') {
    state.cuentasPorCobrar = cxcRes.data || [];
    filtrarTablaCXCView();
  }

  // 2. Cargar tabla de Cartera General de Clientes
  const res = await apiCall('get_clientes');
  if (res.status === 'ok') {
    state.clientes = res.data || [];
    filtrarTablaClientesView();
  }
}

function filtrarTablaCXCView() {
  const inputEl = document.getElementById('cxc-search-input');
  const rawQuery = inputEl ? inputEl.value.trim().toLowerCase() : '';
  const query = rawQuery.replace('#', '');

  const tbodyCxc = document.getElementById('tbl-cxc-pendientes');
  const pendientes = (state.cuentasPorCobrar || []).filter(c => c.balance_pendiente > 0);

  if (!pendientes || pendientes.length === 0) {
    tbodyCxc.innerHTML = `<tr><td colspan="10" style="text-align:center;">No hay cuentas por cobrar pendientes. ¡Todas las facturas están al día!</td></tr>`;
    return;
  }

  const filtradas = pendientes.filter(c => {
    if (!query) return true;
    const idVentaStr = c.id_venta.toString();
    const clienteStr = (c.cliente_nombre || '').toLowerCase();
    const ncfStr = (c.ncf || '').toLowerCase();

    return idVentaStr === query ||
           idVentaStr.includes(query) ||
           clienteStr.includes(query) ||
           ncfStr.includes(query);
  });

  if (filtradas.length === 0) {
    tbodyCxc.innerHTML = `<tr><td colspan="10" style="text-align:center;">No se encontraron facturas CXC que coincidan con "${rawQuery}".</td></tr>`;
    return;
  }

  tbodyCxc.innerHTML = filtradas.map(c => `
    <tr>
      <td><strong>Factura #${c.id_venta}</strong></td>
      <td><strong>${c.cliente_nombre}</strong></td>
      <td><code style="color: var(--color-primary);">${c.ncf || 'Sin NCF'}</code></td>
      <td>${new Date(c.fecha_venta).toLocaleDateString('es-DO')}</td>
      <td><span style="color: ${new Date(c.fecha_vencimiento) < new Date() ? 'var(--color-danger)' : 'inherit'}; font-weight: 700;">${c.fecha_vencimiento}</span></td>
      <td>RD$ ${c.monto_original.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
      <td>RD$ ${c.monto_pagado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
      <td><strong style="color: var(--color-danger);">RD$ ${c.balance_pendiente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td><span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700;">${c.estado}</span></td>
      <td>
        <button class="btn btn-success" style="padding:4px 10px; font-size:12px;" onclick="abrirModalCobroCXC(${c.id})"> Abonar / Cobrar</button>
      </td>
    </tr>
  `).join('');
}

function filtrarTablaClientesView() {
  const inputEl = document.getElementById('clientes-search-input');
  const rawQuery = inputEl ? inputEl.value.trim().toLowerCase() : '';
  const query = rawQuery.replace('#', '');

  const tbody = document.getElementById('tbl-clientes');
  if (!state.clientes || state.clientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No hay clientes registrados en el sistema.</td></tr>`;
    return;
  }

  const filtrados = state.clientes.filter(c => {
    if (!query) return true;
    const idStr = c.id.toString();
    const nombreStr = (c.nombre || '').toLowerCase();
    const rncStr = (c.rnc_cedula || '').toLowerCase();
    const telStr = (c.telefono || '').toLowerCase();

    return idStr === query ||
           idStr.includes(query) ||
           nombreStr.includes(query) ||
           rncStr.includes(query) ||
           telStr.includes(query);
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No se encontraron clientes que coincidan con "${rawQuery}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(c => `
    <tr>
      <td><strong style="color: var(--color-primary);">#${c.id}</strong></td>
      <td><code>${c.rnc_cedula || '—'}</code></td>
      <td><strong>${c.nombre}</strong></td>
      <td>${c.telefono || 'N/A'}</td>
      <td>RD$ ${c.limite_credito.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
      <td><strong style="color: ${c.balance_pendiente > 0 ? 'var(--color-warning)' : 'inherit'};">RD$ ${c.balance_pendiente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td>
        <div class="actions-dropdown">
          <button class="btn-icon-dots" onclick="toggleDropdownMenu(event, 'drop-cli-${c.id}')">&#8942;</button>
          <div id="drop-cli-${c.id}" class="dropdown-content">
            <button class="dropdown-item" onclick="abrirModalEditarCliente(${c.id})">Editar Cliente</button>
            ${c.id === 1 ? '' : `<button class="dropdown-item text-danger" onclick="confirmarEliminarCliente(${c.id})">Eliminar Cliente</button>`}
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

// MODAL DE REGISTRO DE COBRO / ABONO A CLIENTES
async function abrirModalCobroCXC(idCuentaCobrarTarget = null) {
  const res = await apiCall('get_cxc');
  if (res.status === 'ok') {
    state.cuentasPorCobrar = (res.data || []).filter(c => c.balance_pendiente > 0);
    const select = document.getElementById('modal-cobro-cxc-select');

    if (!state.cuentasPorCobrar || state.cuentasPorCobrar.length === 0) {
      alert('No hay facturas a crédito pendientes para cobrar.');
      return;
    }

    select.innerHTML = state.cuentasPorCobrar.map(c => `
      <option value="${c.id}" ${c.id === idCuentaCobrarTarget ? 'selected' : ''}>
        Factura #${c.id_venta} - ${c.cliente_nombre} (Balance Pendiente: RD$ ${c.balance_pendiente.toFixed(2)})
      </option>
    `).join('');

    onCuentaCobrarSelectChange();
    document.getElementById('modal-cobro-cxc').classList.add('active');
  }
}

function onCuentaCobrarSelectChange() {
  const select = document.getElementById('modal-cobro-cxc-select');
  const idCxc = parseInt(select.value, 10);
  const cxc = state.cuentasPorCobrar.find(c => c.id === idCxc);

  if (cxc) {
    document.getElementById('modal-cobro-monto-original').textContent = `RD$ ${cxc.monto_original.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    document.getElementById('modal-cobro-balance-pendiente').textContent = `RD$ ${cxc.balance_pendiente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    document.getElementById('modal-cobro-monto').value = cxc.balance_pendiente;
  }
}

async function confirmarCobroCXC() {
  const idCuentaCobrar = parseInt(document.getElementById('modal-cobro-cxc-select').value, 10);
  const monto = parseFloat(document.getElementById('modal-cobro-monto').value);
  const metodoPago = document.getElementById('modal-cobro-metodo').value;
  const notas = document.getElementById('modal-cobro-notas').value;

  if (!idCuentaCobrar || isNaN(monto) || monto <= 0) {
    alert('Selecciona una factura a crédito e ingresa un monto válido.');
    return;
  }

  const res = await apiCall('registrar_cobro_cxc', {
    idCuentaCobrar,
    monto,
    metodoPago,
    notas
  });

  if (res.status === 'ok') {
    alert(` ¡Cobro registrado con éxito!\nRecibo de Ingreso N°: ${res.data.numeroRecibo}\nBalance Restante: RD$ ${res.data.balancePendienteRestante.toFixed(2)}`);
    cerrarModales();
    renderClientes();
    loadDashboardData();
  } else {
    alert(` Error al registrar cobro: ${res.message}`);
  }
}

function abrirModalCliente() {
  document.getElementById('cliente-id').value = '';
  document.getElementById('modal-cliente-titulo').textContent = 'Registrar Nuevo Cliente';
  document.getElementById('cliente-nombre').value = '';
  document.getElementById('cliente-rnc').value = '';
  document.getElementById('cliente-telefono').value = '';
  document.getElementById('cliente-direccion').value = '';
  document.getElementById('cliente-limite').value = '';
  document.getElementById('modal-cliente').classList.add('active');
}

function abrirModalEditarCliente(idCliente) {
  const c = (state.clientes || []).find(item => item.id === idCliente);
  if (!c) return;

  document.getElementById('cliente-id').value = c.id;
  document.getElementById('modal-cliente-titulo').textContent = `Editar Cliente: ${c.nombre}`;
  document.getElementById('cliente-nombre').value = c.nombre;
  document.getElementById('cliente-rnc').value = c.rnc_cedula;
  document.getElementById('cliente-ncf-defecto').value = c.tipo_ncf_defecto || 'B02';
  document.getElementById('cliente-telefono').value = c.telefono || '';
  document.getElementById('cliente-direccion').value = c.direccion || '';
  document.getElementById('cliente-limite').value = c.limite_credito || 0;
  document.getElementById('modal-cliente').classList.add('active');
}

async function guardarCliente() {
  const id = parseInt(document.getElementById('cliente-id').value, 10);
  const nombre = document.getElementById('cliente-nombre').value.trim();
  const rncCedula = document.getElementById('cliente-rnc').value.trim();
  const tipoNcfDefecto = document.getElementById('cliente-ncf-defecto').value;
  const telefono = document.getElementById('cliente-telefono').value.trim();
  const direccion = document.getElementById('cliente-direccion').value.trim();
  const limiteCredito = parseFloat(document.getElementById('cliente-limite').value) || 0.00;

  if (!nombre) {
    alert('El nombre o razón social del cliente es obligatorio.');
    return;
  }

  const action = id ? 'actualizar_cliente' : 'registrar_cliente';
  const payload = id
    ? { id, nombre, rncCedula, tipoNcfDefecto, telefono, direccion, limiteCredito }
    : { nombre, rncCedula, tipoNcfDefecto, telefono, direccion, limiteCredito };

  const res = await apiCall(action, payload);

  if (res.status === 'ok') {
    alert(id ? ' ¡Cliente actualizado exitosamente!' : ' ¡Cliente registrado exitosamente!');
    cerrarModales();
    renderClientes();
  } else {
    alert(` Error al guardar cliente: ${res.message}`);
  }
}

async function confirmarEliminarCliente(idCliente) {
  const c = (state.clientes || []).find(item => item.id === idCliente);
  if (!c) return;

  if (!confirm(`¿Estás seguro de eliminar el cliente "${c.nombre}" (#${c.id})?`)) {
    return;
  }

  const res = await apiCall('eliminar_cliente', { idCliente });
  if (res.status === 'ok') {
    alert(` ¡Cliente "${c.nombre}" eliminado exitosamente!`);
    renderClientes();
  } else {
    alert(` No se pudo eliminar cliente: ${res.message}`);
  }
}

// 7. REGISTRO & EDICIÓN DE MERCANCÍA / PRODUCTOS Y PRECIOS
async function abrirModalProducto() {
  document.getElementById('prod-id').value = '';
  document.getElementById('modal-producto-titulo').textContent = 'Registrar Nueva Mercancía / Producto';
  document.getElementById('prod-codigo-interno').value = '';
  document.getElementById('prod-codigo-barras').value = '';
  document.getElementById('prod-nombre').value = '';
  document.getElementById('prod-precio-compra').value = '';
  document.getElementById('prod-precio-mayorista').value = '';
  document.getElementById('prod-precio-detalle').value = '';
  document.getElementById('prod-stock-inicial').value = '';
  document.getElementById('modal-producto').classList.add('active');
}

function abrirModalEditarProducto(idProducto) {
  const p = (state.productos || []).find(prod => prod.id === idProducto);
  if (!p) return;

  document.getElementById('prod-id').value = p.id;
  document.getElementById('modal-producto-titulo').textContent = `Editar Producto & Precio: ${p.nombre}`;
  document.getElementById('prod-codigo-interno').value = p.codigo_interno;
  document.getElementById('prod-codigo-barras').value = p.codigo_barras || '';
  document.getElementById('prod-nombre').value = p.nombre;
  document.getElementById('prod-categoria-select').value = p.id_categoria || 1;
  document.getElementById('prod-unidad').value = p.unidad_medida || 'Caja';
  document.getElementById('prod-precio-compra').value = p.precio_compra;
  document.getElementById('prod-precio-mayorista').value = p.precio_mayorista;
  document.getElementById('prod-precio-detalle').value = p.precio_detalle;
  document.getElementById('prod-itbis').value = p.itbis_porcentaje || 18.00;
  document.getElementById('prod-stock-inicial').value = 0;
  document.getElementById('prod-stock-minimo').value = p.stock_minimo || 10;

  document.getElementById('modal-producto').classList.add('active');
}

async function guardarProducto() {
  const idStr = document.getElementById('prod-id').value;
  const codigoInterno = document.getElementById('prod-codigo-interno').value;
  const codigoBarras = document.getElementById('prod-codigo-barras').value;
  const nombre = document.getElementById('prod-nombre').value;
  const idCategoria = parseInt(document.getElementById('prod-categoria-select').value, 10);
  const unidadMedida = document.getElementById('prod-unidad').value;
  const precioCompra = parseFloat(document.getElementById('prod-precio-compra').value);
  const precioMayorista = parseFloat(document.getElementById('prod-precio-mayorista').value);
  const precioDetalle = parseFloat(document.getElementById('prod-precio-detalle').value);
  const itbisPorcentaje = parseFloat(document.getElementById('prod-itbis').value);
  const stockInicialCentral = parseInt(document.getElementById('prod-stock-inicial').value, 10) || 0;
  const stockMinimo = parseInt(document.getElementById('prod-stock-minimo').value, 10) || 10;

  if (!codigoInterno || !nombre || isNaN(precioCompra) || isNaN(precioMayorista) || isNaN(precioDetalle)) {
    alert('Ingresa el Código Interno, Nombre y los Precios válidos (Compra, Mayorista y Detalle).');
    return;
  }

  const action = idStr ? 'actualizar_producto' : 'registrar_producto';
  const payload = idStr 
    ? { id: parseInt(idStr, 10), codigoInterno, codigoBarras, nombre, idCategoria, unidadMedida, precioCompra, precioMayorista, precioDetalle, itbisPorcentaje, stockMinimo }
    : { codigoInterno, codigoBarras, nombre, idCategoria, unidadMedida, precioCompra, precioMayorista, precioDetalle, itbisPorcentaje, stockInicialCentral, stockMinimo };

  const res = await apiCall(action, payload);

  if (res.status === 'ok') {
    alert(idStr ? ' Producto & Precios actualizados con éxito!' : ' Mercancía registrada exitosamente!');
    cerrarModales();
    loadProductosData();
    renderInventarioCompleto();
  } else {
    alert(` Error al guardar mercancía: ${res.message}`);
  }
}

// Generador de Código de Barras SVG puro 100% Offline (Code 39)
function generateBarcodeSVG(text, height = 36) {
  if (!text) return '';
  const clean = text.toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const code39Patterns = {
    '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
    '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
    '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
    'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
    'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
    'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
    'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
    'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
    'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
    '-': '100101011011', '*': '100101101101'
  };

  const fullText = '*' + clean + '*';
  let binary = '';
  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i];
    binary += (code39Patterns[char] || code39Patterns['0']) + '0';
  }

  let rects = '';
  let x = 10;
  const unitWidth = 1.6;
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      rects += `<rect x="${x}" y="0" width="${unitWidth}" height="${height}" fill="#000000" />`;
    }
    x += unitWidth;
  }

  const totalWidth = x + 10;
  return `<svg viewBox="0 0 ${totalWidth} ${height + 14}" xmlns="http://www.w3.org/2000/svg" style="display:block; margin: 6px auto; max-width: 240px; height: auto;">
    ${rects}
    <text x="${totalWidth / 2}" y="${height + 11}" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle" fill="#000000">*${clean}*</text>
  </svg>`;
}

// 8. HISTORIAL DE VENTAS Y PASAR A FACTURAS DGII
// 8. HISTORIAL DE VENTAS, FILTROS Y EXPORTACIONES EXCEL / PDF
function setFiltroVentasPeriodo(tipo) {
  document.querySelectorAll('.btn-vta-periodo').forEach(b => b.classList.remove('active'));
  const btnActive = document.getElementById(`btn-vta-${tipo}`);
  if (btnActive) btnActive.classList.add('active');

  const inputDesde = document.getElementById('ventas-fecha-desde');
  const inputHasta = document.getElementById('ventas-fecha-hasta');
  if (!inputDesde || !inputHasta) return;

  const now = new Date();
  const toLocalISO = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const hoyStr = toLocalISO(now);

  if (tipo === 'diario') {
    inputDesde.value = hoyStr;
    inputHasta.value = hoyStr;
  } else if (tipo === 'ayer') {
    const ayer = new Date(now);
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = toLocalISO(ayer);
    inputDesde.value = ayerStr;
    inputHasta.value = ayerStr;
  } else if (tipo === 'semanal') {
    const sem = new Date(now);
    sem.setDate(sem.getDate() - 7);
    inputDesde.value = toLocalISO(sem);
    inputHasta.value = hoyStr;
  } else if (tipo === 'quincenal') {
    const quin = new Date(now);
    quin.setDate(quin.getDate() - 15);
    inputDesde.value = toLocalISO(quin);
    inputHasta.value = hoyStr;
  } else if (tipo === 'mensual') {
    const mens = new Date(now.getFullYear(), now.getMonth(), 1);
    inputDesde.value = toLocalISO(mens);
    inputHasta.value = hoyStr;
  } else if (tipo === 'trimestral') {
    const tri = new Date(now);
    tri.setDate(tri.getDate() - 90);
    inputDesde.value = toLocalISO(tri);
    inputHasta.value = hoyStr;
  } else if (tipo === 'semestral') {
    const semes = new Date(now);
    semes.setDate(semes.getDate() - 180);
    inputDesde.value = toLocalISO(semes);
    inputHasta.value = hoyStr;
  } else if (tipo === 'anual') {
    const anual = new Date(now.getFullYear(), 0, 1);
    inputDesde.value = toLocalISO(anual);
    inputHasta.value = hoyStr;
  } else if (tipo === 'todos') {
    inputDesde.value = '';
    inputHasta.value = '';
  }

  filtrarVentasHistorialView();
}

function onVentasFechaManualChange() {
  document.querySelectorAll('.btn-vta-periodo').forEach(b => b.classList.remove('active'));
  filtrarVentasHistorialView();
}

function limpiarFiltroFechasVentas() {
  const inputDesde = document.getElementById('ventas-fecha-desde');
  const inputHasta = document.getElementById('ventas-fecha-hasta');
  if (inputDesde) inputDesde.value = '';
  if (inputHasta) inputHasta.value = '';
  setFiltroVentasPeriodo('todos');
}

async function renderVentasHistorialView() {
  const inputDesde = document.getElementById('ventas-fecha-desde');
  const inputHasta = document.getElementById('ventas-fecha-hasta');
  if (inputDesde && !inputDesde.value && inputHasta && !inputHasta.value) {
    const now = new Date();
    const mens = new Date(now.getFullYear(), now.getMonth(), 1);
    const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    inputDesde.value = toLocalISO(mens);
    inputHasta.value = toLocalISO(now);
  }

  const res = await apiCall('get_ventas', { limit: 500 });
  if (res.status === 'ok') {
    state.historialVentas = res.data || [];
    filtrarVentasHistorialView();
  }
}

function extraerSoloFechaYMD(fechaStr) {
  if (!fechaStr) return '';
  const s = String(fechaStr).trim();
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return s;
}

function filtrarVentasHistorialView() {
  const inputEl = document.getElementById('ventas-search-input');
  const rawQuery = inputEl ? inputEl.value.trim().toLowerCase() : '';
  const query = rawQuery.replace('#', '').replace(/\*/g, '');

  let rawDesde = document.getElementById('ventas-fecha-desde') ? document.getElementById('ventas-fecha-desde').value : '';
  let rawHasta = document.getElementById('ventas-fecha-hasta') ? document.getElementById('ventas-fecha-hasta').value : '';
  const almacenFiltro = document.getElementById('ventas-almacen-select') ? document.getElementById('ventas-almacen-select').value : '';

  let dInicio = extraerSoloFechaYMD(rawDesde);
  let dFin = extraerSoloFechaYMD(rawHasta);

  // Si el usuario ingresó fechas invertidas (ej. Desde: Ayer y Hasta: Hace 7 días), normalizarlas automáticamente
  if (dInicio && dFin && dInicio > dFin) {
    const temp = dInicio;
    dInicio = dFin;
    dFin = temp;
  }

  // Indicador de rango de fecha o estado
  const indicadorEl = document.getElementById('ventas-periodo-indicador');
  if (indicadorEl) {
    if (dInicio && dFin) {
      if (dInicio === dFin) {
        indicadorEl.textContent = `📅 ${dInicio}`;
      } else {
        indicadorEl.textContent = `📅 ${dInicio} al ${dFin}`;
      }
      indicadorEl.style.display = 'inline-block';
    } else if (dInicio) {
      indicadorEl.textContent = `📅 Desde ${dInicio}`;
      indicadorEl.style.display = 'inline-block';
    } else if (dFin) {
      indicadorEl.textContent = `📅 Hasta ${dFin}`;
      indicadorEl.style.display = 'inline-block';
    } else {
      indicadorEl.textContent = `📅 Todas las fechas`;
      indicadorEl.style.display = 'inline-block';
    }
  }

  const tbody = document.getElementById('tbl-ventas-historial');
  if (!state.historialVentas || state.historialVentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No hay ventas registradas en la base de datos.</td></tr>`;
    actualizarKPIsVentas([]);
    return;
  }

  const filtradas = state.historialVentas.filter(v => {
    // Filtro por Fecha (Extraer YYYY-MM-DD independientemente del formato de hora)
    const fechaVenta = extraerSoloFechaYMD(v.fecha);
    if (dInicio && fechaVenta < dInicio) return false;
    if (dFin && fechaVenta > dFin) return false;

    // Filtro por Almacén / Origen
    if (almacenFiltro === '1' && v.id_almacen !== 1) return false;
    if (almacenFiltro === 'camiones' && v.id_almacen === 1) return false;

    // Filtro por Búsqueda rápida
    if (query) {
      const idStr = v.id.toString();
      const ncfStr = (v.ncf || '').toLowerCase();
      const clienteStr = (v.nombre_cliente || '').toLowerCase();
      const almacenStr = (v.almacen_nombre || '').toLowerCase();
      const pagoStr = (v.tipo_pago || '').toLowerCase();

      const coincide = idStr === query ||
                       idStr.includes(query) ||
                       ncfStr.includes(query) ||
                       clienteStr.includes(query) ||
                       almacenStr.includes(query) ||
                       pagoStr.includes(query);
      if (!coincide) return false;
    }

    return true;
  });

  state.ventasFiltradasActuales = filtradas;
  actualizarKPIsVentas(filtradas);

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--color-text-muted);">No se encontraron ventas para los filtros seleccionados.</td></tr>`;
    return;
  }

  renderFilasHistorialVentas(filtradas);
}

function actualizarKPIsVentas(ventas) {
  const kpiMonto = document.getElementById('kpi-ventas-total-monto');
  const kpiCosto = document.getElementById('kpi-ventas-costo-monto');
  const kpiGanancia = document.getElementById('kpi-ventas-ganancia-monto');
  const kpiCant = document.getElementById('kpi-ventas-cantidad');

  if (!kpiMonto) return;

  const totalVendido = ventas.reduce((acc, v) => acc + (v.total || 0), 0);
  const totalCosto = ventas.reduce((acc, v) => acc + (v.costo_total || 0), 0);
  const totalGanancia = ventas.reduce((acc, v) => acc + ((v.ganancia_estimada !== undefined && v.ganancia_estimada !== null) ? v.ganancia_estimada : ((v.total || 0) - (v.costo_total || 0))), 0);
  const cantVentas = ventas.length;

  kpiMonto.textContent = `RD$ ${totalVendido.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  kpiCosto.textContent = `RD$ ${totalCosto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  kpiGanancia.textContent = `RD$ ${totalGanancia.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  kpiCant.textContent = cantVentas.toString();
}

function renderFilasHistorialVentas(ventas) {
  const tbody = document.getElementById('tbl-ventas-historial');
  tbody.innerHTML = ventas.map((v, i) => {
    const fechaObj = new Date(v.fecha);
    const fechaHoraStr = fechaObj.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const costo = v.costo_total || 0;
    const total = v.total || 0;
    const ganancia = (v.ganancia_estimada !== undefined && v.ganancia_estimada !== null) ? v.ganancia_estimada : (total - costo);

    return `
    <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f4edfa'};">
      <td><strong style="font-size: 14px; color: var(--color-primary);">#${v.id}</strong></td>
      <td><span style="font-size: 12px; font-weight: 600; color: #3d3550;">${fechaHoraStr}</span></td>
      <td><strong style="color: #0b0912;">${v.nombre_cliente || 'Consumidor Final'}</strong> ${v.rnc_cliente ? `<br><small style="color:#6b6578;">RNC: ${v.rnc_cliente}</small>` : ''}</td>
      <td><span style="color: #3d3550;">${(v.almacen_nombre || 'Almacén Central').replace(/AlmacÃ³n/g, 'Almacén')}</span></td>
      <td><span class="badge ${v.tipo_pago === 'Credito' ? 'badge-warning' : 'badge-info'}">${v.tipo_pago || 'Contado'}</span></td>
      <td><strong style="color: #dc2626;">RD$ ${costo.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td><strong style="color: var(--color-primary);">RD$ ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td><strong style="color: #16a34a;">RD$ ${ganancia.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="abrirModalEditarVenta(${v.id})">Editar</button>
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="abrirModalDetalleVenta(${v.id})">Detalle</button>
          <button class="btn btn-success" style="padding: 4px 8px; font-size: 11px;" onclick="imprimirTicketTermico(${v.id})" title="Imprimir Ticket">🖨️ Ticket</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px; background: #dc2626; color: white; border: none; cursor: pointer;" onclick="confirmarEliminarVenta(${v.id})" title="Eliminar Venta del Sistema">🗑️ Eliminar</button>
        </div>
      </td>
    </tr>
    `;
  }).join('');
}

// Exportación Profesional de Historial de Ventas a Excel (CSV)
function exportarVentasExcel() {
  const lista = state.ventasFiltradasActuales || state.historialVentas || [];
  if (!lista || lista.length === 0) {
    alert('No hay ventas disponibles para exportar en el rango seleccionado.');
    return;
  }

  const cfg = state.configEmpresa || {};
  const empNombre = cfg.nombre_empresa || 'DISTRIBUIDORA ROJAS PERALTA';
  const empRnc = cfg.rnc || '1-01-82934-1';
  const empTel = cfg.telefono || '(809) 555-0199';
  const empDir = cfg.direccion || 'Santo Domingo, Republica Dominicana';

  const fechaDesdeStr = document.getElementById('ventas-fecha-desde') ? document.getElementById('ventas-fecha-desde').value : 'Inicio';
  const fechaHastaStr = document.getElementById('ventas-fecha-hasta') ? document.getElementById('ventas-fecha-hasta').value : 'Hoy';

  const headers = [
    'ID Venta',
    'Fecha y Hora',
    'Cliente',
    'RNC / Cedula',
    'Origen / Almacen',
    'Forma de Pago',
    'Subtotal Venta (DOP)',
    'Descuento (DOP)',
    'Costo Mercancia (DOP)',
    'Total Neto Venta (DOP)',
    'Ganancia Estimada (DOP)',
    'Estado'
  ];

  let totalGeneralVentas = 0;
  let totalSubtotal = 0;
  let totalDescuentos = 0;
  let totalCostosMercancia = 0;
  let totalGanancias = 0;

  const rows = lista.map(v => {
    const sub = v.subtotal || v.total || 0;
    const desc = v.descuento_global || 0;
    const tot = v.total || 0;
    const costo = v.costo_total || 0;
    const ganancia = (v.ganancia_estimada !== undefined && v.ganancia_estimada !== null) ? v.ganancia_estimada : (tot - costo);

    totalSubtotal += sub;
    totalDescuentos += desc;
    totalGeneralVentas += tot;
    totalCostosMercancia += costo;
    totalGanancias += ganancia;

    const almacenClean = (v.almacen_nombre || 'Almacen Central')
      .replace(/AlmacÃ³n/g, 'Almacen')
      .replace(/Almacén/g, 'Almacen')
      .replace(/"/g, '""');

    return [
      `"#${v.id}"`,
      `"${new Date(v.fecha).toLocaleString('es-DO')}"`,
      `"${(v.nombre_cliente || 'Consumidor Final').replace(/"/g, '""')}"`,
      `"${v.rnc_cliente || 'N/A'}"`,
      `"${almacenClean}"`,
      `"${v.tipo_pago || 'Contado'}"`,
      sub.toFixed(2),
      desc.toFixed(2),
      costo.toFixed(2),
      tot.toFixed(2),
      ganancia.toFixed(2),
      `"${v.estado_venta || 'Completada'}"`
    ].join(';');
  });

  const totalsRow = [
    '"TOTALES GENERALES"',
    '""',
    '""',
    '""',
    '""',
    '""',
    totalSubtotal.toFixed(2),
    totalDescuentos.toFixed(2),
    totalCostosMercancia.toFixed(2),
    totalGeneralVentas.toFixed(2),
    totalGanancias.toFixed(2),
    '""'
  ].join(';');

  const csvContent = '\uFEFFsep=;\n' + [
    `"REPORTE GENERAL DE HISTORIAL DE VENTAS Y GANANCIAS"`,
    `"Empresa: ${empNombre.replace(/"/g, '""')} | RNC: ${empRnc} | Tel: ${empTel}"`,
    `"Direccion: ${empDir.replace(/"/g, '""')}"`,
    `"Rango de Fechas: ${fechaDesdeStr} hasta ${fechaHastaStr}"`,
    `"Fecha de Generacion: ${new Date().toLocaleString('es-DO')}"`,
    `""`,
    headers.join(';'),
    ...rows,
    totalsRow
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `reporte_ventas_ganancias_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Exportación Profesional de Historial de Ventas a PDF (Impresión Directa PDF)
function exportarVentasPDF() {
  const lista = state.ventasFiltradasActuales || state.historialVentas || [];
  if (!lista || lista.length === 0) {
    alert('No hay datos de ventas para generar la plantilla PDF.');
    return;
  }

  const cfg = state.configEmpresa || {};
  const empNombre = cfg.nombre_empresa || 'DISTRIBUIDORA ROJAS PERALTA';
  const empRnc = cfg.rnc || '1-01-82934-1';
  const empTel = cfg.telefono || '(809) 555-0199';
  const empDir = cfg.direccion || 'Santo Domingo, República Dominicana';
  const empMsg = cfg.mensaje_factura || 'Distribución & Venta de Mercancías al Mayor y Detalle';

  const fechaDesdeStr = document.getElementById('ventas-fecha-desde') ? document.getElementById('ventas-fecha-desde').value : 'Inicio';
  const fechaHastaStr = document.getElementById('ventas-fecha-hasta') ? document.getElementById('ventas-fecha-hasta').value : 'Hoy';

  const totalVendido = lista.reduce((acc, v) => acc + (v.total || 0), 0);
  const totalCosto = lista.reduce((acc, v) => acc + (v.costo_total || 0), 0);
  const totalGanancia = lista.reduce((acc, v) => acc + ((v.ganancia_estimada !== undefined && v.ganancia_estimada !== null) ? v.ganancia_estimada : ((v.total || 0) - (v.costo_total || 0))), 0);
  const cantVentas = lista.length;
  const promedioVenta = cantVentas > 0 ? (totalVendido / cantVentas) : 0;

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div style="padding: 24px; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0b0912; max-width: 1100px; margin: 0 auto; background: #ffffff;">
      <!-- MEMBRETE OFICIAL COMPLETO DEL NEGOCIO -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3c096c; padding-bottom: 14px; margin-bottom: 18px;">
        <div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 900; color: #3c096c; text-transform: uppercase; letter-spacing: 0.5px;">${empNombre}</h1>
          <div style="font-size: 11px; color: #3d3550; margin-top: 4px; line-height: 1.4;">
            <b>RNC:</b> ${empRnc} &nbsp;|&nbsp; <b>Teléfono:</b> ${empTel}<br>
            <b>Dirección Fiscal:</b> ${empDir}<br>
            <span style="color: #6b6578; font-style: italic;">${empMsg}</span>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="background: #3c096c; color: #ffffff; padding: 8px 16px; border-radius: 6px; font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px;">
            REPORTE DE VENTAS & GANANCIAS
          </div>
          <div style="font-size: 11px; color: #3d3550; margin-top: 6px; font-weight: 700;">Período: <span style="color: #3c096c;">${fechaDesdeStr}</span> al <span style="color: #3c096c;">${fechaHastaStr}</span></div>
          <div style="font-size: 10px; color: #6b6578; margin-top: 2px;">Emisión: ${new Date().toLocaleString('es-DO')}</div>
        </div>
      </div>

      <!-- TARJETAS DE RESUMEN EJECUTIVO KPI -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #d9d3e3; border-radius: 6px; overflow: hidden;">
        <tr style="background: #3c096c; color: #ffffff; text-transform: uppercase; font-size: 10px; font-weight: 800;">
          <th style="padding: 8px; text-align: center; border-right: 1px solid #a64dd8;">Transacciones</th>
          <th style="padding: 8px; text-align: right; border-right: 1px solid #a64dd8;">Total Costo Mercancía</th>
          <th style="padding: 8px; text-align: right; border-right: 1px solid #a64dd8;">Total Vendido</th>
          <th style="padding: 8px; text-align: right; border-right: 1px solid #a64dd8;">Ganancia Estimada</th>
          <th style="padding: 8px; text-align: right;">Ticket Promedio</th>
        </tr>
        <tr style="font-size: 12px; font-weight: 900; background: #faf8fc; color: #0b0912;">
          <td style="padding: 10px; text-align: center; border-right: 1px solid #e8e3f0;">${cantVentas} ventas</td>
          <td style="padding: 10px; text-align: right; color: #dc2626; border-right: 1px solid #e8e3f0;">RD$ ${totalCosto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 10px; text-align: right; color: #3c096c; border-right: 1px solid #e8e3f0;">RD$ ${totalVendido.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 10px; text-align: right; color: #16a34a; font-size: 14px; border-right: 1px solid #e8e3f0;">RD$ ${totalGanancia.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 10px; text-align: right; color: #5a189a;">RD$ ${promedioVenta.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>

      <!-- TABLA DETALLADA CON FILAS AZUL INTERCALADAS Y LETRAS NEGRAS -->
      <h4 style="margin: 0 0 8px 0; font-size: 12px; color: #0b0912; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px;">
        Desglose Completo de Transacciones
      </h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 24px; border: 1px solid #9a92ab;">
        <thead>
          <tr style="background: #3c096c; color: #ffffff; text-align: left; font-size: 10px; text-transform: uppercase;">
            <th style="padding: 8px; border: 1px solid #3c096c; text-align: center;"># Venta</th>
            <th style="padding: 8px; border: 1px solid #3c096c;">Fecha y Hora</th>
            <th style="padding: 8px; border: 1px solid #3c096c;">Cliente / Razon Social</th>
            <th style="padding: 8px; border: 1px solid #3c096c;">Origen / Ubicacion</th>
            <th style="padding: 8px; border: 1px solid #3c096c; text-align: center;">Forma Pago</th>
            <th style="padding: 8px; border: 1px solid #3c096c; text-align: right;">Costo (DOP)</th>
            <th style="padding: 8px; border: 1px solid #3c096c; text-align: right;">Venta Total (DOP)</th>
            <th style="padding: 8px; border: 1px solid #3c096c; text-align: right;">Ganancia (DOP)</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map((v, i) => {
            const costo = v.costo_total || 0;
            const total = v.total || 0;
            const ganancia = (v.ganancia_estimada !== undefined && v.ganancia_estimada !== null) ? v.ganancia_estimada : (total - costo);
            const bgColor = (i % 2 === 0) ? '#ffffff' : '#efe5f8';

            return `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #d9d3e3; color: #0b0912;">
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; text-align: center; font-weight: 900; color: #3c096c;">#${v.id}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; color: #0b0912; font-weight: 600;">${new Date(v.fecha).toLocaleString('es-DO')}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; color: #0b0912;"><b>${v.nombre_cliente || 'Consumidor Final'}</b> ${v.rnc_cliente ? `<br><small style="color:#51475f;">RNC: ${v.rnc_cliente}</small>` : ''}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; color: #0b0912;">${(v.almacen_nombre || 'Almacén Central').replace(/AlmacÃ³n/g, 'Almacén')}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; text-align: center; font-weight: 800; color: #0b0912;">${v.tipo_pago || 'Contado'}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; text-align: right; font-weight: 800; color: #dc2626;">RD$ ${costo.toFixed(2)}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; text-align: right; font-weight: 800; color: #3c096c;">RD$ ${total.toFixed(2)}</td>
              <td style="padding: 7px 6px; border: 1px solid #d9d3e3; text-align: right; font-weight: 900; color: #16a34a;">RD$ ${ganancia.toFixed(2)}</td>
            </tr>
            `;
          }).join('')}
          <tr style="background: #3c096c; color: #ffffff; font-weight: 900; font-size: 11px;">
            <td colspan="5" style="padding: 8px; text-align: right; border: 1px solid #3c096c;">TOTALES ACUMULADOS:</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #3c096c;">RD$ ${totalCosto.toFixed(2)}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #3c096c;">RD$ ${totalVendido.toFixed(2)}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #3c096c; color: #86efac;">RD$ ${totalGanancia.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <!-- FIRMAS DE CERTIFICACIÓN Y GERENCIA GENERAL -->
      <div style="margin-top: 40px; display: flex; justify-content: space-between; padding: 0 50px;">
        <div style="text-align: center; width: 240px; border-top: 2px solid #0b0912; padding-top: 8px; font-size: 11px; font-weight: 800; color: #0b0912;">
          Elaborado por / Auditoría Financiera
        </div>
        <div style="text-align: center; width: 240px; border-top: 2px solid #0b0912; padding-top: 8px; font-size: 11px; font-weight: 800; color: #0b0912;">
          Aprobado por Gerencia General
        </div>
      </div>
    </div>
  `;

  window.print();
}

// 8.1 MODAL DE DETALLE COMPLETO DE VENTA Y ANULACIÓN B04 DGII
async function abrirModalDetalleVenta(idVenta) {
 const res = await apiCall('get_venta_detalle', { idVenta });
 if (res.status !== 'ok' || !res.data) {
 alert('No se pudo obtener el detalle de la venta.');
 return;
 }

 const v = res.data;
 state.currentVentaDetalle = v;

 document.getElementById('modal-detalle-titulo').textContent = `Detalle Completo de Transacción / Factura #${v.id}`;
 document.getElementById('modal-detalle-cliente').textContent = v.nombre_cliente || 'Consumidor Final';
 document.getElementById('modal-detalle-rnc').textContent = v.rnc_cliente || 'N/A';
 document.getElementById('modal-detalle-ncf').textContent = v.ncf || 'SIN NCF';
 document.getElementById('modal-detalle-fecha').textContent = new Date(v.fecha).toLocaleString('es-DO');
 document.getElementById('modal-detalle-almacen').textContent = v.almacen_nombre || 'Almacén Central';
 document.getElementById('modal-detalle-pago').textContent = v.tipo_pago;

 const esAnulada = v.estado_venta === 'Anulada';
 const badgeEl = document.getElementById('modal-detalle-estado');
 badgeEl.textContent = v.estado_venta;
 badgeEl.style.background = esAnulada ? '#fee2e2' : '#dcfce7';
 badgeEl.style.color = esAnulada ? '#991b1b' : '#15803d';

 document.getElementById('modal-detalle-total').textContent = `RD$ ${v.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

 const btnAnular = document.getElementById('btn-anular-venta');
 if (btnAnular) {
 btnAnular.style.display = esAnulada ? 'none' : 'inline-block';
 }

 document.getElementById('btn-print-ticket-modal').onclick = () => imprimirTicketTermico(v.id);
 document.getElementById('btn-print-pdf-modal').onclick = () => imprimirFacturaPDFDGII(v.id);

 const tbody = document.getElementById('tbl-detalle-venta-items');
 tbody.innerHTML = (v.detalles || []).map(d => `
 <tr>
 <td><code>${d.codigo_interno || d.codigo_barras || 'PROD'}</code></td>
 <td><strong>${d.producto_nombre}</strong></td>
 <td>${d.cantidad}</td>
 <td>RD$ ${d.precio_unitario.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
 <td>RD$ ${d.itbis_monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
 <td><strong>RD$ ${d.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
 </tr>
 `).join('');

 document.getElementById('modal-detalle-venta').classList.add('active');
}

async function ejecutarAnulacionVenta() {
 if (!state.currentVentaDetalle) return;
 const idVenta = state.currentVentaDetalle.id;

 const motivo = prompt(`¿Estás seguro de anular la Venta #${idVenta}?\n\n- Se restituirá el stock de mercancías al almacén.\n- Si fue facturada con NCF, se generará la Nota de Crédito B04 DGII.\n\nEscribe el motivo de la anulación:`, 'Cancelación de pedido por el cliente');

 if (!motivo) return;

 const res = await apiCall('anular_venta', { idVenta, motivo });
 if (res.status === 'ok') {
 alert(` ${res.data.mensaje}`);
 cerrarModales();
 renderVentasHistorialView();
 loadProductosData();
 loadDashboardData();
 } else {
 alert(` Error al anular venta: ${res.message}`);
 }
}

async function confirmarEliminarVenta(idVenta) {
  const v = (state.historialVentas || []).find(x => x.id === idVenta) || state.currentVentaDetalle;
  const clienteNombre = v ? (v.nombre_cliente || 'Consumidor Final') : '';
  const totalMonto = v ? `RD$ ${parseFloat(v.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '';

  const confirmMsg = `⚠️ ¿Está seguro de que desea ELIMINAR permanentemente la Venta #${idVenta} (${clienteNombre} - ${totalMonto})?\n\n• La venta se borrará por completo del historial.\n• El stock de los productos se devolverá automáticamente al inventario del almacén.\n• Si era a crédito, se anulará la cuenta por cobrar asociada.\n\nEsta acción no se puede deshacer. ¿Desea continuar?`;

  if (!confirm(confirmMsg)) return;

  const res = await apiCall('eliminar_venta', { idVenta });
  if (res.status === 'ok') {
    alert(` Venta #${idVenta} eliminada correctamente y mercancía devuelta al stock.`);
    cerrarModales();
    await renderVentasHistorialView();
    await loadProductosData();
    await loadDashboardData();
  } else {
    alert(` Error al eliminar la venta: ${res.message}`);
  }
}

async function ejecutarEliminarVentaModal() {
  if (!state.currentVentaDetalle) return;
  const idVenta = state.currentVentaDetalle.id;
  await confirmarEliminarVenta(idVenta);
}

// MOTOR REAL FISCAL DGII: MODAL DE PREVISUALIZACIÓN Y ASIGNACIÓN DE NCF
async function abrirModalEmisionNCF(idVenta) {
 const venta = state.historialVentas ? state.historialVentas.find(v => v.id === idVenta) : null;
 state.currentVentaEmisionNCF = idVenta;

 document.getElementById('modal-ncf-venta-info').textContent = `Venta #${idVenta}`;
 document.getElementById('modal-ncf-total-info').textContent = `RD$ ${(venta ? venta.total : 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

 document.getElementById('modal-ncf-rnc-input').value = (venta && venta.rnc_cliente) ? venta.rnc_cliente : '';
 document.getElementById('modal-ncf-nombre-input').value = (venta && venta.nombre_cliente) ? venta.nombre_cliente : 'CLIENTE CONTADO';

 await actualizarPrevisualizacionNCF();
 document.getElementById('modal-emision-ncf').classList.add('active');
}

async function actualizarPrevisualizacionNCF() {
 const tipoNCF = document.getElementById('modal-ncf-tipo-select').value;
 const res = await apiCall('get_proximo_ncf', { tipoNCF });

 if (res.status === 'ok' && res.data) {
 document.getElementById('modal-ncf-preview-code').textContent = res.data.ncf;
 document.getElementById('modal-ncf-preview-count').textContent = `Quedan ${res.data.disponibles} secuencias disponibles para ${res.data.descripcion || tipoNCF} (Vence: ${res.data.vencimiento})`;
 }
}

async function confirmarEmisionNCF() {
 const idVenta = state.currentVentaEmisionNCF;
 const tipoNCF = document.getElementById('modal-ncf-tipo-select').value;

 const res = await apiCall('asignar_ncf', { idVenta, tipoNCF });
 if (res.status === 'ok') {
 alert(` ¡Comprobante Fiscal DGII emitido con éxito!\nNCF Asignado: ${res.data.ncf}\n\nLa factura ha sido registrada en el módulo de Facturas DGII.`);
 cerrarModales();
 switchView('billing');
 } else {
 alert(` Error al emitir NCF: ${res.message}`);
 }
}

// 9. TABLA DE FACTURAS FISCALES DGII Y SECUENCIAS
async function loadFacturasDGIITable() {
 // 1. Cargar secuencias NCF
 const secRes = await apiCall('get_secuencias_ncf');
 if (secRes.status === 'ok') {
 state.secuenciasNCF = secRes.data || [];
 const tbodySec = document.getElementById('tbl-secuencias-ncf-status');
 tbodySec.innerHTML = state.secuenciasNCF.map(s => {
 const disp = s.disponibles;
 let badgeDisp = `<strong style="color: var(--color-success);">${disp} NCF</strong>`;
 if (disp <= 0) {
 badgeDisp = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:800;"> AGOTADO</span>`;
 } else if (disp < 20) {
 badgeDisp = `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:800;"> ${disp} RESTANTES</span>`;
 }

 return `
 <tr>
 <td><strong style="color: var(--color-primary);">${s.tipo_ncf}</strong></td>
 <td>${s.descripcion}</td>
 <td><span class="badge" style="background:#efe5f8; color:#5a189a; font-weight:800; font-family:monospace;">${s.proximo_ncf}</span></td>
 <td>${badgeDisp}</td>
 <td>${s.prefijo}${s.tipo_ncf.replace('B','')}00000001 al ${s.prefijo}${s.tipo_ncf.replace('B','')}${s.secuencia_fin.toString().padStart(8,'0')}</td>
 <td>${s.fecha_vencimiento}</td>
 <td>
 <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="abrirModalEditarSecuencia(${s.id})"> Editar Secuencia</button>
 </td>
 </tr>
 `;
 }).join('');
 }

 // 2. Cargar facturas fiscales emitidas
 const res = await apiCall('get_ventas', { limit: 200 });
 if (res.status === 'ok') {
 state.facturasDGII = (res.data || []).filter(v => v.ncf && !v.ncf.includes('PENDIENTE') && !v.ncf.includes('SIN NCF'));
 filtrarTablaDGII();
 }
}

function filtrarTablaDGII() {
 const tipoFiltro = document.getElementById('filtro-dgii-tipo-ncf') ? document.getElementById('filtro-dgii-tipo-ncf').value : 'TODOS';
 const query = (document.getElementById('filtro-dgii-busqueda') ? document.getElementById('filtro-dgii-busqueda').value : '').toLowerCase().trim();

 const tbody = document.getElementById('tbl-facturas-dgii');
 if (!state.facturasDGII || state.facturasDGII.length === 0) {
 tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No hay facturas fiscales NCF emitidas aún.</td></tr>`;
 return;
 }

 const filtradas = state.facturasDGII.filter(f => {
 const coincideTipo = tipoFiltro === 'TODOS' || f.tipo_ncf === tipoFiltro;
 const coincideQuery = !query || 
 (f.ncf && f.ncf.toLowerCase().includes(query)) ||
 (f.rnc_cliente && f.rnc_cliente.toLowerCase().includes(query)) ||
 (f.nombre_cliente && f.nombre_cliente.toLowerCase().includes(query));

 return coincideTipo && coincideQuery;
 });

 if (filtradas.length === 0) {
 tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No se encontraron facturas NCF que coincidan con la búsqueda.</td></tr>`;
 return;
 }

 tbody.innerHTML = filtradas.map(f => `
 <tr>
 <td><strong style="color: var(--color-primary); font-family: monospace;">${f.ncf}</strong></td>
 <td><span class="badge" style="background:#efe5f8; color:#5a189a; padding:2px 8px; border-radius:4px; font-weight:700;">${f.tipo_ncf}</span></td>
 <td><code>${f.rnc_cliente || 'Consumidor Final'}</code></td>
 <td><strong>${f.nombre_cliente || 'Consumidor Final'}</strong></td>
 <td>RD$ ${f.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
 <td>RD$ ${f.itbis_total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
 <td><strong style="color: var(--color-success);">RD$ ${f.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
 <td>${new Date(f.fecha).toLocaleDateString('es-DO')}</td>
 <td>
    <div class="actions-dropdown">
      <button class="btn-icon-dots" onclick="toggleDropdownMenu(event, 'drop-dgii-${f.id}')">&#8942;</button>
      <div id="drop-dgii-${f.id}" class="dropdown-content">
        <button class="dropdown-item" onclick="abrirModalDetalleVenta(${f.id})">Ver Detalle Venta</button>
        <button class="dropdown-item" onclick="imprimirTicketTermico(${f.id})">Imprimir Ticket</button>
        <button class="dropdown-item" onclick="imprimirFacturaPDFDGII(${f.id})">Factura PDF NCF</button>
      </div>
    </div>
 </td>
 </tr>
 `).join('');
}

// 10. FUNCIONES DE IMPRESIÓN DIRECTA (TICKET 80MM Y FACTURA FISCAL / CONDUCE PDF)
async function imprimirTicketTermico(idVenta) {
  const res = await apiCall('get_venta_detalle', { idVenta });
  if (res.status !== 'ok' || !res.data) {
    alert('No se pudo cargar la información de la venta.');
    return;
  }
  const v = res.data;
  const cfg = state.configEmpresa || {};
  const empNombre = cfg.nombre_empresa || 'DISTRIBUIDORA ROJAS PERALTA';
  const empRnc = cfg.rnc || '1-01-82934-1';
  const empTel = cfg.telefono || '(809) 555-0199';
  const empDir = cfg.direccion || 'Santo Domingo, República Dominicana';
  const empMsg = cfg.mensaje_factura || '¡Gracias por preferirnos!';

  const printArea = document.getElementById('print-area');
  const fechaStr = new Date(v.fecha).toLocaleDateString('es-DO') + ' ' + new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const barcodeCode = `VENTA-${v.id.toString().padStart(6, '0')}`;
  const barcodeSVG = generateBarcodeSVG(barcodeCode, 32);

  const subtotalProductos = (v.detalles || []).reduce((sum, d) => sum + (d.cantidad * d.precio_unitario), 0);
  const descuentoGlobal = v.descuento || v.descuento_global || 0;
  const totalPagar = v.total || (subtotalProductos - descuentoGlobal);

  printArea.innerHTML = `
    <div class="ticket-80mm-wrapper">
      <div class="ticket-header">
        <h2 class="ticket-brand">${empNombre}</h2>
        <div class="ticket-meta">RNC: ${empRnc}</div>
        <div class="ticket-meta">${empDir}</div>
        <div class="ticket-meta">Tel: ${empTel}</div>
        <div class="ticket-divider">------------------------------------------</div>
        <div class="ticket-title">${v.ncf && !v.ncf.includes('SIN NCF') ? `COMPROBANTE FISCAL (${v.tipo_ncf || 'B02'})` : 'TICKET DE VENTA INTERNA'}</div>
        ${v.ncf && !v.ncf.includes('SIN NCF') ? `<div class="ticket-ncf">NCF: ${v.ncf}</div>` : ''}
      </div>

      <div class="ticket-info">
        <div><b>TICKET #:</b> #${v.id}</div>
        <div><b>FECHA:</b> ${fechaStr}</div>
        <div><b>CLIENTE:</b> ${v.nombre_cliente || 'Consumidor Final'}</div>
        ${v.rnc_cliente ? `<div><b>RNC/CÉDULA:</b> ${v.rnc_cliente}</div>` : ''}
        <div><b>ORIGEN:</b> ${v.almacen_nombre || 'Almacén Central'}</div>
        <div><b>FORMA PAGO:</b> ${v.tipo_pago || 'Contado'}</div>
      </div>

      <div class="ticket-divider">------------------------------------------</div>

      <table class="ticket-table">
        <thead>
          <tr>
            <th style="text-align: left;">CANT/PROD</th>
            <th style="text-align: right;">PRECIO</th>
            <th style="text-align: right;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${(v.detalles || []).map(d => {
            const lineTotal = d.cantidad * d.precio_unitario;
            return `
            <tr>
              <td colspan="3" class="ticket-prod-name"><b>${d.producto_nombre}</b></td>
            </tr>
            <tr>
              <td>${d.cantidad} x RD$ ${d.precio_unitario.toFixed(2)}</td>
              <td style="text-align: right;">RD$ ${d.precio_unitario.toFixed(2)}</td>
              <td style="text-align: right; font-weight: bold;">RD$ ${lineTotal.toFixed(2)}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="ticket-divider">------------------------------------------</div>

      <div class="ticket-totals">
        <div><span>SUBTOTAL:</span> <span>RD$ ${subtotalProductos.toFixed(2)}</span></div>
        ${descuentoGlobal > 0 ? `<div><span>DESCUENTO:</span> <span>-RD$ ${descuentoGlobal.toFixed(2)}</span></div>` : ''}
        <div class="ticket-grand-total"><span>TOTAL DOP:</span> <span>RD$ ${totalPagar.toFixed(2)}</span></div>
      </div>

      <div class="ticket-divider">------------------------------------------</div>

      <div class="ticket-footer">
        ${barcodeSVG}
        <div class="ticket-thanks">${empMsg}</div>
        <div class="ticket-software">Software ERP Autónomo - ${empNombre}</div>
      </div>
    </div>
  `;

  // Asignar clase de impresión térmica de 80mm al body
  document.body.classList.add('print-ticket-mode');

  window.print();

  setTimeout(() => {
    document.body.classList.remove('print-ticket-mode');
  }, 500);
}

async function imprimirFacturaPDFDGII(idVenta) {
  const res = await apiCall('get_venta_detalle', { idVenta });
  if (res.status !== 'ok' || !res.data) {
    alert('No se pudo cargar la información de la factura.');
    return;
  }
  const v = res.data;
  const cfg = state.configEmpresa || {};
  const empNombre = cfg.nombre_empresa || 'DISTRIBUIDORA ROJAS PERALTA';
  const empRnc = cfg.rnc || '1-01-82934-1';
  const empTel = cfg.telefono || '(809) 555-0199';
  const empDir = cfg.direccion || 'Santo Domingo, República Dominicana';
  const empMsg = cfg.mensaje_factura || '¡Gracias por su preferencia!';

  const printArea = document.getElementById('print-area');
  const fechaStr = new Date(v.fecha).toLocaleDateString('es-DO') + ' ' + new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const tieneNCF = v.ncf && !v.ncf.includes('SIN NCF') && !v.ncf.includes('PENDIENTE');
  const barcodeCode = `VENTA-${v.id.toString().padStart(6, '0')}`;
  const barcodeSVG = generateBarcodeSVG(barcodeCode, 40);

  printArea.innerHTML = `
    <div class="factura-full">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h1 style="margin: 0; font-size: 22px; color: #3c096c; text-transform: uppercase;">${empNombre}</h1>
          <div style="font-size: 12px; font-weight: 700;">RNC EMISOR: ${empRnc}</div>
          <div style="font-size: 12px;">Venta y Distribución al Por Mayor y Detalle</div>
          <div style="font-size: 12px;">${empDir} | Tel: ${empTel}</div>
        </div>
        <div style="text-align: right;">
          <div style="background: #f1edf6; padding: 8px 14px; border-radius: 6px; border: 1px solid #d9d3e3;">
            <div style="font-size: 11px; font-weight: 800; color: #51475f;">${tieneNCF ? 'COMPROBANTE FISCAL DGII' : 'FACTURA DE VENTA / CONDUCE'}</div>
            <div style="font-size: 20px; font-weight: 900; color: #7b2cbf; font-family: monospace;">${tieneNCF ? v.ncf : 'FACTURA #' + v.id}</div>
            <div style="font-size: 12px; font-weight: 700;">${tieneNCF ? 'TIPO: ' + (v.tipo_ncf || 'B02') + ' - FACTURA FISCAL' : 'DOCUMENTO DE VENTA Y ENTREGA'}</div>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #faf8fc; padding: 12px; border-radius: 6px; margin-bottom: 16px; border: 1px solid #e8e3f0;">
        <div>
          <div><b>CLIENTE / RAZÓN SOCIAL:</b> ${v.nombre_cliente || 'CLIENTE CONTADO'}</div>
          <div><b>RNC / CÉDULA CLIENTE:</b> ${v.rnc_cliente || 'N/A'}</div>
          <div><b>FORMA DE PAGO:</b> ${v.tipo_pago}</div>
        </div>
        <div style="text-align: right;">
          <div><b>NÚMERO DE TRANSACCIÓN:</b> #${v.id}</div>
          <div><b>FECHA EMISIÓN:</b> ${fechaStr}</div>
          <div><b>ORIGEN DESPACHO:</b> ${v.almacen_nombre || 'Almacén Central'}</div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background: #3c096c; color: #fff;">
            <th style="padding: 8px; text-align: left;">CANT</th>
            <th style="padding: 8px; text-align: left;">DESCRIPCIÓN DE MERCANCÍA</th>
            <th style="padding: 8px; text-align: right;">PRECIO UNIT.</th>
            <th style="padding: 8px; text-align: right;">ITBIS (18%)</th>
            <th style="padding: 8px; text-align: right;">TOTAL DOP</th>
          </tr>
        </thead>
        <tbody>
          ${(v.detalles || []).map((d, i) => `
            <tr style="background: ${i % 2 === 0 ? '#fff' : '#faf8fc'}; border-bottom: 1px solid #e8e3f0;">
              <td style="padding: 8px;"><b>${d.cantidad}</b></td>
              <td style="padding: 8px;">${d.producto_nombre}</td>
              <td style="padding: 8px; text-align: right;">RD$ ${d.precio_unitario.toFixed(2)}</td>
              <td style="padding: 8px; text-align: right;">RD$ ${d.itbis_monto.toFixed(2)}</td>
              <td style="padding: 8px; text-align: right;"><b>RD$ ${d.total.toFixed(2)}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #000; padding-top: 12px;">
        <div style="font-size: 11px; color: #6b6578;">
          ${barcodeSVG}
          <div style="margin-top: 4px;">Original: Cliente | Copia: Contabilidad & Archivo</div>
          <div>${empMsg}</div>
        </div>
        <div style="width: 260px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>SUBTOTAL:</span><span>RD$ ${v.subtotal.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>ITBIS (18%):</span><span>RD$ ${v.itbis_total.toFixed(2)}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; border-top: 1px solid #000; padding-top: 4px; color: #3c096c;">
            <span>TOTAL GENERAL:</span><span>RD$ ${v.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  window.print();
}

// 10. EDICIÓN DE SECUENCIAS DGII POR EL USUARIO
function abrirModalEditarSecuencia(idSecuencia) {
 const sec = state.secuenciasNCF ? state.secuenciasNCF.find(s => s.id === idSecuencia) : null;
 if (!sec) return;

 document.getElementById('modal-secuencia-id').value = sec.id;
 document.getElementById('modal-secuencia-tipo-title').textContent = `${sec.tipo_ncf} - ${sec.descripcion}`;
 document.getElementById('secuencia-inicio').value = sec.secuencia_inicio;
 document.getElementById('secuencia-fin').value = sec.secuencia_fin;
 document.getElementById('secuencia-actual').value = sec.secuencia_actual;
 document.getElementById('secuencia-vencimiento').value = sec.fecha_vencimiento;

 document.getElementById('modal-editar-secuencia-ncf').classList.add('active');
}

async function guardarEdicionSecuenciaNCF() {
 const id = parseInt(document.getElementById('modal-secuencia-id').value, 10);
 const secuenciaActual = parseInt(document.getElementById('secuencia-actual').value, 10);
 const secuenciaInicio = parseInt(document.getElementById('secuencia-inicio').value, 10);
 const secuenciaFin = parseInt(document.getElementById('secuencia-fin').value, 10);
 const fechaVencimiento = document.getElementById('secuencia-vencimiento').value;

 if (isNaN(secuenciaActual) || isNaN(secuenciaInicio) || isNaN(secuenciaFin) || !fechaVencimiento) {
 alert('Ingresa valores numéricos válidos y una fecha de vencimiento autorizada por la DGII.');
 return;
 }

 const res = await apiCall('actualizar_secuencia_ncf', {
 id,
 secuenciaActual,
 secuenciaInicio,
 secuenciaFin,
 fechaVencimiento
 });

 if (res.status === 'ok') {
 alert(' Secuencia NCF actualizada exitosamente!');
 cerrarModales();
 renderFacturasDGIITable();
} else {
 alert(` Error al actualizar secuencia NCF: ${res.message}`);
 }
}

/// 11. MÓDULO DE REPORTES FISCALES & CONTABILIDAD (607, 606, ESTADO IT-1, P&L Y CUADRES)
function setFiltroPeriodo(tipo) {
  const hoy = new Date();
  const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  let fechaDesde = '';
  let fechaHasta = formatYMD(hoy);

  document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
  const btnActivo = document.getElementById(`btn-periodo-${tipo}`);
  if (btnActivo) btnActivo.classList.add('active');

  if (tipo === 'diario') {
    fechaDesde = formatYMD(hoy);
  } else if (tipo === 'semanal') {
    const d = new Date(hoy);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const lunes = new Date(d.setDate(diff));
    fechaDesde = formatYMD(lunes);
  } else if (tipo === 'mensual') {
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    fechaDesde = formatYMD(primerDiaMes);
  } else if (tipo === 'trimestral') {
    const d = new Date(hoy);
    d.setMonth(d.getMonth() - 3);
    fechaDesde = formatYMD(d);
  } else if (tipo === 'semestral') {
    const d = new Date(hoy);
    d.setMonth(d.getMonth() - 6);
    fechaDesde = formatYMD(d);
  } else if (tipo === 'anual') {
    const primerDiaAnio = new Date(hoy.getFullYear(), 0, 1);
    fechaDesde = formatYMD(primerDiaAnio);
  } else if (tipo === 'custom') {
    renderReportesContabilidad();
    return;
  }

  const elDesde = document.getElementById('reporte-fecha-desde');
  const elHasta = document.getElementById('reporte-fecha-hasta');
  if (elDesde) elDesde.value = fechaDesde;
  if (elHasta) elHasta.value = fechaHasta;

  renderReportesContabilidad();
}

async function renderReportesContabilidad() {
  await loadVehiculosData();
  const fechaInicio = document.getElementById('reporte-fecha-desde') ? document.getElementById('reporte-fecha-desde').value : null;
  const fechaFin = document.getElementById('reporte-fecha-hasta') ? document.getElementById('reporte-fecha-hasta').value : null;
  const idAlmacen = document.getElementById('reporte-almacen-select') ? parseInt(document.getElementById('reporte-almacen-select').value, 10) || null : null;

  // 1. Cargar Estado de Resultados (P&L Express)
  const res = await apiCall('get_estado_resultados', {
    fechaInicio,
    fechaFin,
    idAlmacen
  });

  if (res.status === 'ok' && res.data) {
    renderResumenFinanciero('resumen-financiero-reportes', res.data, { mostrarPeriodo: true, incluirItbis: true });
  }

  // 2. Cargar Reporte Consolidado de Cuadres Operativos
  const resCuadres = await apiCall('get_reporte_cuadres', {
    fechaInicio,
    fechaFin,
    idAlmacen
  });

  if (resCuadres.status === 'ok' && resCuadres.data) {
    const dataCuadres = resCuadres.data;
    state.ultimoReporteCuadres = dataCuadres;
    const r = dataCuadres.resumen || {};
    const lista = dataCuadres.cuadres || [];

    const lblRango = document.getElementById('lbl-periodo-cuadres-rango');
    if (lblRango) {
      lblRango.textContent = `Mostrando ${r.total_cuadres || 0} cuadre(s) registrado(s) desde ${fechaInicio || 'Inicio'} hasta ${fechaFin || 'Hoy'}.`;
    }

    const elCount = document.getElementById('rep-cuadres-total-count');
    const elEfectivo = document.getElementById('rep-cuadres-total-efectivo');
    const elCredito = document.getElementById('rep-cuadres-total-credito');
    const elTransf = document.getElementById('rep-cuadres-total-transferencia');
    if (elTransf) elTransf.textContent = fmtRD(r.ventas_transferencia_total || 0);
    const elEntregado = document.getElementById('rep-cuadres-total-entregado');
    const elDif = document.getElementById('rep-cuadres-total-diferencia');
    const boxDif = document.getElementById('box-rep-cuadres-diferencia');

    if (elCount) elCount.textContent = `${r.total_cuadres || 0}`;
    if (elEfectivo) elEfectivo.textContent = `RD$ ${(r.ventas_efectivo_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (elCredito) elCredito.textContent = `RD$ ${(r.ventas_credito_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (elEntregado) elEntregado.textContent = `RD$ ${(r.efectivo_entregado_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

    if (elDif) {
      const dif = r.diferencia_total || 0;
      elDif.textContent = `RD$ ${dif.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
      if (Math.abs(dif) < 0.01) {
        elDif.style.color = '#15803d';
        if (boxDif) boxDif.style.background = '#f0fdf4';
      } else if (dif > 0) {
        elDif.style.color = '#7b2cbf';
        if (boxDif) boxDif.style.background = '#f4edfa';
      } else {
        elDif.style.color = '#dc2626';
        if (boxDif) boxDif.style.background = '#fef2f2';
      }
    }

    const tbody = document.getElementById('tbl-reporte-cuadres');
    if (tbody) {
      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;">No se encontraron cuadres registrados en el rango de fechas seleccionado.</td></tr>`;
      } else {
        tbody.innerHTML = lista.map((c) => {
          const diff = c.diferencia || 0;
          let diffBadge = `<span class="badge badge-success">RD$ 0.00 (Exacto)</span>`;
          if (diff > 0) {
            diffBadge = `<span class="badge badge-info" style="background:#efe5f8; color:#5a189a;">+RD$ ${diff.toFixed(2)} (Sobrante)</span>`;
          } else if (diff < 0) {
            diffBadge = `<span class="badge badge-danger" style="background:#fee2e2; color:#b91c1c;">-RD$ ${Math.abs(diff).toFixed(2)} (Faltante)</span>`;
          }

          const fechaFormatted = c.fecha ? new Date(c.fecha).toLocaleString('es-DO') : 'N/A';

          return `
            <tr>
              <td><strong>${c.en_vivo ? 'En vivo' : '#' + c.id}</strong></td>
              <td><span class="badge ${c.tipo_cuadre.includes('POS') ? 'badge-primary' : 'badge-warning'}">${c.tipo_cuadre}</span></td>
              <td>${fechaFormatted}</td>
              <td>${c.origen_nombre || '-'}</td>
              <td><strong>${c.responsable_nombre || 'N/A'}</strong></td>
              <td>RD$ ${(c.ventas_efectivo || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
              <td>RD$ ${(c.ventas_transferencia || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
              <td>RD$ ${(c.ventas_credito || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
              <td>RD$ ${(c.efectivo_esperado || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
              <td><strong>RD$ ${(c.efectivo_entregado || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
              <td>${diffBadge}</td>
              <td><small>${c.notas || c.estado || 'Cerrado'}</small></td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // 3. Cargar Top Productos Estrella
  const topProdRes = await apiCall('get_top_productos', { limit: 10 });
  if (topProdRes.status === 'ok') {
    const tbodyTop = document.getElementById('tbl-top-productos');
    const prods = topProdRes.data || [];
    if (!prods || prods.length === 0) {
      tbodyTop.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay ventas registradas aún.</td></tr>`;
    } else {
      tbodyTop.innerHTML = prods.map(p => `
        <tr>
          <td><strong>${p.nombre}</strong> (<code>${p.codigo_interno}</code>)</td>
          <td>${p.total_unidades_vendidas} unid</td>
          <td>RD$ ${p.total_monto_generado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td><strong style="color:#15803d;">RD$ ${p.ganancia_estimada.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        </tr>
      `).join('');
    }
  }

  // 4. Cargar Ranking Clientes Top
  const rankRes = await apiCall('get_ranking_clientes', { limit: 10 });
  if (rankRes.status === 'ok') {
    const tbodyRank = document.getElementById('tbl-ranking-clientes');
    const clientes = rankRes.data || [];
    if (!clientes || clientes.length === 0) {
      tbodyRank.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay historial de compras de clientes aún.</td></tr>`;
    } else {
      tbodyRank.innerHTML = clientes.map(c => `
        <tr>
          <td><strong>${c.nombre}</strong></td>
          <td>${c.rnc_cedula}</td>
          <td>${c.total_compras} ventas</td>
          <td><strong style="color:var(--color-primary);">RD$ ${c.monto_total_comprado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        </tr>
      `).join('');
    }
  }
}

function exportarCuadresPDF() {
  if (!state.ultimoReporteCuadres || !state.ultimoReporteCuadres.cuadres || state.ultimoReporteCuadres.cuadres.length === 0) {
    alert('No hay datos de cuadres para exportar a PDF en el período seleccionado.');
    return;
  }

  const empNombre = state.configEmpresa ? state.configEmpresa.nombre_empresa : 'DISTRIBUIDORA ROJAS PERALTA';
  const empRnc = state.configEmpresa ? state.configEmpresa.rnc : '1-01-82934-1';
  const empTel = state.configEmpresa ? state.configEmpresa.telefono : '(809) 555-0199';
  const empDir = state.configEmpresa ? state.configEmpresa.direccion : 'Santo Domingo, Rep. Dom.';

  const r = state.ultimoReporteCuadres.resumen || {};
  const lista = state.ultimoReporteCuadres.cuadres || [];
  const fechaGeneracion = new Date().toLocaleString('es-DO');

  const fechaDesde = document.getElementById('reporte-fecha-desde') ? document.getElementById('reporte-fecha-desde').value : 'Inicio';
  const fechaHasta = document.getElementById('reporte-fecha-hasta') ? document.getElementById('reporte-fecha-hasta').value : 'Hoy';

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1b1226; max-width: 950px; margin: 0 auto;">
      <!-- MEMBRETE EMPRESARIAL -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7b2cbf; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h1 style="margin: 0; font-size: 22px; color: #7b2cbf; font-weight: 800; text-transform: uppercase;">${empNombre}</h1>
          <div style="font-size: 12px; font-weight: 700; color: #51475f; margin-top: 2px;">RNC: ${empRnc} | Tel: ${empTel}</div>
          <div style="font-size: 11px; color: #6b6578;">${empDir}</div>
        </div>
        <div style="text-align: right;">
          <h3 style="margin: 0; font-size: 16px; color: #1b1226; text-transform: uppercase;">REPORTE OFICIAL DE CUADRES</h3>
          <div style="font-size: 12px; color: #51475f; font-weight: 700; margin-top: 4px;">Período: ${fechaDesde} al ${fechaHasta}</div>
          <div style="font-size: 10px; color: #9a92ab; margin-top: 2px;">Fecha Impresión: ${fechaGeneracion}</div>
        </div>
      </div>

      <!-- RESUMEN KPI EN TABLA EJECUTIVA -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #faf8fc; border: 1px solid #d9d3e3;">
        <tr style="background: #7b2cbf; color: #ffffff; text-transform: uppercase; font-size: 11px; font-weight: 800;">
          <th style="padding: 8px; text-align: center;">Total Cuadres</th>
          <th style="padding: 8px; text-align: right;">Ventas Efectivo</th>
          <th style="padding: 8px; text-align: right;">Transferencias</th>
          <th style="padding: 8px; text-align: right;">Ventas Crédito</th>
          <th style="padding: 8px; text-align: right;">Efectivo Entregado</th>
          <th style="padding: 8px; text-align: right;">Diferencia Caja</th>
        </tr>
        <tr style="font-size: 13px; font-weight: 800;">
          <td style="padding: 10px; text-align: center;">${r.total_cuadres || 0}</td>
          <td style="padding: 10px; text-align: right; color: #15803d;">RD$ ${(r.ventas_efectivo_total || 0).toFixed(2)}</td>
          <td style="padding: 10px; text-align: right; color: #5a189a;">RD$ ${(r.ventas_transferencia_total || 0).toFixed(2)}</td>
          <td style="padding: 10px; text-align: right; color: #d97706;">RD$ ${(r.ventas_credito_total || 0).toFixed(2)}</td>
          <td style="padding: 10px; text-align: right; color: #7b2cbf;">RD$ ${(r.efectivo_entregado_total || 0).toFixed(2)}</td>
          <td style="padding: 10px; text-align: right; color: ${(r.diferencia_total || 0) < 0 ? '#dc2626' : '#15803d'};">RD$ ${(r.diferencia_total || 0).toFixed(2)}</td>
        </tr>
      </table>

      <!-- DETALLE TABULAR DE CUADRES -->
      <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #3d3550; text-transform: uppercase;">Desglose Detallado de Cierres de Caja y Rutas</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #1b1226; color: #ffffff; text-align: left;">
            <th style="padding: 6px; border: 1px solid #3d3550;">#</th>
            <th style="padding: 6px; border: 1px solid #3d3550;">Tipo</th>
            <th style="padding: 6px; border: 1px solid #3d3550;">Fecha</th>
            <th style="padding: 6px; border: 1px solid #3d3550;">Origen</th>
            <th style="padding: 6px; border: 1px solid #3d3550;">Responsable</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Efectivo</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Transf.</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Crédito</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Entregado</th>
            <th style="padding: 6px; border: 1px solid #3d3550; text-align: right;">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map((c, i) => `
            <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#faf8fc'}; border-bottom: 1px solid #e8e3f0;">
              <td style="padding: 6px; border: 1px solid #d9d3e3;"><b>#${c.id}</b></td>
              <td style="padding: 6px; border: 1px solid #d9d3e3;">${c.tipo_cuadre}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3;">${c.fecha ? new Date(c.fecha).toLocaleDateString('es-DO') : ''}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3;">${c.origen_nombre || ''}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3;">${c.responsable_nombre || ''}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3; text-align: right;">RD$ ${(c.ventas_efectivo || 0).toFixed(2)}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3; text-align: right;">RD$ ${(c.ventas_transferencia || 0).toFixed(2)}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3; text-align: right;">RD$ ${(c.ventas_credito || 0).toFixed(2)}</td>
              <td style="padding: 6px; border: 1px solid #d9d3e3; text-align: right;"><b>RD$ ${(c.efectivo_entregado || 0).toFixed(2)}</b></td>
              <td style="padding: 6px; border: 1px solid #d9d3e3; text-align: right; color: ${(c.diferencia || 0) < 0 ? '#dc2626' : (c.diferencia || 0) > 0 ? '#7b2cbf' : '#15803d'}; font-weight: 700;">
                RD$ ${(c.diferencia || 0).toFixed(2)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- FIRMAS Y AUTORIZACIÓN -->
      <div style="margin-top: 40px; display: flex; justify-content: space-between; padding: 0 40px;">
        <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 6px; font-size: 11px; font-weight: 700;">
          Firma Administrador / Auditor
        </div>
        <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 6px; font-size: 11px; font-weight: 700;">
          Firma Cajero / Chofer Entregante
        </div>
      </div>
    </div>
  `;

  window.print();
}

function exportarCuadresExcel() {
  if (!state.ultimoReporteCuadres || !state.ultimoReporteCuadres.cuadres || state.ultimoReporteCuadres.cuadres.length === 0) {
    alert('No hay datos de cuadres para exportar a Excel en el período seleccionado.');
    return;
  }

  const empNombre = state.configEmpresa ? state.configEmpresa.nombre_empresa : 'DISTRIBUIDORA ROJAS PERALTA';
  const fechaDesde = document.getElementById('reporte-fecha-desde') ? document.getElementById('reporte-fecha-desde').value : 'Inicio';
  const fechaHasta = document.getElementById('reporte-fecha-hasta') ? document.getElementById('reporte-fecha-hasta').value : 'Hoy';

  const r = state.ultimoReporteCuadres.resumen || {};
  const lista = state.ultimoReporteCuadres.cuadres || [];

  const headers = ['ID Cuadre', 'Tipo Cuadre', 'Fecha / Hora', 'Origen / Almacen', 'Responsable', 'Ventas Efectivo (DOP)', 'Transferencias y Cheques (DOP)', 'Ventas Credito (DOP)', 'Efectivo Esperado (DOP)', 'Efectivo Entregado (DOP)', 'Diferencia Caja (DOP)', 'Estado / Notas'];

  const rows = lista.map(c => [
    `#${c.id}`,
    `"${c.tipo_cuadre}"`,
    `"${c.fecha ? new Date(c.fecha).toLocaleString('es-DO') : ''}"`,
    `"${c.origen_nombre || ''}"`,
    `"${c.responsable_nombre || ''}"`,
    (c.ventas_efectivo || 0).toFixed(2),
    (c.ventas_transferencia || 0).toFixed(2),
    (c.ventas_credito || 0).toFixed(2),
    (c.efectivo_esperado || 0).toFixed(2),
    (c.efectivo_entregado || 0).toFixed(2),
    (c.diferencia || 0).toFixed(2),
    `"${(c.notas || c.estado || 'Cerrado').replace(/"/g, '""')}"`
  ].join(','));

  const totalsRow = [
    '"TOTAL ACUMULADO"',
    '""',
    '""',
    '""',
    '""',
    (r.ventas_efectivo_total || 0).toFixed(2),
    (r.ventas_transferencia_total || 0).toFixed(2),
    (r.ventas_credito_total || 0).toFixed(2),
    (r.efectivo_esperado_total || 0).toFixed(2),
    (r.efectivo_entregado_total || 0).toFixed(2),
    (r.diferencia_total || 0).toFixed(2),
    `"Total Cuadres: ${r.total_cuadres || 0}"`
  ].join(',');

  const csvMeta = [
    `"${empNombre}"`,
    `"REPORTE CONSOLIDADO DE CUADRES OPERATIVOS (${fechaDesde} al ${fechaHasta})"`,
    '""'
  ];

  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [...csvMeta, headers.join(','), ...rows, '""', totalsRow].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Reporte_Cuadres_${fechaDesde}_al_${fechaHasta}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportarReporteContabilidadExcel() {
  exportarCuadresExcel();
}

// 12. ENTRADAS DE MERCANCÍA / COMPRAS A SUPLIDORES
async function abrirModalEntradaCompra() {
  state.compraEditandoId = null;
  state.compraOriginal = null;
  state.compraCart = [];
  const provRes = await apiCall('get_proveedores');
  const provSelect = document.getElementById('modal-compra-proveedor-select');
  if (provRes.status === 'ok') {
    state.proveedores = provRes.data || [];
    if (state.proveedores.length === 0) {
      provSelect.innerHTML = `<option value="">No hay proveedores (Haz clic en + Nuevo)</option>`;
    } else {
      provSelect.innerHTML = state.proveedores.map(p => `
        <option value="${p.id}" data-rnc="${p.rnc_cedula}" data-nombre="${p.nombre}">${p.nombre} (RNC: ${p.rnc_cedula})</option>
      `).join('');
    }
  }

  // Asegurar que los productos están cargados en el estado
  if (!state.productos || state.productos.length === 0) {
    await loadProductosData();
  }

  // Limpiar buscador y poblar opciones
  const searchInput = document.getElementById('modal-compra-prod-search');
  if (searchInput) searchInput.value = '';

  filtrarProductosCompra('');

  document.getElementById('modal-compra-ncf').value = '';
  document.getElementById('modal-compra-id').value = '';
  document.getElementById('modal-compra-fecha').value = fechaParaInput();
  document.getElementById('modal-compra-tipo-pago').value = 'Contado';
  document.getElementById('modal-compra-notas').value = '';
  document.getElementById('modal-compra-titulo').textContent = 'Registrar Entrada de Mercancía / Compra a Suplidor';
  document.getElementById('btn-confirmar-compra').textContent = 'Confirmar Entrada & Sumar Inventario Central';
  document.getElementById('modal-compra-cant').value = '1';
  renderCompraCartUI();
  document.getElementById('modal-entrada-compra').classList.add('active');
}

async function abrirModalEditarCompra(idCompra) {
  const modalHistorial = document.getElementById('modal-historial-compras-proveedor');
  if (modalHistorial) modalHistorial.classList.remove('active');
  await abrirModalEntradaCompra();
  const res = await apiCall('get_detalle_compra', { idCompra });
  if (res.status !== 'ok' || !res.data) {
    alert(`No se pudo abrir la compra para editar: ${res.message || 'Compra no encontrada.'}`);
    return;
  }
  const compra = res.data;
  state.compraOriginal = compra;
  state.compraEditandoId = Number(compra.id);
  document.getElementById('modal-compra-id').value = compra.id;
  document.getElementById('modal-compra-ncf').value = compra.ncf_compra || '';
  document.getElementById('modal-compra-fecha').value = fechaParaInput(compra.fecha_compra);
  document.getElementById('modal-compra-tipo-pago').value = compra.tipo_pago || 'Contado';
  document.getElementById('modal-compra-notas').value = compra.notas || '';
  const proveedorSelect = document.getElementById('modal-compra-proveedor-select');
  if (compra.id_proveedor && ![...proveedorSelect.options].some(o => Number(o.value) === Number(compra.id_proveedor))) {
    proveedorSelect.add(new Option(compra.nombre_proveedor || `Proveedor #${compra.id_proveedor}`, compra.id_proveedor));
  }
  proveedorSelect.value = compra.id_proveedor ? String(compra.id_proveedor) : '';
  state.compraCart = (compra.detalles || []).map(d => ({
    id_producto: d.id_producto,
    producto_nombre: d.producto_nombre,
    cantidad: d.cantidad,
    precio_compra: d.precio_compra,
    itbis_porcentaje: d.itbis_porcentaje || 0,
    subtotal: d.cantidad * d.precio_compra,
    itbis_monto: d.itbis_monto || 0,
    total: d.total
  }));
  document.getElementById('modal-compra-titulo').textContent = `Editar Compra #${compra.id}`;
  document.getElementById('btn-confirmar-compra').textContent = 'Guardar Cambios de Compra';
  renderCompraCartUI();
}

function filtrarProductosCompra(query) {
  const normQuery = normalizeText(query);
  const prodSelect = document.getElementById('modal-compra-prod-select');
  if (!prodSelect) return;

  const filteredProds = (state.productos || []).filter(p => {
    if (!normQuery) return true;
    const codInt = normalizeText(p.codigo_interno);
    const codBar = normalizeText(p.codigo_barras);
    const nom = normalizeText(p.nombre);
    const idStr = String(p.id);
    const catNom = normalizeText(p.categoria_nombre);
    return idStr.includes(normQuery) || codInt.includes(normQuery) || codBar.includes(normQuery) || nom.includes(normQuery) || catNom.includes(normQuery);
  });

  if (filteredProds.length === 0) {
    prodSelect.innerHTML = `<option value="">No se encontraron productos</option>`;
    document.getElementById('modal-compra-costo').value = '';
  } else {
    prodSelect.innerHTML = filteredProds.map(p => `
      <option value="${p.id}">ID: ${p.id} | ${p.codigo_interno ? '[' + p.codigo_interno + '] ' : ''}${p.nombre} (Costo Actual: RD$ ${p.precio_compra.toFixed(2)})</option>
    `).join('');
    onProductoCompraChange();
  }
}

function onProductoCompraChange() {
  const prodSelect = document.getElementById('modal-compra-prod-select');
  if (!prodSelect || !prodSelect.value) return;

  const idProducto = parseInt(prodSelect.value, 10);
  const producto = (state.productos || []).find(p => p.id === idProducto);
  const costoInput = document.getElementById('modal-compra-costo');
  if (producto && costoInput) {
    costoInput.value = producto.precio_compra.toFixed(2);
  }
}

function agregarItemACompra() {
  const prodSelect = document.getElementById('modal-compra-prod-select');
  if (!prodSelect || !prodSelect.value) {
    alert('Selecciona un producto válido.');
    return;
  }

  const idProducto = parseInt(prodSelect.value, 10);
  const producto = (state.productos || []).find(p => p.id === idProducto);
  if (!producto) {
    alert('Producto no encontrado.');
    return;
  }

  const cantidad = parseInt(document.getElementById('modal-compra-cant').value, 10);
  const precioCompra = parseFloat(document.getElementById('modal-compra-costo').value);

  if (isNaN(cantidad) || cantidad <= 0) {
    alert('Ingresa una cantidad comprada válida mayor a 0.');
    return;
  }

  if (isNaN(precioCompra) || precioCompra < 0) {
    alert('Ingresa un precio de costo válido.');
    return;
  }

  const subtotal = cantidad * precioCompra;

  // Si ya existe el producto en el carrito de compras, actualizamos la cantidad y costo
  const itemExist = state.compraCart.find(i => i.id_producto === idProducto);
  if (itemExist) {
    itemExist.cantidad += cantidad;
    itemExist.precio_compra = precioCompra;
    itemExist.subtotal = itemExist.cantidad * precioCompra;
    itemExist.total = itemExist.subtotal;
  } else {
    state.compraCart.push({
      id_producto: idProducto,
      producto_nombre: producto.nombre,
      cantidad,
      precio_compra: precioCompra,
      itbis_porcentaje: 0,
      subtotal,
      itbis_monto: 0,
      total: subtotal
    });
  }

  renderCompraCartUI();
}

function eliminarItemCompra(idx) {
  state.compraCart.splice(idx, 1);
  renderCompraCartUI();
}

function renderCompraCartUI() {
  const tbody = document.getElementById('tbl-compra-items');
  let grandTotal = 0;

  if (!state.compraCart || state.compraCart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No has agregado productos a la compra aún.</td></tr>`;
    document.getElementById('modal-compra-total').textContent = `RD$ 0.00`;
    return;
  }

  tbody.innerHTML = state.compraCart.map((item, idx) => {
    grandTotal += item.total;
    return `
      <tr>
        <td><strong>${item.producto_nombre}</strong></td>
        <td>${item.cantidad}</td>
        <td>RD$ ${item.precio_compra.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td>RD$ ${item.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center;"><button class="btn btn-danger" style="padding:2px 8px; font-size:11px;" onclick="eliminarItemCompra(${idx})">&times;</button></td>
      </tr>
    `;
  }).join('');

  document.getElementById('modal-compra-total').textContent = `RD$ ${grandTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

async function confirmarEntradaCompra() {
 if (!state.compraCart || state.compraCart.length === 0) {
 alert('Agrega al menos un producto a la compra.');
 return;
 }

 const idCompra = Number(document.getElementById('modal-compra-id').value) || null;
 const provSelect = document.getElementById('modal-compra-proveedor-select');
 const idProveedor = parseInt(provSelect.value, 10) || null;
 const selectedOpt = provSelect.options[provSelect.selectedIndex];
 const rncProveedor = selectedOpt?.dataset.rnc || (idCompra ? state.compraOriginal?.rnc_proveedor : '') || '';
 const nombreProveedor = selectedOpt?.dataset.nombre || (idCompra ? state.compraOriginal?.nombre_proveedor : '') || '';
 const ncfCompra = document.getElementById('modal-compra-ncf').value.trim();
 const datosCompra = {
 idProveedor,
 rncProveedor,
 nombreProveedor,
 ncfCompra,
 fechaCompra: document.getElementById('modal-compra-fecha').value,
 tipoPago: document.getElementById('modal-compra-tipo-pago').value,
 notas: document.getElementById('modal-compra-notas').value.trim(),
 idAlmacen: 1,
 items: state.compraCart
 };
 const action = idCompra ? 'actualizar_entrada_compra' : 'registrar_entrada_compra';
 const res = await apiCall(action, idCompra ? { ...datosCompra, idCompra } : datosCompra);

 if (res.status === 'ok') {
 const historialProveedor = state.compraProveedorHistoryId;
 alert(`${idCompra ? 'Compra actualizada' : 'Entrada de mercancía registrada'} exitosamente.\nTotal Compra: RD$ ${res.data.total.toFixed(2)}\n\nEl inventario y el reporte contable fueron actualizados.`);
 cerrarModales();
  state.compraOriginal = null;
 await loadProductosData();
 await renderInventarioCompleto();
 await loadDashboardData();
 await loadProveedoresData();
 if (idCompra && historialProveedor) await verHistorialComprasProveedor(historialProveedor);
 } else {
 alert(` Error al registrar entrada de mercancía: ${res.message}`);
 }
}

// 12.1 MÓDULO PROFESIONAL DE PROVEEDORES & SUPLIDORES
async function loadProveedoresData() {
  const res = await apiCall('get_proveedores');
  if (res.status === 'ok') {
    state.proveedores = res.data || [];

    const totalSuplidores = state.proveedores.length;
    let totalInvertido = 0;
    let principalNombre = 'Ninguno';
    let maxInversion = 0;

    state.proveedores.forEach(p => {
      const monto = p.total_monto_comprado || 0;
      totalInvertido += monto;
      if (monto > maxInversion) {
        maxInversion = monto;
        principalNombre = p.nombre;
      }
    });

    const kpiTotal = document.getElementById('kpi-suplidores-total');
    const kpiMonto = document.getElementById('kpi-suplidores-compras-monto');
    const kpiPrincipal = document.getElementById('kpi-suplidores-principal');

    if (kpiTotal) kpiTotal.textContent = `${totalSuplidores}`;
    if (kpiMonto) kpiMonto.textContent = `RD$ ${totalInvertido.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (kpiPrincipal) kpiPrincipal.textContent = principalNombre;

    renderProveedoresTable(state.proveedores);
  }
}

function renderProveedoresTable(lista) {
  const tbody = document.getElementById('tbl-proveedores');
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No hay proveedores o suplidores registrados aún.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr>
      <td><strong>#${p.id}</strong></td>
      <td><code>${p.rnc_cedula || 'N/A'}</code></td>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.telefono || 'N/A'}</td>
      <td><small>${p.email || 'N/A'}</small></td>
      <td><small>${p.direccion || 'N/A'}</small></td>
      <td><span class="badge badge-info">${p.total_compras || 0} compras</span></td>
      <td><strong style="color:var(--color-success);">RD$ ${(p.total_monto_comprado || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="abrirModalProveedor(${p.id})">Editar</button>
          <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="verHistorialComprasProveedor(${p.id})">Historial</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="eliminarProveedor(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filtrarTablaProveedoresView() {
  const input = document.getElementById('suppliers-search-input');
  if (!input) return;
  const q = input.value.toLowerCase().trim();

  if (!q) {
    renderProveedoresTable(state.proveedores);
    return;
  }

  const filtrados = (state.proveedores || []).filter(p => 
    p.nombre.toLowerCase().includes(q) ||
    (p.rnc_cedula && p.rnc_cedula.toLowerCase().includes(q)) ||
    (p.telefono && p.telefono.toLowerCase().includes(q)) ||
    (p.email && p.email.toLowerCase().includes(q))
  );

  renderProveedoresTable(filtrados);
}

function abrirModalProveedor(id = null) {
  const modalTitulo = document.getElementById('modal-proveedor-titulo');
  const inputId = document.getElementById('prov-id');
  const inputRnc = document.getElementById('prov-rnc');
  const inputNombre = document.getElementById('prov-nombre');
  const inputTel = document.getElementById('prov-telefono');
  const inputEmail = document.getElementById('prov-email');
  const inputDir = document.getElementById('prov-direccion');

  if (id) {
    const p = (state.proveedores || []).find(item => item.id === id);
    if (p) {
      if (modalTitulo) modalTitulo.textContent = `Editar Suplidor - ${p.nombre}`;
      if (inputId) inputId.value = p.id;
      if (inputRnc) inputRnc.value = p.rnc_cedula || '';
      if (inputNombre) inputNombre.value = p.nombre || '';
      if (inputTel) inputTel.value = p.telefono || '';
      if (inputEmail) inputEmail.value = p.email || '';
      if (inputDir) inputDir.value = p.direccion || '';
    }
  } else {
    if (modalTitulo) modalTitulo.textContent = `+ Registrar Nuevo Suplidor / Proveedor`;
    if (inputId) inputId.value = '';
    if (inputRnc) inputRnc.value = '';
    if (inputNombre) inputNombre.value = '';
    if (inputTel) inputTel.value = '';
    if (inputEmail) inputEmail.value = '';
    if (inputDir) inputDir.value = '';
  }

  document.getElementById('modal-nuevo-proveedor').classList.add('active');
}

function abrirModalNuevoProveedor() {
  abrirModalProveedor(null);
}

function cerrarModalNuevoProveedor() {
  document.getElementById('modal-nuevo-proveedor').classList.remove('active');
}

async function guardarNuevoProveedor() {
  const id = document.getElementById('prov-id') ? parseInt(document.getElementById('prov-id').value, 10) || null : null;
  const rncCedula = document.getElementById('prov-rnc').value.trim();
  const nombre = document.getElementById('prov-nombre').value.trim();
  const telefono = document.getElementById('prov-telefono').value.trim();
  const email = document.getElementById('prov-email') ? document.getElementById('prov-email').value.trim() : '';
  const direccion = document.getElementById('prov-direccion') ? document.getElementById('prov-direccion').value.trim() : '';

  if (!rncCedula || !nombre) {
    alert('Ingresa la Identificación/RNC y el Nombre del proveedor.');
    return;
  }

  let res;
  if (id) {
    res = await apiCall('actualizar_proveedor', { id, rncCedula, nombre, telefono, email, direccion });
  } else {
    res = await apiCall('registrar_proveedor', { rncCedula, nombre, telefono, email, direccion });
  }

  if (res.status === 'ok') {
    alert(id ? 'Suplidor actualizado exitosamente.' : 'Suplidor registrado con éxito.');
    cerrarModalNuevoProveedor();
    await loadProveedoresData();
    
    const provSelect = document.getElementById('modal-compra-proveedor-select');
    if (provSelect && state.proveedores) {
      provSelect.innerHTML = state.proveedores.map(p => `
        <option value="${p.id}" data-rnc="${p.rnc_cedula}" data-nombre="${p.nombre}">${p.nombre} (ID: ${p.rnc_cedula})</option>
      `).join('');
      if (res.data && res.data.proveedorId) {
        provSelect.value = res.data.proveedorId;
      }
    }
  } else {
    alert(`Error al guardar proveedor: ${res.message}`);
  }
}

async function eliminarProveedor(id, nombre) {
  if (!confirm(`¿Estás seguro de eliminar/desactivar al suplidor '${nombre}'?`)) return;

  const res = await apiCall('eliminar_proveedor', { idProveedor: id });
  if (res.status === 'ok') {
    alert(`Suplidor '${nombre}' desactivado con éxito.`);
    await loadProveedoresData();
  } else {
    alert(`Error al desactivar proveedor: ${res.message}`);
  }
}

async function verHistorialComprasProveedor(idProveedor) {
  state.compraProveedorHistoryId = idProveedor;
  const p = (state.proveedores || []).find(item => item.id === idProveedor);
  const tituloEl = document.getElementById('modal-historial-suplidor-titulo');
  if (tituloEl && p) {
    tituloEl.textContent = `Historial de Compras de Mercancía - ${p.nombre}`;
  }

  const tbody = document.getElementById('tbl-historial-suplidor-compras');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Cargando historial de compras...</td></tr>`;
  }

  document.getElementById('modal-historial-compras-proveedor').classList.add('active');

  const res = await apiCall('get_compras_proveedor', { idProveedor });
  if (res.status === 'ok' && tbody) {
    const compras = res.data || [];
    if (compras.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No hay historial de compras registradas para este suplidor aún.</td></tr>`;
    } else {
      tbody.innerHTML = compras.map(c => `
        <tr>
          <td><b>#${c.id}</b></td>
          <td>${c.fecha_compra ? new Date(c.fecha_compra).toLocaleString('es-DO') : ''}</td>
          <td>${c.almacen_nombre || 'Almacén Central'}</td>
          <td><code>${c.ncf_compra || 'N/A'}</code></td>
          <td><span class="badge badge-info">${c.tipo_pago || 'Contado'}</span></td>
          <td><strong style="color:var(--color-success);">RD$ ${(c.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
          <td><button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="abrirModalEditarCompra(${c.id})">Editar</button></td>
        </tr>
      `).join('');
    }
  }
}

// 13. MÓDULO DE CIERRE Y CUADRE DIARIO DE CAJA POS
async function abrirModalCierreCajaPOS() {
  const res = await apiCall('get_resumen_caja_pos');
  if (res.status === 'ok' && res.data) {
    const d = res.data;
    const efEl = document.getElementById('cierre-ventas-efectivo');
    const trEl = document.getElementById('cierre-ventas-transferencia');
    const chEl = document.getElementById('cierre-ventas-cheque');
    const crEl = document.getElementById('cierre-ventas-credito');
    const gasEl = document.getElementById('cierre-gastos-hoy');
    const espEl = document.getElementById('cierre-monto-esperado');

    if (efEl) efEl.textContent = `RD$ ${(d.total_contado || d.total_ventas_efectivo || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (trEl) trEl.textContent = `RD$ ${(d.total_transferencia || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (chEl) chEl.textContent = `RD$ ${(d.total_cheque || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (crEl) crEl.textContent = `RD$ ${(d.total_credito || d.total_ventas_credito || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (gasEl) gasEl.textContent = `RD$ ${(d.total_gastos || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    if (espEl) espEl.textContent = `RD$ ${(d.monto_esperado_efectivo || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

    document.getElementById('cierre-efectivo-fisico').value = '';
    document.getElementById('cierre-notas').value = '';
    
    calcularDiferenciaCierreCaja();
    document.getElementById('modal-cierre-caja-pos').classList.add('active');
  }
}

function calcularDiferenciaCierreCaja() {
 const esperadoText = document.getElementById('cierre-monto-esperado').textContent.replace('RD$', '').replace(/,/g, '').trim();
 const esperado = parseFloat(esperadoText) || 0;
 const fisico = parseFloat(document.getElementById('cierre-efectivo-fisico').value) || 0;
 const diff = fisico - esperado;

 const badge = document.getElementById('cierre-diferencia-badge');
 if (diff === 0) {
 badge.textContent = `Cuadre Exacto (RD$ 0.00)`;
 badge.style.color = '#15803d';
 } else if (diff < 0) {
 badge.textContent = `Faltante de RD$ ${Math.abs(diff).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
 badge.style.color = '#dc2626';
 } else {
 badge.textContent = `Sobrante de RD$ ${diff.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
 badge.style.color = '#5a189a';
 }
}

async function guardarCierreCajaPOS() {
 const efectivoFisico = parseFloat(document.getElementById('cierre-efectivo-fisico').value);
 if (isNaN(efectivoFisico)) {
 alert('Ingresa el monto en efectivo físico contado en la gaveta de caja.');
 return;
 }

 const notas = document.getElementById('cierre-notas').value.trim();
 const res = await apiCall('registrar_cierre_caja_pos', { efectivoFisico, notas });

 if (res.status === 'ok') {
 alert(` Cierre diario de caja POS registrado exitosamente!\n\nEsperado: RD$ ${res.data.montoEsperado.toFixed(2)}\nFísico: RD$ ${res.data.efectivoFisico.toFixed(2)}\nDiferencia: RD$ ${res.data.diferencia.toFixed(2)}`);
 cerrarModales();
 } else {
 alert(` Error al registrar cierre de caja: ${res.message}`);
 }
}

// 14. TRAZABILIDAD 360° KARDEX DE PRODUCTO
async function abrirModalKardex(idProducto) {
 const res = await apiCall('get_kardex_producto', { idProducto });
 if (res.status === 'ok' && res.data) {
 const { producto, movimientos } = res.data;
 document.getElementById('modal-kardex-titulo').textContent = ` Kardex 360°: ${producto.nombre} (${producto.codigo_interno})`;
 
 document.getElementById('kardex-resumen-producto').innerHTML = `
 <div style="display: flex; justify-content: space-between; align-items: center;">
 <div><b>Código Barras:</b> ${producto.codigo_barras || 'N/A'} | <b>Categoría:</b> ${producto.categoria}</div>
 <div><b>Precio Compra:</b> RD$ ${producto.precio_compra.toFixed(2)} | <b>Precio Detalle:</b> RD$ ${producto.precio_detalle.toFixed(2)}</div>
 <div><span class="badge" style="background:#dcfce7; color:#15803d; font-size:14px; font-weight:800;">Stock Total: ${producto.stock_total || 0} ${producto.unidad_medida}</span></div>
 </div>
 `;

 const tbody = document.getElementById('tbl-kardex-movimientos');
 if (!movimientos || movimientos.length === 0) {
 tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No hay movimientos de auditoría Kardex registrados aún para este producto.</td></tr>`;
 } else {
 tbody.innerHTML = movimientos.map(m => `
 <tr>
 <td>${m.fecha}</td>
 <td><span class="badge" style="background:#f1edf6; color:#1b1226; font-weight:700;">${m.tipo_movimiento}</span></td>
 <td>${m.almacen_nombre || 'Almacén Central'}</td>
 <td><strong>${m.cantidad}</strong></td>
 <td>${m.stock_anterior}</td>
 <td><strong style="color:var(--color-primary);">${m.stock_nuevo}</strong></td>
 <td>${m.referencia || 'N/A'}</td>
 </tr>
 `).join('');
 }

 document.getElementById('modal-kardex-producto').classList.add('active');
 }
}

async function descargarCamionACentral(idCamion) {
 const camionNombre = getVehiculoNombre(idCamion);
 if (!confirm(`¿Confirmas descargar todo el inventario restante del ${camionNombre} y retornarlo al Almacén Central?`)) {
 return;
 }

 const res = await apiCall('descargar_inventario_camion', { idCamion });
 if (res.status === 'ok') {
 alert(` Inventario del ${camionNombre} descargado exitosamente y devuelto al Almacén Central!`);
 renderCamiones();
 loadProductosData();
 } else {
 alert(` Error al descargar inventario del camión: ${res.message}`);
 }
}

// 10. CONFIGURACIÓN Y PERFIL FISCAL DE LA EMPRESA
async function loadConfiguracionEmpresa() {
  const res = await apiCall('get_configuracion_empresa');
  if (res.status === 'ok' && res.data) {
    state.configEmpresa = res.data;

    // Sincronizar campos de formulario si existen
    const elNom = document.getElementById('cfg-nombre');
    const elRnc = document.getElementById('cfg-rnc');
    const elTel = document.getElementById('cfg-telefono');
    const elEmail = document.getElementById('cfg-email');
    const elCapitalInicial = document.getElementById('cfg-capital-inicial');
    const elDir = document.getElementById('cfg-direccion');
    const elMsg = document.getElementById('cfg-mensaje');

    if (elNom) elNom.value = res.data.nombre_empresa || '';
    if (elRnc) elRnc.value = res.data.rnc || '';
    if (elTel) elTel.value = res.data.telefono || '';
    if (elEmail) elEmail.value = res.data.email || '';
    if (elCapitalInicial) elCapitalInicial.value = Number(res.data.capital_inicial || 0).toFixed(2);
    if (elDir) elDir.value = res.data.direccion || '';
    if (elMsg) elMsg.value = res.data.mensaje_factura || '';

    // Sincronizar marca en sidebar y título
    const brandNameEl = document.getElementById('sidebar-brand-name');
    const nombreMarca = res.data.nombre_empresa || 'DISTRIBUIDORA ROJAS PERALTA';
    if (brandNameEl) brandNameEl.innerHTML = escHtml(nombreMarca).replace(/\b(ROJAS)\b/i, '<span>$1</span>');
    document.title = nombreMarca;
  }
}

async function guardarConfiguracionEmpresaSubmit(e) {
  if (e) e.preventDefault();

  const nombre_empresa = document.getElementById('cfg-nombre').value.trim();
  const rnc = document.getElementById('cfg-rnc').value.trim();
  const telefono = document.getElementById('cfg-telefono').value.trim();
  const email = document.getElementById('cfg-email').value.trim();
  const capital_inicial = parseFloat(document.getElementById('cfg-capital-inicial').value) || 0;
  const direccion = document.getElementById('cfg-direccion').value.trim();
  const mensaje_factura = document.getElementById('cfg-mensaje').value.trim();

  if (!nombre_empresa) {
    alert('Ingresa el Nombre Comercial o Razón Social de la empresa.');
    return;
  }

  const res = await apiCall('guardar_configuracion_empresa', {
    nombre_empresa,
    rnc,
    telefono,
    email,
    capital_inicial,
    direccion,
    mensaje_factura
  });

  if (res.status === 'ok') {
    alert(' ¡Perfil de la empresa actualizado con éxito!');
    loadConfiguracionEmpresa();
  } else {
    alert(` Error al guardar perfil: ${res.message}`);
  }
}

// 11. EDICIÓN INTERACTIVA DE VENTAS
async function abrirModalEditarVenta(idVenta) {
  const res = await apiCall('get_venta_detalle', { idVenta });
  if (res.status !== 'ok' || !res.data) {
    alert('No se pudo obtener la información de la venta.');
    return;
  }

  const v = res.data;
  state.currentEditVenta = v;
  state.editVentaItems = (v.detalles || []).map(d => ({
    id_producto: d.id_producto,
    nombre: d.producto_nombre,
    cantidad: d.cantidad,
    precio_unitario: d.precio_unitario,
    itbis_porcentaje: 0
  }));

  document.getElementById('edit-venta-id').value = v.id;
  document.getElementById('modal-editar-venta-titulo').textContent = `Editar Venta #${v.id}`;
  document.getElementById('edit-venta-cliente').value = v.nombre_cliente || 'CLIENTE CONTADO';
  document.getElementById('edit-venta-rnc').value = v.rnc_cliente || '';
  document.getElementById('edit-venta-tipo-pago').value = v.tipo_pago || 'Contado';

  renderFilasEditVenta();
  document.getElementById('modal-editar-venta').classList.add('active');
}

function renderFilasEditVenta() {
  const tbody = document.getElementById('tbl-edit-venta-items');
  const prods = state.productos || [];

  if (!state.editVentaItems || state.editVentaItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay artículos en la venta. Haz clic en "+ Añadir Producto".</td></tr>`;
    recalcularTotalEditVenta();
    return;
  }

  tbody.innerHTML = state.editVentaItems.map((item, idx) => {
    const subtotalItem = (item.precio_unitario * item.cantidad);

    const prodOptions = prods.map(p => `
      <option value="${p.id}" ${p.id === item.id_producto ? 'selected' : ''}>
        ${p.nombre} (Disponibles: ${p.stock_total})
      </option>
    `).join('');

    return `
      <tr>
        <td>
          <select class="input-control" style="font-weight:700;" onchange="onEditVentaItemChange(${idx}, 'id_producto', this.value)">
            ${prodOptions}
          </select>
        </td>
        <td>
          <input type="number" min="1" class="input-control" style="font-weight:700; text-align:center;" value="${item.cantidad}" oninput="onEditVentaItemChange(${idx}, 'cantidad', this.value)">
        </td>
        <td>
          <input type="number" step="0.01" class="input-control" style="font-weight:700;" value="${item.precio_unitario}" oninput="onEditVentaItemChange(${idx}, 'precio_unitario', this.value)">
        </td>
        <td><strong>RD$ ${subtotalItem.toFixed(2)}</strong></td>
        <td style="text-align:center;">
          <button class="btn btn-danger" style="padding:2px 8px; font-size:11px;" onclick="eliminarFilaEditVenta(${idx})">&times;</button>
        </td>
      </tr>
    `;
  }).join('');

  recalcularTotalEditVenta();
}

function onEditVentaItemChange(index, field, value) {
  if (!state.editVentaItems[index]) return;

  if (field === 'id_producto') {
    const prodId = parseInt(value, 10);
    const p = (state.productos || []).find(prod => prod.id === prodId);
    if (p) {
      state.editVentaItems[index].id_producto = p.id;
      state.editVentaItems[index].nombre = p.nombre;
      state.editVentaItems[index].precio_unitario = p.precio_mayorista;
      state.editVentaItems[index].itbis_porcentaje = 0;
    }
  } else if (field === 'cantidad') {
    state.editVentaItems[index].cantidad = Math.max(1, parseInt(value, 10) || 1);
  } else if (field === 'precio_unitario') {
    state.editVentaItems[index].precio_unitario = Math.max(0, parseFloat(value) || 0);
  }

  renderFilasEditVenta();
}

function agregarFilaEditVenta() {
  const prods = state.productos || [];
  if (prods.length === 0) return;

  const primerProd = prods[0];
  state.editVentaItems.push({
    id_producto: primerProd.id,
    nombre: primerProd.nombre,
    cantidad: 1,
    precio_unitario: primerProd.precio_mayorista,
    itbis_porcentaje: 0
  });

  renderFilasEditVenta();
}

function eliminarFilaEditVenta(index) {
  state.editVentaItems.splice(index, 1);
  renderFilasEditVenta();
}

function recalcularTotalEditVenta() {
  let total = 0;
  (state.editVentaItems || []).forEach(item => {
    total += (item.precio_unitario * item.cantidad);
  });

  const totalEl = document.getElementById('edit-venta-total-display');
  if (totalEl) totalEl.textContent = `RD$ ${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

async function guardarEdicionVentaSubmit() {
  const idVenta = parseInt(document.getElementById('edit-venta-id').value, 10);
  const nombreCliente = document.getElementById('edit-venta-cliente').value.trim();
  const rncCliente = document.getElementById('edit-venta-rnc').value.trim();
  const tipoPago = document.getElementById('edit-venta-tipo-pago').value;

  if (!idVenta) return;
  if (!state.editVentaItems || state.editVentaItems.length === 0) {
    alert('Debes incluir al menos un producto en la venta.');
    return;
  }

  const res = await apiCall('editar_venta', {
    idVenta,
    nombreCliente,
    rncCliente,
    tipoPago,
    items: state.editVentaItems
  });

  if (res.status === 'ok') {
    alert(` ¡Venta #${idVenta} actualizada exitosamente!\nNuevo Total: RD$ ${res.data.total.toFixed(2)}`);
    cerrarModales();
    renderVentasHistorialView();
    loadProductosData();
    loadDashboardData();
  } else {
    alert(` Error al guardar venta editada: ${res.message}`);
  }
}

// 12. DETECTOR & ACTUALIZADOR EN VIVO DESDE GITHUB
function initLiveUpdateChecker() {
  setTimeout(verificarActualizacionGitHub, 4000);
  setInterval(verificarActualizacionGitHub, 120000);
}

async function verificarActualizacionGitHub() {
  try {
    const res = await apiCall('check_remote_update');
    const banner = document.getElementById('update-notification-banner');
    if (banner) {
      if (res.status === 'ok' && res.updateAvailable) {
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    }
  } catch (e) {
    console.log('Verificación de actualización silenciosa omitida (Offline)');
  }
}

async function aplicarActualizacionEnVivo(e) {
  const btn = (e && e.target) ? e.target : document.querySelector('#update-notification-banner button');
  if (btn) btn.textContent = 'Descargando...';

  const res = await apiCall('apply_remote_update');
  if (res.status === 'ok') {
    alert(' ¡Sistema actualizado exitosamente desde GitHub!\nLa página se recargará ahora con las nuevas funciones.');
    window.location.reload();
  } else {
    alert(` Error al aplicar actualización: ${res.message}`);
    if (btn) btn.textContent = 'Descargar & Actualizar Ahora';
  }
}

// 12.2 MÓDULO DE NÓMINAS, EMPLEADOS, ADELANTOS Y FRENTE A GASTOS
async function renderPayrollView() {
  await loadEmpleadosData();
  await loadAdelantosData();
  await loadHistorialNominasData();
  cargarPreparacionNominaView();
}

function cambiarPestanaNomina(pestana) {
  document.querySelectorAll('.btn-pestana-nomina').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content-nomina').forEach(c => c.style.display = 'none');

  const btn = document.getElementById(`tab-btn-${pestana}`);
  const content = document.getElementById(`tab-content-${pestana}`);

  if (btn) btn.classList.add('active');
  if (content) content.style.display = 'block';

  if (pestana === 'procesar') cargarPreparacionNominaView();
  if (pestana === 'adelantos') loadAdelantosData();
  if (pestana === 'historial') loadHistorialNominasData();
}

async function loadEmpleadosData() {
  const res = await apiCall('get_empleados');
  if (res.status === 'ok') {
    state.empleados = res.data || [];
    actualizarKPINomina();
    renderEmpleadosTable(state.empleados);
  }
}

function actualizarKPINomina() {
  const empleados = state.empleados || [];
  const totalEmp = empleados.length;
  let nominaEstimadaMes = 0;
  let adelantosTotales = 0;

  empleados.forEach(e => {
    const sueldo = parseFloat(e.salario_base) || 0;
    if (e.frecuencia_pago === 'Diario') nominaEstimadaMes += sueldo * 24;
    else if (e.frecuencia_pago === 'Semanal') nominaEstimadaMes += sueldo * 4;
    else if (e.frecuencia_pago === 'Quincenal') nominaEstimadaMes += sueldo * 2;
    else nominaEstimadaMes += sueldo;

    adelantosTotales += parseFloat(e.adelantos_pendientes) || 0;
  });

  const kpiCount = document.getElementById('kpi-nomina-empleados-count');
  const kpiEstimado = document.getElementById('kpi-nomina-monto-estimado');
  const kpiAdelantos = document.getElementById('kpi-nomina-adelantos-pendientes');

  if (kpiCount) kpiCount.textContent = `${totalEmp}`;
  if (kpiEstimado) kpiEstimado.textContent = `RD$ ${nominaEstimadaMes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  if (kpiAdelantos) kpiAdelantos.textContent = `RD$ ${adelantosTotales.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function renderEmpleadosTable(lista) {
  const tbody = document.getElementById('tbl-empleados');
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No hay empleados registrados aún. Haz clic en "+ Registrar Nuevo Empleado".</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(e => `
    <tr>
      <td><strong>#${e.id}</strong></td>
      <td><code>${e.cedula || 'N/A'}</code></td>
      <td><strong>${e.nombre}</strong></td>
      <td><span class="badge badge-info">${e.puesto}</span></td>
      <td>${e.telefono || 'N/A'}</td>
      <td><strong>RD$ ${(parseFloat(e.salario_base) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong> <small style="color: #6b6578; font-weight: 600;">/ ${e.frecuencia_pago.toLowerCase()}</small></td>
      <td><span class="badge" style="background:#efe5f8; color:#5a189a; font-weight:700;">${e.frecuencia_pago}</span></td>
      <td><strong style="color: ${(e.adelantos_pendientes || 0) > 0 ? '#d97706' : '#15803d'};">RD$ ${(parseFloat(e.adelantos_pendientes) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
      <td>
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="abrirModalEmpleado(${e.id})">Editar</button>
          <button class="btn btn-warning" style="padding: 4px 8px; font-size: 11px;" onclick="abrirModalAdelantoEmpleado(${e.id})">+ Adelanto</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="desactivarEmpleadoSubmit(${e.id}, '${e.nombre.replace(/'/g, "\\'")}')">Desactivar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filtrarTablaEmpleadosView() {
  const input = document.getElementById('empleados-search-input');
  if (!input) return;
  const q = input.value.toLowerCase().trim();

  if (!q) {
    renderEmpleadosTable(state.empleados);
    return;
  }

  const filtrados = (state.empleados || []).filter(e =>
    e.nombre.toLowerCase().includes(q) ||
    e.puesto.toLowerCase().includes(q) ||
    (e.cedula && e.cedula.toLowerCase().includes(q))
  );

  renderEmpleadosTable(filtrados);
}

function abrirModalEmpleado(id = null) {
  const modalTitulo = document.getElementById('modal-empleado-titulo');
  const inputId = document.getElementById('emp-id');
  const inputCedula = document.getElementById('emp-cedula');
  const inputNombre = document.getElementById('emp-nombre');
  const inputPuesto = document.getElementById('emp-puesto');
  const inputTel = document.getElementById('emp-telefono');
  const inputSalario = document.getElementById('emp-salario');
  const inputFrecuencia = document.getElementById('emp-frecuencia');
  const inputDiaPago = document.getElementById('emp-dia-pago');

  if (id) {
    const e = (state.empleados || []).find(item => item.id == id);
    if (e) {
      if (modalTitulo) modalTitulo.textContent = `Editar Empleado - ${e.nombre}`;
      if (inputId) inputId.value = e.id;
      if (inputCedula) inputCedula.value = e.cedula || '';
      if (inputNombre) inputNombre.value = e.nombre || '';
      if (inputPuesto) inputPuesto.value = e.puesto || '';
      if (inputTel) inputTel.value = e.telefono || '';
      if (inputSalario) inputSalario.value = e.salario_base || '';
      if (inputFrecuencia) inputFrecuencia.value = e.frecuencia_pago || 'Quincenal';
      if (inputDiaPago) inputDiaPago.value = e.dia_pago || 15;
    }
  } else {
    if (modalTitulo) modalTitulo.textContent = `Registrar Nuevo Empleado`;
    if (inputId) inputId.value = '';
    if (inputCedula) inputCedula.value = '';
    if (inputNombre) inputNombre.value = '';
    if (inputPuesto) inputPuesto.value = '';
    if (inputTel) inputTel.value = '';
    if (inputSalario) inputSalario.value = '';
    if (inputFrecuencia) inputFrecuencia.value = 'Quincenal';
    if (inputDiaPago) inputDiaPago.value = '15';
  }

  onFrecuenciaEmpleadoChange();
  document.getElementById('modal-empleado').classList.add('active');
}

function onFrecuenciaEmpleadoChange() {
  const frecuencia = document.getElementById('emp-frecuencia') ? document.getElementById('emp-frecuencia').value : 'Quincenal';
  const labelSalario = document.getElementById('emp-salario-label');
  const labelDia = document.getElementById('emp-dia-pago-label');
  const inputSalario = document.getElementById('emp-salario');

  if (labelSalario) {
    if (frecuencia === 'Semanal') {
      labelSalario.textContent = 'Sueldo Semanal (DOP):';
      if (inputSalario) inputSalario.placeholder = 'Ej. 5000.00 por semana';
    } else if (frecuencia === 'Quincenal') {
      labelSalario.textContent = 'Sueldo Quincenal (DOP):';
      if (inputSalario) inputSalario.placeholder = 'Ej. 15000.00 por quincena';
    } else if (frecuencia === 'Mensual') {
      labelSalario.textContent = 'Sueldo Mensual (DOP):';
      if (inputSalario) inputSalario.placeholder = 'Ej. 30000.00 al mes';
    } else if (frecuencia === 'Diario') {
      labelSalario.textContent = 'Sueldo Diario / Jornal (DOP):';
      if (inputSalario) inputSalario.placeholder = 'Ej. 1000.00 por día';
    }
  }

  if (labelDia) {
    if (frecuencia === 'Semanal') {
      labelDia.textContent = 'Día Pago (ej. 5=Viernes, 6=Sábado):';
    } else if (frecuencia === 'Quincenal') {
      labelDia.textContent = 'Día de Pago (15 o 30):';
    } else if (frecuencia === 'Mensual') {
      labelDia.textContent = 'Día de Pago del Mes (1-31):';
    } else {
      labelDia.textContent = 'Día de Pago (1-31):';
    }
  }
}

async function guardarEmpleadoSubmit() {
  const id = document.getElementById('emp-id') ? parseInt(document.getElementById('emp-id').value, 10) || null : null;
  const cedula = document.getElementById('emp-cedula').value.trim();
  const nombre = document.getElementById('emp-nombre').value.trim();
  const puesto = document.getElementById('emp-puesto').value.trim();
  const telefono = document.getElementById('emp-telefono').value.trim();
  const salarioBase = parseFloat(document.getElementById('emp-salario').value);
  const frecuenciaPago = document.getElementById('emp-frecuencia').value;
  const diaPago = parseInt(document.getElementById('emp-dia-pago').value, 10) || 15;

  if (!nombre || !puesto || isNaN(salarioBase) || salarioBase <= 0) {
    alert('Ingresa el nombre, puesto y un salario base válido mayor a 0.');
    return;
  }

  const res = await apiCall('guardar_empleado', {
    id,
    cedula,
    nombre,
    puesto,
    telefono,
    salarioBase,
    frecuenciaPago,
    diaPago
  });

  if (res.status === 'ok') {
    alert(id ? 'Datos del empleado actualizados exitosamente.' : 'Empleado registrado exitosamente.');
    cerrarModales();
    await loadEmpleadosData();
  } else {
    alert(`Error al guardar empleado: ${res.message}`);
  }
}

async function desactivarEmpleadoSubmit(id, nombre) {
  if (!confirm(`¿Estás seguro de desactivar al empleado '${nombre}'?`)) return;

  const res = await apiCall('desactivar_empleado', { idEmpleado: id });
  if (res.status === 'ok') {
    alert(`Empleado '${nombre}' desactivado.`);
    await loadEmpleadosData();
  } else {
    alert(`Error al desactivar empleado: ${res.message}`);
  }
}

function abrirModalAdelantoEmpleado(idEmpleado = null) {
  const select = document.getElementById('adelanto-empleado-select');
  const inputMonto = document.getElementById('adelanto-monto');
  const inputConcepto = document.getElementById('adelanto-concepto');

  if (select && state.empleados) {
    select.innerHTML = state.empleados.map(e => `
      <option value="${e.id}" ${e.id === idEmpleado ? 'selected' : ''}>${e.nombre} (${e.puesto} - ${e.frecuencia_pago})</option>
    `).join('');
  }

  if (inputMonto) inputMonto.value = '';
  if (inputConcepto) inputConcepto.value = '';

  document.getElementById('modal-adelanto-empleado').classList.add('active');
}

async function guardarAdelantoEmpleadoSubmit() {
  const select = document.getElementById('adelanto-empleado-select');
  const idEmpleado = parseInt(select.value, 10);
  const monto = parseFloat(document.getElementById('adelanto-monto').value);
  const concepto = document.getElementById('adelanto-concepto').value.trim() || 'Adelanto de Sueldo';

  if (!idEmpleado || isNaN(monto) || monto <= 0) {
    alert('Selecciona un empleado e ingresa un monto válido mayor a RD$ 0.00.');
    return;
  }

  const res = await apiCall('registrar_adelanto_empleado', {
    idEmpleado,
    monto,
    concepto
  });

  if (res.status === 'ok') {
    alert(`Adelanto de sueldo de RD$ ${monto.toFixed(2)} registrado exitosamente!\n\nSe ha generado el registro automático en Gastos Operativos y se descontará en el próximo pago de nómina.`);
    cerrarModales();
    await loadEmpleadosData();
    await loadAdelantosData();
    loadDashboardData();
  } else {
    alert(`Error al registrar adelanto: ${res.message}`);
  }
}

async function cargarPreparacionNominaView() {
  const selectFrecuencia = document.getElementById('nomina-frecuencia-select');
  const frecuencia = selectFrecuencia ? selectFrecuencia.value : 'Quincenal';

  const inputPeriodo = document.getElementById('nomina-periodo-cierre');
  if (inputPeriodo) {
    const hoy = new Date();
    const mesNombre = hoy.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
    const diaMes = hoy.getDate();
    
    if (frecuencia === 'Semanal') {
      const numSemana = Math.min(4, Math.max(1, Math.ceil(diaMes / 7)));
      inputPeriodo.value = `Nómina Semanal - Semana #${numSemana} de ${mesNombre}`;
    } else if (frecuencia === 'Quincenal') {
      const quincena = diaMes <= 15 ? '1ra Quincena' : '2da Quincena';
      inputPeriodo.value = `Nómina ${quincena} - ${mesNombre}`;
    } else if (frecuencia === 'Diario') {
      inputPeriodo.value = `Nómina Diaria - ${hoy.toLocaleDateString('es-DO')}`;
    } else if (frecuencia === 'Mensual') {
      inputPeriodo.value = `Nómina Mensual - ${mesNombre}`;
    } else {
      inputPeriodo.value = `Nómina General - ${mesNombre}`;
    }
  }

  const res = await apiCall('preparar_nomina', { frecuencia });
  const tbody = document.getElementById('tbl-prenomina-items');

  if (res.status === 'ok' && tbody) {
    const lista = res.data || [];
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No hay empleados activos registrados para la frecuencia '${frecuencia}'.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(item => `
      <tr>
        <td><strong>${item.nombre}</strong> <small style="color:#666;">(${item.cedula || 'Sin Cédula'})</small></td>
        <td>${item.puesto}</td>
        <td><span class="badge badge-info" style="font-weight: 700;">${item.frecuencia_pago}</span></td>
        <td>RD$ ${item.salario_base.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td><strong style="color: #0b0912; font-size: 13px;">RD$ ${item.salario_bruto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        <td><strong style="color: ${item.total_adelantos > 0 ? '#d97706' : '#15803d'};">-RD$ ${item.total_adelantos.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        <td><strong style="font-size: 15px; color: var(--color-success);">RD$ ${item.salario_neto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        <td style="text-align: center;">
          <button class="btn btn-success" style="padding: 4px 10px; font-size: 11px;" onclick="procesarPagoNominaEmpleado(${item.id_empleado}, ${item.salario_bruto}, ${item.total_adelantos}, ${item.salario_neto})">
            Pagar Nómina
          </button>
        </td>
      </tr>
    `).join('');
  }
}

async function procesarPagoNominaEmpleado(idEmpleado, bruto, adelantos, neto) {
  const emp = (state.empleados || []).find(e => e.id === idEmpleado);
  const nombreEmp = emp ? emp.nombre : `Empleado #${idEmpleado}`;
  const selectFrecuencia = document.getElementById('nomina-frecuencia-select');
  const frecuencia = selectFrecuencia ? selectFrecuencia.value : 'Quincenal';
  const periodoCierre = (document.getElementById('nomina-periodo-cierre') ? document.getElementById('nomina-periodo-cierre').value.trim() : '') || `Nómina ${frecuencia}`;

  if (!confirm(`¿Confirmas procesar el pago de nómina para '${nombreEmp}'?\n\nMonto Bruto: RD$ ${bruto.toFixed(2)}\nDescuento Adelantos: RD$ ${adelantos.toFixed(2)}\nNeto A Pagar: RD$ ${neto.toFixed(2)}\n\nEsta transacción registrará el gasto de nómina en Finanzas.`)) {
    return;
  }

  const res = await apiCall('procesar_pago_nomina', {
    idEmpleado,
    frecuencia: emp ? emp.frecuencia_pago : frecuencia,
    periodoCierre,
    salarioBruto: bruto,
    totalAdelantos: adelantos,
    salarioNeto: neto
  });

  if (res.status === 'ok') {
    alert(`Pago de nómina para '${nombreEmp}' procesado con éxito!\n\nMonto Pagado: RD$ ${neto.toFixed(2)}\nSe ha vinculado a Gastos Operativos y liquidado sus adelantos.`);
    await loadEmpleadosData();
    await loadHistorialNominasData();
    cargarPreparacionNominaView();
    loadDashboardData();
  } else {
    alert(`Error al procesar pago de nómina: ${res.message}`);
  }
}

async function loadAdelantosData() {
  const res = await apiCall('get_adelantos_empleado');
  const tbody = document.getElementById('tbl-adelantos');
  if (res.status === 'ok' && tbody) {
    const lista = res.data || [];
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No hay adelantos de sueldo registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(a => `
      <tr>
        <td><strong>#${a.id}</strong></td>
        <td>${a.fecha ? new Date(a.fecha).toLocaleString('es-DO') : ''}</td>
        <td><strong>${a.empleado_nombre}</strong></td>
        <td>${a.empleado_puesto}</td>
        <td>${a.concepto || 'Adelanto de Sueldo'}</td>
        <td><strong style="color: #d97706;">RD$ ${(parseFloat(a.monto) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
        <td>
          <span class="badge ${a.estado === 'Pendiente' ? 'badge-warning' : 'badge-success'}">
            ${a.estado}
          </span>
        </td>
      </tr>
    `).join('');
  }
}

async function loadHistorialNominasData() {
  const res = await apiCall('get_historial_nominas');
  const tbody = document.getElementById('tbl-historial-nominas');
  let pagadoMes = 0;

  if (res.status === 'ok' && tbody) {
    const lista = res.data || [];
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No se han procesado pagos de nómina aún.</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(p => {
      pagadoMes += parseFloat(p.salario_neto) || 0;
      return `
        <tr>
          <td><strong>#${p.id}</strong></td>
          <td>${p.fecha_pago ? new Date(p.fecha_pago).toLocaleString('es-DO') : ''}</td>
          <td><strong>${p.empleado_nombre}</strong> <small style="color:#666;">(${p.empleado_cedula || 'N/A'})</small></td>
          <td><span class="badge badge-info">${p.frecuencia}</span></td>
          <td>${p.periodo_cierre || 'Nómina Regular'}</td>
          <td>RD$ ${(parseFloat(p.salario_bruto) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
          <td><span style="color:#d97706;">-RD$ ${(parseFloat(p.total_adelantos) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></td>
          <td><strong style="color: var(--color-success);">RD$ ${(parseFloat(p.salario_neto) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong></td>
          <td><small>Gasto #${p.id_gasto || 'N/A'}</small></td>
        </tr>
      `;
    }).join('');

    const kpiPagado = document.getElementById('kpi-nomina-pagada-mes');
    if (kpiPagado) kpiPagado.textContent = `RD$ ${pagadoMes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  }
}

// =============================================================================
// CENTRO DE NOTIFICACIONES Y ALERTAS EN TIEMPO REAL
// =============================================================================
let notifFiltroTabActual = 'todas';

async function loadNotificaciones() {
  const res = await apiCall('get_notificaciones');
  if (res.status === 'ok' && res.data) {
    state.notificaciones = res.data;
    const { resumen, lista } = res.data;

    // Actualizar Badge de Conteo en el Ícono de la Campana
    const badge = document.getElementById('notification-badge-count');
    if (badge) {
      if (resumen.total > 0) {
        badge.textContent = resumen.total;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    // Actualizar Tag de Resumen en el Panel Desplegable
    const summaryTag = document.getElementById('notif-summary-tag');
    if (summaryTag) {
      summaryTag.textContent = `${resumen.total} activa${resumen.total === 1 ? '' : 's'}`;
    }

    renderNotificacionesList(lista);
  }
}

function renderNotificacionesList(lista) {
  const container = document.getElementById('notif-items-list');
  if (!container) return;

  let filtrados = lista || [];
  if (notifFiltroTabActual === 'critica') {
    filtrados = filtrados.filter(n => n.nivel === 'critica');
  } else if (notifFiltroTabActual === 'payroll') {
    filtrados = filtrados.filter(n => n.categoria === 'payroll');
  } else if (notifFiltroTabActual === 'inventario') {
    filtrados = filtrados.filter(n => n.categoria === 'inventario');
  }

  if (filtrados.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--color-text-muted); font-size: 12px;">No hay alertas pendientes en esta categoría.</div>`;
    return;
  }

  container.innerHTML = filtrados.map(n => {
    const iconSym = n.nivel === 'critica' ? '!' : n.nivel === 'advertencia' ? '⚠' : 'ℹ';
    return `
      <div class="notif-item" onclick="marcarNotificacionLeida('${n.id}', '${n.accion_view || ''}')">
        <div class="notif-icon ${n.nivel}">${iconSym}</div>
        <div style="flex: 1;">
          <div class="notif-title">${n.titulo}</div>
          <div class="notif-desc">${n.mensaje}</div>
        </div>
        <button style="border:none; background:none; color:#9a92ab; font-size:16px; cursor:pointer; padding:0 4px;" onclick="event.stopPropagation(); descartarNotificacionSinNavegar('${n.id}')" title="Marcar como leída">&times;</button>
      </div>
    `;
  }).join('');
}

function toggleNotificationMenu(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('notification-menu-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
}

function filtrarNotificacionesTab(tab, event) {
  if (event) event.stopPropagation();
  notifFiltroTabActual = tab;
  document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
  if (state.notificaciones && state.notificaciones.lista) {
    renderNotificacionesList(state.notificaciones.lista);
  }
}

async function marcarNotificacionLeida(clave, accionView) {
  await apiCall('marcar_notificacion_leida', { clave });
  loadNotificaciones();
  if (accionView) {
    switchView(accionView);
    const dropdown = document.getElementById('notification-menu-dropdown');
    if (dropdown) dropdown.classList.remove('show');
  }
}

async function descartarNotificacionSinNavegar(clave) {
  await apiCall('marcar_notificacion_leida', { clave });
  loadNotificaciones();
}

function showToastNotification(titulo, mensaje, tipo = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-message ${tipo}`;
  const iconSym = tipo === 'exito' ? '✓' : tipo === 'logro' ? '🎉' : 'ℹ';
  
  toast.innerHTML = `
    <div style="font-weight:900; font-size:16px;">${iconSym}</div>
    <div style="flex:1;">
      <div style="font-weight:800; font-size:13px;">${titulo}</div>
      <div style="font-size:11px; opacity:0.9;">${mensaje}</div>
    </div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4500);
}

function checkMilestoneVentas20k(montoNuevaVenta) {
  if (!state.ventasHoyAcumuladas) state.ventasHoyAcumuladas = 0;
  const anterior = state.ventasHoyAcumuladas;
  state.ventasHoyAcumuladas += montoNuevaVenta;
  
  const hitoAnterior = Math.floor(anterior / 20000) * 20000;
  const hitoNuevo = Math.floor(state.ventasHoyAcumuladas / 20000) * 20000;

  if (hitoNuevo >= 20000 && hitoNuevo > hitoAnterior) {
    showToastNotification(
      '🎉 ¡Hito de Ventas Alcanzado!',
      `Hemos alcanzado RD$ ${hitoNuevo.toLocaleString('es-DO')} vendidos el día de hoy. ¡Vamos excelente!`,
      'logro'
    );
  }
}

// =============================================================================
// RESETEO COMPLETO DE BASE DE DATOS A 0
// =============================================================================
function mostrarSeccionPasswordReset(configurada) {
  const setup = document.getElementById('reset-password-setup');
  const confirmation = document.getElementById('reset-password-confirmation');
  const setupButton = document.getElementById('btn-configurar-clave-reset');
  const resetButton = document.getElementById('btn-confirmar-reset');
  if (setup) setup.hidden = configurada;
  if (confirmation) confirmation.hidden = !configurada;
  if (setupButton) setupButton.hidden = configurada;
  if (resetButton) resetButton.hidden = !configurada;
}

async function abrirModalResetDatabase() {
  ['input-nueva-clave-reset', 'input-confirmar-clave-reset', 'input-clave-reset', 'input-confirmar-reset'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  const modal = document.getElementById('modal-reset-database');
  if (modal) modal.classList.add('active');

  const res = await apiCall('get_reset_password_status');
  if (res.status !== 'ok') {
    alert('No se pudo revisar la contraseña de borrado: ' + res.message);
    cerrarModales();
    return;
  }
  mostrarSeccionPasswordReset(Boolean(res.data && res.data.configurada));
}

async function configurarPasswordReset() {
  const password = document.getElementById('input-nueva-clave-reset').value;
  const confirmation = document.getElementById('input-confirmar-clave-reset').value;

  if (password.length < 8) {
    alert('La contraseña debe tener al menos 8 caracteres.');
    document.getElementById('input-nueva-clave-reset').focus();
    return;
  }
  if (password !== confirmation) {
    alert('Las contraseñas no coinciden.');
    document.getElementById('input-confirmar-clave-reset').focus();
    return;
  }

  const button = document.getElementById('btn-configurar-clave-reset');
  if (button) button.disabled = true;
  const res = await apiCall('set_reset_password', { password, confirmation });
  if (button) button.disabled = false;

  if (res.status === 'ok') {
    document.getElementById('input-nueva-clave-reset').value = '';
    document.getElementById('input-confirmar-clave-reset').value = '';
    mostrarSeccionPasswordReset(true);
    alert('Contraseña exclusiva configurada. Para borrar, deberás escribirla y confirmar con BORRAR.');
  } else {
    alert('No se pudo configurar la contraseña: ' + res.message);
  }
}

async function ejecutarResetDatabase() {
  const passwordInput = document.getElementById('input-clave-reset');
  const confirmInput = document.getElementById('input-confirmar-reset');
  const password = passwordInput ? passwordInput.value : '';
  const txt = confirmInput ? confirmInput.value.trim().toUpperCase() : '';

  if (!password) {
    alert('Escribe la contraseña de borrado.');
    if (passwordInput) passwordInput.focus();
    return;
  }
  if (txt !== 'BORRAR') {
    alert('Para confirmar el reseteo completo, escribe exactamente la palabra BORRAR.');
    if (confirmInput) confirmInput.focus();
    return;
  }

  if (!confirm('⚠️ ÚLTIMA CONFIRMACIÓN:\n¿Está absolutamente seguro de borrar todas las ventas, cobros, gastos, nóminas y reiniciar la base de datos a 0?')) {
    return;
  }

  const res = await apiCall('reset_database', { password, confirmation: txt });
  if (res.status === 'ok') {
    cerrarModales();
    alert('✅ Base de datos reseteada exitosamente. El sistema se reiniciará ahora a cero.');
    window.location.reload();
  } else {
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
    alert('❌ Error al resetear la base de datos: ' + res.message);
  }
}

