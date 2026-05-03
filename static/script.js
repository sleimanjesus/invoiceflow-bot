/* ═══════════════════════════════════════════════════
   INVOICEFLOW — Financial OS | JavaScript
   ═══════════════════════════════════════════════════ */

// ─── Estado Global ───
const state = {
    invoices: [],
    stats: null,
    alerts: [],
    charts: {},
    empresaId: null
};

// Obtener empresa_id de la URL
const urlParams = new URLSearchParams(window.location.search);
state.empresaId = urlParams.get('empresa_id') || null;

// Función helper para construir URLs con empresa_id
function apiUrl(path) {
    if (state.empresaId) {
        return `/api/empresas/${state.empresaId}${path}`;
    }
    return `/api${path}`;
}

// ─── Inicialización ───
document.addEventListener('DOMContentLoaded', () => {
    initDate();
    initNavigation();
    initUpload();
    initSearch();
    initFocusMode();
    loadData();
});

// ─── Fecha ───
function initDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = 
        now.toLocaleDateString('es-ES', options).replace(/^\w/, c => c.toUpperCase());
}

// ─── Navegación ───
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            
            // Actualizar nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            // Mostrar sección
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${section}`).classList.add('active');
        });
    });
    
    // Menu toggle móvil
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
}

// ─── Upload ───
function initUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFile(fileInput.files[0]);
        }
    });
}

async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('⚠️ Solo se aceptan imágenes', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch(apiUrl('/invoices/upload'), {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.status === 'ok') {
            showUploadResult(data);
            loadData();
            showToast(data.mensaje, 'success');
        } else if (data.status === 'duplicado') {
            showToast(data.mensaje, 'warning');
        }
    } catch (err) {
        showToast('❌ Error al subir la factura', 'error');
    }
}

function showUploadResult(data) {
    const result = document.getElementById('uploadResult');
    result.hidden = false;
    
    document.getElementById('resultTitle').textContent = `✅ ${data.mensaje}`;
    
    const body = document.getElementById('resultBody');
    body.innerHTML = `
        <div class="result-field">
            <label>Proveedor</label>
            <span>${data.datos.proveedor}</span>
        </div>
        <div class="result-field">
            <label>Total</label>
            <span>$${data.datos.total.toFixed(2)}</span>
        </div>
        <div class="result-field">
            <label>Categoría</label>
            <span>${data.datos.categoria}</span>
        </div>
        <div class="result-field">
            <label>Factura #</label>
            <span>${data.datos.numero_factura}</span>
        </div>
        <div class="result-field">
            <label>Tipo</label>
            <span>${data.datos.tipo_gasto}</span>
        </div>
    `;
    
    const insights = document.getElementById('resultInsights');
    if (data.analisis.insights.length > 0) {
        insights.innerHTML = `
            <h4>🔍 Insights</h4>
            <ul>
                ${data.analisis.insights.map(i => `<li>${i}</li>`).join('')}
            </ul>
        `;
    } else {
        insights.innerHTML = '';
    }
    
    // Scroll al resultado
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── Cargar Datos ───
async function loadData() {
    try {
        const [statsRes, invoicesRes, alertsRes] = await Promise.all([
            fetch(apiUrl('/invoices/stats')),
            fetch(apiUrl('/invoices')),
            fetch(apiUrl('/alerts'))
        ]);
        
        state.stats = await statsRes.json();
        state.invoices = await invoicesRes.json();
        state.alerts = await alertsRes.json();
        
        updateDashboard();
        updateInvoicesTable();
        updateAnalytics();
        updateBudgets();
        updateAlerts();
    } catch (err) {
        console.error('Error loading data:', err);
    }
}

// ─── Dashboard ───
function updateDashboard() {
    const s = state.stats;
    document.getElementById('totalGastado').textContent = `$${s.total_gastado.toLocaleString()}`;
    document.getElementById('totalFacturas').textContent = s.total_facturas;
    document.getElementById('promedioGasto').textContent = `$${s.promedio.toFixed(2)}`;
    
    // Gasto del mes actual
    const mesActual = s.meses.length > 0 ? s.meses[s.meses.length - 1] : null;
    document.getElementById('gastoMes').textContent = mesActual ? `$${mesActual.total.toFixed(2)}` : '$0.00';
    
    // Gráficos
    updateCategoryChart();
    updateMonthlyChart();
    updateInsights();
}

function updateCategoryChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (state.charts.category) state.charts.category.destroy();
    
    const colors = ['#00d4aa', '#7c3aed', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899'];
    const data = state.stats.categorias || [];
    
    // Si no hay datos, mostrar gráfico vacío con mensaje
    if (data.length === 0) {
        state.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sin datos'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(255,255,255,0.05)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255,255,255,0.3)',
                            padding: 16,
                            font: { family: 'Inter', size: 12 }
                        }
                    },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }
    
    state.charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.categoria),
            datasets: [{
                data: data.map(d => d.total),
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgba(255,255,255,0.7)',
                        padding: 16,
                        font: { family: 'Inter', size: 12 }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 1000
            }
        }
    });
}

function updateMonthlyChart() {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    
    if (state.charts.monthly) state.charts.monthly.destroy();
    
    const data = state.stats.meses || [];
    
    // Si no hay datos, mostrar gráfico vacío
    if (data.length === 0) {
        state.charts.monthly = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Sin datos'],
                datasets: [{
                    label: 'Gastos',
                    data: [0],
                    borderColor: 'rgba(255,255,255,0.1)',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    fill: true,
                    pointBackgroundColor: 'rgba(255,255,255,0.1)',
                    pointRadius: 0,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: { color: 'rgba(255,255,255,0.3)', font: { family: 'Inter', size: 11 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: {
                            color: 'rgba(255,255,255,0.3)',
                            font: { family: 'JetBrains Mono', size: 11 },
                            callback: v => '$' + v
                        }
                    }
                }
            }
        });
        return;
    }
    
    state.charts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => {
                const [y, m] = d.mes.split('-');
                const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                return `${meses[parseInt(m)-1]} ${y}`;
            }),
            datasets: [{
                label: 'Gastos',
                data: data.map(d => d.total),
                borderColor: '#00d4aa',
                backgroundColor: (ctx) => {
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(0, 212, 170, 0.2)');
                    gradient.addColorStop(1, 'rgba(0, 212, 170, 0)');
                    return gradient;
                },
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#00d4aa',
                pointBorderColor: '#0a0a0f',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'JetBrains Mono', size: 11 },
                        callback: v => '$' + v
                    }
                }
            },
            animation: { duration: 1000 }
        }
    });
}

function updateInsights() {
    const list = document.getElementById('insightsList');
    const insights = [];
    
    if (state.stats.total_facturas === 0) {
        list.innerHTML = `
            <div class="insight-item">
                <span class="insight-icon">💡</span>
                <span class="insight-text">Sube tu primera factura para recibir análisis inteligente</span>
            </div>
        `;
        return;
    }
    
    // Generar insights basados en datos reales
    if (state.stats.categorias.length > 0) {
        const topCat = state.stats.categorias[0];
        insights.push(`📊 Tu mayor gasto es en <strong>${topCat.categoria}</strong> ($${topCat.total.toFixed(2)})`);
    }
    
    if (state.stats.proveedores.length > 0) {
        const topProv = state.stats.proveedores[0];
        insights.push(`🏢 <strong>${topProv.proveedor}</strong> es tu proveedor principal (${topProv.count} facturas)`);
    }
    
    if (state.alerts.length > 0) {
        state.alerts.forEach(a => {
            const pct = ((a.gastado / a.limite) * 100).toFixed(0);
            insights.push(`⚠️ Has usado el <strong>${pct}%</strong> del presupuesto de <strong>${a.categoria}</strong>`);
        });
    }
    
    if (state.stats.promedio > 0) {
        insights.push(`💰 Gasto promedio por factura: <strong>$${state.stats.promedio.toFixed(2)}</strong>`);
    }
    
    list.innerHTML = insights.map(i => `
        <div class="insight-item">
            <span class="insight-icon">🔍</span>
            <span class="insight-text">${i}</span>
        </div>
    `).join('');
}

// ─── Tabla de Facturas ───
function updateInvoicesTable() {
    const body = document.getElementById('invoicesBody');
    
    if (state.invoices.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">No hay facturas registradas</td></tr>';
        return;
    }
    
    body.innerHTML = state.invoices.map(inv => `
        <tr>
            <td>${inv.proveedor}</td>
            <td>${formatDate(inv.fecha)}</td>
            <td><strong>$${inv.total.toFixed(2)}</strong></td>
            <td><span class="category-badge">${inv.categoria}</span></td>
            <td>${inv.numero_factura}</td>
            <td>${inv.tipo_gasto === 'fijo' ? '🔵 Fijo' : '🟢 Variable'}</td>
        </tr>
    `).join('');
}

// ─── Analíticas ───
function updateAnalytics() {
    const ctx = document.getElementById('providersChart').getContext('2d');
    
    if (state.charts.providers) state.charts.providers.destroy();
    
    const data = state.stats.proveedores;
    
    if (data.length === 0) return;
    
    state.charts.providers = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.proveedor),
            datasets: [{
                label: 'Total gastado',
                data: data.map(d => d.total),
                backgroundColor: data.map((_, i) => {
                    const colors = ['#00d4aa', '#7c3aed', '#3b82f6', '#f59e0b', '#ef4444'];
                    return colors[i % colors.length];
                }),
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'JetBrains Mono', size: 11 },
                        callback: v => '$' + v
                    }
                }
            },
            animation: { duration: 800 }
        }
    });
    
    // Lista de proveedores
    const list = document.getElementById('providersList');
    list.innerHTML = data.map(p => `
        <div class="provider-item">
            <span class="provider-name">${p.proveedor}</span>
            <div class="provider-stats">
                <span>Facturas: <strong>${p.count}</strong></span>
                <span>Total: <strong>$${p.total.toFixed(2)}</strong></span>
            </div>
        </div>
    `).join('');
}

// ─── Presupuestos ───
async function setBudget() {
    const categoria = document.getElementById('budgetCategory').value;
    const limite = parseFloat(document.getElementById('budgetLimit').value);
    
    if (!limite || limite <= 0) {
        showToast('⚠️ Ingresa un monto válido', 'error');
        return;
    }
    
    try {
        const res = await fetch(apiUrl('/budgets'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoria, limite })
        });
        const data = await res.json();
        
        if (data.status === 'error') {
            showToast(data.mensaje, 'error');
            return;
        }
        
        showToast(data.mensaje, 'success');
        document.getElementById('budgetLimit').value = '';
        loadData();
    } catch (err) {
        showToast('❌ Error al guardar presupuesto', 'error');
    }
}

function updateBudgets() {
    // Por ahora mostramos los budgets desde alerts
    const list = document.getElementById('budgetsList');
    
    if (state.alerts.length === 0) {
        list.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 24px;">No hay presupuestos configurados</p>';
        return;
    }
    
    list.innerHTML = state.alerts.map(b => {
        const pct = Math.min((b.gastado / b.limite) * 100, 100);
        const status = pct < 80 ? 'safe' : pct < 95 ? 'warning' : 'danger';
        return `
            <div class="budget-item">
                <div class="budget-info">
                    <span class="budget-category">${b.categoria}</span>
                    <span class="budget-progress">$${b.gastado.toFixed(2)} de $${b.limite.toFixed(2)}</span>
                </div>
                <div class="budget-bar">
                    <div class="budget-fill ${status}" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ─── Alertas ───
function updateAlerts() {
    const dot = document.getElementById('alertDot');
    if (state.alerts.length > 0) {
        dot.classList.add('active');
    } else {
        dot.classList.remove('active');
    }
}

// ─── Búsqueda ───
function initSearch() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#invoicesBody tr');
        
        rows.forEach(row => {
            if (row.querySelector('.empty-state')) return;
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });
}

// ─── Modo Focus ───
function initFocusMode() {
    document.getElementById('focusToggle').addEventListener('click', () => {
        document.body.classList.toggle('focus-mode');
    });
}

// ─── Helpers ───
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Toast ───
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 16px 24px;
        border-radius: 12px;
        font-family: 'Inter', sans-serif;
        font-size: 0.9rem;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.1);
    `;
    
    const colors = {
        success: 'background: rgba(0,212,170,0.15); color: #00d4aa;',
        error: 'background: rgba(239,68,68,0.15); color: #ef4444;',
        warning: 'background: rgba(245,158,11,0.15); color: #f59e0b;',
        info: 'background: rgba(59,130,246,0.15); color: #3b82f6;'
    };
    toast.style.cssText += colors[type] || colors.info;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Animación slideIn ───
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
