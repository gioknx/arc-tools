// ================= CONFIGURAÇÃO E ESTADO GLOBAL =================
const STATE = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  activeTab: 'dashboard',
  items: [],
  accounts: [],
  users: [],
  clients: [],
  activeClientId: null,
  stockViewMode: 'detailed', // Priorizar 'detailed' (Por Conta) para itens espelhados
  reorderMode: false,
  licenses: [],
  bags: Array.from({ length: 1 }, (_, i) => ({
    id: i + 1,
    isHalf: false,
    itemIdA: '',
    itemIdB: '',
    isDelivered: false
  }))
};

// ================= UTILITÁRIOS DA API =================
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (STATE.token) {
    headers['Authorization'] = `Bearer ${STATE.token}`;
  }

  const response = await fetch(endpoint, { ...options, headers });

  if (response.status === 401) {
    handleLogout(true);
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Erro ao processar requisição');
  }

  return data;
}

// ================= CONTROLE DE EXIBIÇÃO DE TELAS =================
function initApp() {
  if (STATE.token && STATE.user) {
    apiFetch('/api/auth/me')
      .then(res => {
        STATE.user = res.user;
        localStorage.setItem('user', JSON.stringify(res.user));
        showApp();
      })
      .catch(() => {
        handleLogout();
      });
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
  lucide.createIcons();
}

function showApp() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');

  document.getElementById('display-username').textContent = STATE.user.username;
  document.getElementById('display-role').textContent = STATE.user.role === 'admin' ? 'Administrador' : 'Operador (Duper)';
  document.getElementById('user-avatar').textContent = STATE.user.username.substring(0, 2).toUpperCase();

  const adminElements = document.querySelectorAll('.admin-only');
  const operatorElements = document.querySelectorAll('.operator-only');
  if (STATE.user.role === 'admin') {
    adminElements.forEach(el => el.classList.remove('hidden'));
    operatorElements.forEach(el => el.classList.add('hidden'));
  } else {
    adminElements.forEach(el => el.classList.add('hidden'));
    operatorElements.forEach(el => el.classList.remove('hidden'));
  }

  switchTab(STATE.activeTab);
}

// ================= CONTROLE DE ROTAS / ABAS (SPA) =================
function switchTab(tabId) {
  STATE.activeTab = tabId;
  
  document.querySelectorAll('.nav-item').forEach(link => {
    if (link.getAttribute('data-tab') === tabId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.add('hidden');
  });

  const activeTabEl = document.getElementById(`tab-${tabId}`);
  if (activeTabEl) {
    activeTabEl.classList.remove('hidden');
  }

  const titleMap = {
    dashboard: { title: 'Dashboard', subtitle: 'Visão geral do estoque e desempenho' },
    estoque: { title: 'Estoque de Recursos', subtitle: 'Estoque por conta ativa (evitando duplicação de itens espelhados)' },
    transferir: { title: 'Registrar Movimentação', subtitle: 'Lançar novas entradas, saídas ou transferências' },
    historico: { title: 'Histórico de Movimentações', subtitle: 'Todos os registros de logs auditáveis' },
    contas: { title: 'Contas de Jogo', subtitle: 'Lista de contas ativas e credenciais de acesso' },
    clientes: { title: 'Clientes & Vendas', subtitle: 'Controle de clientes, faturamento em R$/$ e histórico de compras' },
    itens: { title: 'Gerenciar Itens', subtitle: 'Configurar o catálogo de itens e armas' },
    equipe: { title: 'Gerenciar Equipe', subtitle: 'Controle de comissões e metas diárias dos operadores' },
    financeiro: { title: 'Financeiro & Caixa', subtitle: 'Fluxo de caixa da empresa e comissões da equipe' },
    dev: { title: 'Desenvolvedor / Reset', subtitle: 'Manutenção do banco de dados e resets com backup automático' },
    'minhas-info': { title: 'Suas Informações', subtitle: 'Contas e logins designados pelo administrador' },
    licencas: { title: 'Licenças de Jogo', subtitle: 'Gerenciar licenças mãe e suas subcontas vinculadas' }
  };

  if (titleMap[tabId]) {
    document.getElementById('page-title').textContent = titleMap[tabId].title;
    document.getElementById('page-subtitle').textContent = titleMap[tabId].subtitle;
  }

  loadTabData(tabId);
}

function loadTabData(tabId) {
  if (tabId === 'dashboard') {
    loadDashboardStats();
  } else if (tabId === 'estoque') {
    loadStockData();
  } else if (tabId === 'transferir') {
    loadTransferFormOptions();
  } else if (tabId === 'historico') {
    loadHistoryData();
  } else if (tabId === 'contas') {
    loadAccountsData();
  } else if (tabId === 'clientes') {
    loadClientsData();
  } else if (tabId === 'itens') {
    loadItemsData();
  } else if (tabId === 'equipe') {
    loadTeamData();
  } else if (tabId === 'financeiro') {
    loadFinanceData();
  } else if (tabId === 'dev') {
    initDevTab();
  } else if (tabId === 'minhas-info') {
    loadMyLogins();
  } else if (tabId === 'licencas') {
    loadLicensesData();
  }
}

// ================= AÇÕES E EVENTOS DE LOGIN / LOGOUT =================
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameVal = document.getElementById('username').value.trim();
  const passwordVal = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');

  errorEl.classList.add('hidden');

  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: usernameVal, password: passwordVal })
    });

    STATE.token = res.token;
    STATE.user = res.user;

    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));

    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  handleLogout();
});

function handleLogout(sessionExpired = false) {
  if (STATE.token) {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }

  STATE.token = null;
  STATE.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  showLogin();
  if (sessionExpired) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'Sessão expirada. Faça login novamente.';
    errorEl.classList.remove('hidden');
  }
}

// Configurar cliques na barra lateral
document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tabId = item.getAttribute('data-tab');
    switchTab(tabId);
  });
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  const icon = document.querySelector('#btn-refresh i');
  icon.classList.add('animate-spin');
  loadTabData(STATE.activeTab);
  setTimeout(() => icon.classList.remove('animate-spin'), 600);
});

document.getElementById('db-period-filter').addEventListener('change', () => {
  loadDashboardStats();
});

// ================= LÓGICA DO DASHBOARD =================
async function loadDashboardStats() {
  try {
    const periodFilter = document.getElementById('db-period-filter');
    const period = periodFilter ? periodFilter.value : 'today';
    const stats = await apiFetch(`/api/dashboard/stats?period=${period}`);
    
    const statsGrid = document.getElementById('dashboard-stats-grid');
    const panelsGrid = document.querySelector('.dashboard-layout-grid');

    // Limpar grids
    statsGrid.innerHTML = '';
    panelsGrid.innerHTML = '';

    let periodLabel = "Hoje";
    let periodDesc = "hoje";
    let multiplier = 1;
    if (stats.period === '7days') {
      periodLabel = "7 Dias";
      periodDesc = "nos últimos 7 dias";
      multiplier = 7;
    } else if (stats.period === '30days') {
      periodLabel = "30 Dias";
      periodDesc = "nos últimos 30 dias";
      multiplier = 30;
    } else if (stats.period === 'all') {
      periodLabel = "Geral";
      periodDesc = "em todo o período";
      multiplier = 30; // Default/fallback for all time operator display
    }

    if (stats.role === 'admin') {
      // --- DASHBOARD ADMIN ---
      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Contas Ativas</span>
            <div class="stat-icon icon-blue"><i data-lucide="key"></i></div>
          </div>
          <div class="stat-value">${stats.activeAccounts}</div>
          <div class="stat-desc">Contas ativas farmando/cofre</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Clientes Cadastrados</span>
            <div class="stat-icon icon-purple"><i data-lucide="users"></i></div>
          </div>
          <div class="stat-value">${stats.totalClients}</div>
          <div class="stat-desc">Clientes na base de dados</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Volume de Itens (${periodLabel})</span>
            <div class="stat-icon icon-green"><i data-lucide="activity"></i></div>
          </div>
          <div class="stat-value">${stats.todayVolume}</div>
          <div class="stat-desc">Itens movimentados ${periodDesc}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Vendas Realizadas (${periodLabel})</span>
            <div class="stat-icon icon-orange"><i data-lucide="shopping-bag"></i></div>
          </div>
          <div class="stat-value">${stats.salesCount}</div>
          <div class="stat-desc">Vendas concluídas ${periodDesc}</div>
        </div>
        
        <!-- Faturamento em Reais -->
        <div class="stat-card" style="border: 1px solid rgba(0, 242, 254, 0.25); box-shadow: 0 0 15px rgba(0, 242, 254, 0.08); background: linear-gradient(135deg, rgba(18, 26, 46, 0.8) 0%, rgba(10, 80, 100, 0.2) 100%);">
          <div class="stat-header">
            <span class="stat-title" style="color: var(--primary); font-weight: 700;">Faturamento (BRL)</span>
            <div class="stat-icon icon-blue" style="background: rgba(0, 242, 254, 0.2);"><i data-lucide="dollar-sign"></i></div>
          </div>
          <div class="stat-value" style="color: var(--text-main);">R$ ${(stats.salesBrl + stats.salesUsdInBrl).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="stat-desc" style="color: var(--text-muted);">${stats.salesUsdInBrl > 0 ? `Inclui R$ ${stats.salesUsdInBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} convertido de USD` : `Total consolidado ${periodDesc}`}</div>
        </div>
        
        <!-- Faturamento em Dólares -->
        <div class="stat-card" style="border: 1px solid rgba(168, 85, 247, 0.25); box-shadow: 0 0 15px rgba(168, 85, 247, 0.08); background: linear-gradient(135deg, rgba(18, 26, 46, 0.8) 0%, rgba(80, 10, 100, 0.2) 100%);">
          <div class="stat-header">
            <span class="stat-title" style="color: #d8b4fe; font-weight: 700;">Faturamento (USD)</span>
            <div class="stat-icon icon-purple" style="background: rgba(168, 85, 247, 0.2);"><i data-lucide="circle-dollar-sign"></i></div>
          </div>
          <div class="stat-value" style="color: #34D399; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
            <span>$ ${stats.salesUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span style="font-size: 14px; color: var(--text-muted); font-weight: 500;">(R$ ${stats.salesUsdInBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
          </div>
          <div class="stat-desc" style="color: var(--text-muted);">Cotação diária: 1 USD = R$ ${stats.usdToBrlRate.toFixed(4)}</div>
        </div>
      `;
      lucide.createIcons();

      // Montar painel esquerdo: Estoque por Conta (Admin)
      const leftPanel = document.createElement('div');
      leftPanel.className = 'dashboard-panel panel-large';
      leftPanel.innerHTML = `
        <div class="panel-header">
          <h3><i data-lucide="package"></i> Estoque por Conta</h3>
          <button class="btn btn-link" onclick="switchTab('estoque')">Ver Detalhes</button>
        </div>
        <div class="panel-body">
          <div class="table-container">
            <table class="data-table" id="dash-detailed-stock">
              <thead id="dash-detailed-header"></thead>
              <tbody id="dash-detailed-body"></tbody>
            </table>
          </div>
        </div>
      `;
      panelsGrid.appendChild(leftPanel);

      // Carregar estoque detalhado resumido no painel esquerdo
      const details = await apiFetch('/api/inventory/details');
      const items = await apiFetch('/api/items');
      const accounts = await apiFetch('/api/accounts');
      const activeAccs = accounts.filter(a => a.status === 'active');
      
      const dHeader = leftPanel.querySelector('#dash-detailed-header');
      const dBody = leftPanel.querySelector('#dash-detailed-body');
      
      // Cabeçalho
      const thIt = document.createElement('th');
      thIt.textContent = 'Item';
      dHeader.appendChild(thIt);
      activeAccs.slice(0, 4).forEach(acc => { // Mostrar apenas as 4 primeiras contas no resumo
        const th = document.createElement('th');
        th.className = 'text-right';
        th.textContent = acc.name;
        dHeader.appendChild(th);
      });

      // Linhas
      items.slice(0, 5).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${escapeHtml(item.name)}</strong></td>`;
        activeAccs.slice(0, 4).forEach(acc => {
          const rec = details.find(d => d.account_id === acc.id && d.item_id === item.id);
          const qty = rec ? rec.quantity : 0;
          tr.innerHTML += `<td class="text-right" style="color: ${qty > 0 ? 'var(--primary)' : 'var(--text-muted)'}">${qty > 0 ? qty : '-'}</td>`;
        });
        dBody.appendChild(tr);
      });

      // Montar painel direito: Rendimento dos Operadores (Admin)
      const rightPanel = document.createElement('div');
      rightPanel.className = 'dashboard-panel panel-small';
      rightPanel.innerHTML = `
        <div class="panel-header">
          <h3><i data-lucide="users"></i> Desempenho dos Dupers</h3>
          <button class="btn btn-link" onclick="switchTab('equipe')">Metas</button>
        </div>
        <div class="panel-body">
          <div class="duper-performance-list">
            ${stats.dupersStats.map(op => {
              const RUNS_PER_CONTA = Math.ceil(280 / 26); // 11 runs por conta cheia
              const opGoalContas = op.daily_goal * multiplier;
              const opGoalRuns = opGoalContas * RUNS_PER_CONTA;
              const opTxs = parseFloat((op.transactions_period || 0).toFixed(2));
              const progress = opGoalRuns > 0 ? Math.min(100, Math.round((opTxs / opGoalRuns) * 100)) : 0;
              const earnings = opTxs * op.payment_per_register;
              const contasFeitas = (opTxs / RUNS_PER_CONTA).toFixed(1);
              const metaLabel = stats.period === 'all' ? `Total: ${opTxs} runs/partidas (${contasFeitas} contas)` : `Meta ${periodLabel}: ${opTxs} / ${parseFloat(opGoalRuns.toFixed(2))} runs (${contasFeitas} / ${opGoalContas} contas)`;
              return `
                <div class="duper-performance-item">
                  <div class="duper-performance-header">
                    <strong>${escapeHtml(op.username)}</strong>
                    <span class="duper-performance-meta">Ganhos: R$ ${earnings.toFixed(2)}</span>
                  </div>
                  <div class="progress-container">
                    <div class="progress-bar" style="width: ${progress}%"></div>
                  </div>
                  <div class="progress-info">
                    <span>${metaLabel}</span>
                    <span>${progress}%</span>
                  </div>
                </div>
              `;
            }).join('')}
            ${stats.dupersStats.length === 0 ? '<p class="text-center text-muted">Nenhum operador cadastrado.</p>' : ''}
          </div>
        </div>
      `;
      panelsGrid.appendChild(rightPanel);

    } else {
      // --- DASHBOARD OPERADOR / DUPER ---
      const RUNS_PER_CONTA = Math.ceil(280 / 26); // 11 runs por conta cheia
      const adjustedGoalContas = stats.dailyGoal * multiplier;
      const adjustedGoal = adjustedGoalContas * RUNS_PER_CONTA;
      let progress = 100;
      if (stats.period !== 'all') {
        progress = adjustedGoal > 0 ? Math.min(100, Math.round((stats.todayVolume / adjustedGoal) * 100)) : 0;
      }
      const contasFeitas = (stats.todayVolume / RUNS_PER_CONTA).toFixed(1);
      
      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Minhas Runs/Partidas (${periodLabel})</span>
            <div class="stat-icon icon-blue"><i data-lucide="play-circle"></i></div>
          </div>
          <div class="stat-value">${parseFloat(stats.todayVolume.toFixed(2))}</div>
          <div class="stat-desc">${contasFeitas} contas cheias processadas ${periodDesc}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Meus Ganhos (${periodLabel})</span>
            <div class="stat-icon icon-green"><i data-lucide="wallet"></i></div>
          </div>
          <div class="stat-value">R$ ${stats.todayEarnings.toFixed(2)}</div>
          <div class="stat-desc">Comissão acumulada ${periodDesc}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Comissão por Run/Partida</span>
            <div class="stat-icon icon-purple"><i data-lucide="coins"></i></div>
          </div>
          <div class="stat-value">R$ ${stats.paymentPerRegister.toFixed(2)}</div>
          <div class="stat-desc">Valor fixo pago por run/partida</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Progresso da Meta</span>
            <div class="stat-icon icon-orange"><i data-lucide="trophy"></i></div>
          </div>
          <div class="stat-value">${stats.period === 'all' ? '-' : progress + '%'}</div>
          <div class="stat-desc">${stats.period === 'all' ? 'Meta inativa para Todo o Período' : `Meta ${periodDesc}: ${contasFeitas} / ${adjustedGoalContas} contas cheias`}</div>
        </div>
      `;
      lucide.createIcons();

      // Montar painel esquerdo: Minhas Atividades Recentes (Duper)
      const leftPanel = document.createElement('div');
      leftPanel.className = 'dashboard-panel panel-large';
      leftPanel.innerHTML = `
        <div class="panel-header">
          <h3><i data-lucide="history"></i> Minhas Últimas Atividades</h3>
          <button class="btn btn-link" onclick="switchTab('historico')">Ver Tudo</button>
        </div>
        <div class="panel-body">
          <div class="activity-feed">
            ${stats.recentTransactions.map(tx => {
              let badge = '';
              let desc = '';
              if (tx.type === 'transfer') {
                badge = '<div class="activity-badge badge-transfer"><i data-lucide="arrow-left-right"></i></div>';
                desc = `Transferência de <strong>${tx.quantity} ${escapeHtml(tx.item_name)}</strong>`;
              } else if (tx.type === 'fill_account') {
                badge = '<div class="activity-badge badge-fill"><i data-lucide="chevrons-right"></i></div>';
                desc = `Cópia (Encher) de <strong>${tx.quantity} ${escapeHtml(tx.item_name)}</strong>`;
              } else if (tx.type === 'adjust_add') {
                badge = '<div class="activity-badge badge-add"><i data-lucide="plus"></i></div>';
                desc = `Entrada de <strong>${tx.quantity} ${escapeHtml(tx.item_name)}</strong>`;
              } else if (tx.type === 'sale') {
                badge = '<div class="activity-badge badge-pink"><i data-lucide="shopping-bag"></i></div>';
                desc = `Venda de <strong>${tx.quantity} ${escapeHtml(tx.item_name)}</strong>`;
              } else {
                badge = '<div class="activity-badge badge-sub"><i data-lucide="minus"></i></div>';
                desc = `Saída de <strong>${tx.quantity} ${escapeHtml(tx.item_name)}</strong>`;
              }
              return `
                <div class="activity-item">
                  ${badge}
                  <div class="activity-details">
                    <span class="activity-text">${desc}</span>
                    <span class="activity-time">${new Date(tx.timestamp).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              `;
            }).join('')}
            ${stats.recentTransactions.length === 0 ? '<p class="text-center text-muted" style="padding: 20px;">Nenhuma movimentação registrada por você.</p>' : ''}
          </div>
        </div>
      `;
      panelsGrid.appendChild(leftPanel);

      // Montar painel direito: Resumo de Metas com barra visual grande (Duper)
      const rightPanel = document.createElement('div');
      rightPanel.className = 'dashboard-panel panel-small';
      
      let denominatorText = "";
      let subtitleText = "";
      let progressSection = "";
      
      if (stats.period === 'all') {
        denominatorText = `${stats.todayVolume}`;
        subtitleText = `Runs/partidas totais (${contasFeitas} contas cheias).`;
        progressSection = `
          <div style="width: 100%;">
            <p style="font-size: 13px; color: var(--text-muted);">Visualizando total acumulado de runs/partidas</p>
          </div>
        `;
      } else {
        denominatorText = `${contasFeitas} / ${adjustedGoalContas}`;
        subtitleText = `Contas cheias processadas ${periodDesc}. Cada conta = ${RUNS_PER_CONTA} runs/partidas. Você fez ${stats.todayVolume} runs.`;
        progressSection = `
          <div style="width: 100%;">
            <div class="progress-container" style="height: 16px;">
              <div class="progress-bar" style="width: ${progress}%"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px;">
              <span>Falta: ${Math.max(0, adjustedGoal - stats.todayVolume)} runs/partidas</span>
              <span>${progress}% Concluído</span>
            </div>
          </div>
        `;
      }

      rightPanel.innerHTML = `
        <div class="panel-header">
          <h3><i data-lucide="gauge"></i> Meta no Período</h3>
        </div>
        <div class="panel-body" style="display: flex; flex-direction: column; justify-content: center; gap: 20px; align-items: center; text-align: center; min-height: 180px;">
          <h2 style="font-family: var(--font-family-brand); font-size: 48px; font-weight: 800; color: var(--primary);">${denominatorText}</h2>
          <p class="text-muted" style="font-size: 14px;">${subtitleText}</p>
          ${progressSection}
        </div>
      `;
      panelsGrid.appendChild(rightPanel);
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao carregar estatísticas:', err);
  }
}

// ================= LÓGICA DO ESTOQUE =================
// UTILS DE ORDENAÇÃO CUSTOMIZADA
function getSortedItems(items) {
  if (!STATE.user) return items;
  const saved = localStorage.getItem(`item_order_${STATE.user.username}`);
  if (!saved) return items;
  try {
    const order = JSON.parse(saved);
    const orderMap = {};
    order.forEach((id, index) => {
      orderMap[id] = index;
    });
    return [...items].sort((a, b) => {
      const indexA = orderMap[a.id] !== undefined ? orderMap[a.id] : 999999;
      const indexB = orderMap[b.id] !== undefined ? orderMap[b.id] : 999999;
      if (indexA !== indexB) return indexA - indexB;
      return a.id - b.id;
    });
  } catch (e) {
    return items;
  }
}

function getSortedStock(stock) {
  if (!STATE.user) return stock;
  const saved = localStorage.getItem(`item_order_${STATE.user.username}`);
  if (!saved) return stock;
  try {
    const order = JSON.parse(saved);
    const orderMap = {};
    order.forEach((id, index) => {
      orderMap[id] = index;
    });
    return [...stock].sort((a, b) => {
      const indexA = orderMap[a.item_id] !== undefined ? orderMap[a.item_id] : 999999;
      const indexB = orderMap[b.item_id] !== undefined ? orderMap[b.item_id] : 999999;
      if (indexA !== indexB) return indexA - indexB;
      return a.item_id - b.item_id;
    });
  } catch (e) {
    return stock;
  }
}

async function loadStockData() {
  try {
    const stock = await apiFetch('/api/inventory');
    const details = await apiFetch('/api/inventory/details');
    const items = await apiFetch('/api/items');
    const accounts = await apiFetch('/api/accounts');

    STATE.items = items;
    STATE.accounts = accounts;

    const sortedStock = getSortedStock(stock);
    const sortedItems = getSortedItems(items);

    renderConsolidatedStock(sortedStock);
    renderDetailedStock(details, sortedItems, accounts);
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao carregar dados de estoque:', err);
  }
}

function renderConsolidatedStock(stock) {
  const container = document.getElementById('consolidated-stock-cards');
  container.innerHTML = '';

  const filterText = document.getElementById('stock-search').value.toLowerCase();

  const filtered = stock.filter(item => 
    item.item_name.toLowerCase().includes(filterText) ||
    item.item_category.toLowerCase().includes(filterText)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px;" class="text-muted">Nenhum item em estoque.</div>`;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'stock-item-card';
    if (STATE.reorderMode) {
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-item-id', item.item_id);
      card.classList.add('draggable-card');
    }
    const colorClass = item.item_color || 'gray';
    
    const dragHandle = STATE.reorderMode
      ? `<i data-lucide="grip-vertical" class="drag-handle" style="cursor: grab; margin-right: 8px; opacity: 0.6; display: inline-block; vertical-align: middle;"></i>`
      : '';

    card.innerHTML = `
      <div class="stock-item-info">
        <div style="display: flex; align-items: center; gap: 4px;">
          ${dragHandle}
          <span class="item-badge badge-${colorClass}">${escapeHtml(item.item_category)}</span>
        </div>
        <span class="stock-item-name" style="margin-top: 4px;">${escapeHtml(item.item_name)}</span>
      </div>
      <div class="stock-item-qty">${item.total_quantity}</div>
    `;

    if (STATE.reorderMode) {
      card.addEventListener('dragstart', handleCardDragStart);
      card.addEventListener('dragover', handleCardDragOver);
      card.addEventListener('dragend', handleCardDragEnd);
    }

    container.appendChild(card);
  });
}

function renderDetailedStock(details, items, accounts) {
  const header = document.getElementById('detailed-stock-header');
  const body = document.getElementById('detailed-stock-body');

  header.innerHTML = '';
  body.innerHTML = '';

  const filterType = document.getElementById('stock-filter-acc-type').value;
  const filterSearchAcc = document.getElementById('stock-search-acc').value.toLowerCase();

  const activeAccounts = accounts.filter(a => {
    const matchesStatus = a.status === 'active';
    const matchesType = !filterType || a.type === filterType;
    const matchesSearch = a.name.toLowerCase().includes(filterSearchAcc);
    return matchesStatus && matchesType && matchesSearch;
  });

  if (activeAccounts.length === 0 || items.length === 0) {
    body.innerHTML = `<tr><td colspan="100%" class="text-center text-muted" style="padding: 20px;">Nenhuma conta ativa ou item localizado com os filtros aplicados.</td></tr>`;
    return;
  }

  // Cabeçalho
  const thItem = document.createElement('th');
  thItem.textContent = 'Item / Recurso';
  header.appendChild(thItem);

  activeAccounts.forEach(acc => {
    const th = document.createElement('th');
    th.className = 'text-right';
    
    // Adicionar tag visual do tipo de conta
    const typeLabel = acc.type === 'cofre' ? 'Cofre' : 'Duper';
    const typeClass = acc.type === 'cofre' ? 'badge-type-cofre' : 'badge-type-duper';
    th.innerHTML = `<div>${escapeHtml(acc.name)}</div><span class="badge-status ${typeClass}" style="font-size: 8px; padding: 1px 4px; margin-top: 2px; display: inline-block;">${typeLabel}</span>`;
    header.appendChild(th);
  });

  const filterText = document.getElementById('stock-search').value.toLowerCase();
  const filteredItems = items.filter(i => i.name.toLowerCase().includes(filterText));

  // Linhas
  filteredItems.forEach(item => {
    const tr = document.createElement('tr');
    if (STATE.reorderMode) {
      tr.setAttribute('draggable', 'true');
      tr.setAttribute('data-item-id', item.id);
      tr.classList.add('draggable-row');
    }
    
    const tdName = document.createElement('td');
    const colorClass = item.color || 'gray';
    const dragHandle = STATE.reorderMode
      ? `<i data-lucide="grip-vertical" class="drag-handle" style="cursor: grab; margin-right: 8px; opacity: 0.6; display: inline-block; vertical-align: middle;"></i>`
      : '';
    tdName.innerHTML = `${dragHandle}<strong>${escapeHtml(item.name)}</strong> <span class="item-badge badge-${colorClass}" style="font-size: 8px; padding: 1px 4px; display: inline-block; margin-left: 6px;">${escapeHtml(item.category)}</span>`;
    tr.appendChild(tdName);

    activeAccounts.forEach(acc => {
      const tdQty = document.createElement('td');
      tdQty.className = 'text-right';
      
      const record = details.find(d => d.account_id === acc.id && d.item_id === item.id);
      const qty = record ? record.quantity : 0;
      const isAdmin = STATE.user.role === 'admin';

      if (isAdmin) {
        tdQty.innerHTML = `<span style="color: ${qty > 0 ? 'var(--primary)' : 'var(--text-muted)'}; font-weight: ${qty > 0 ? '600' : 'normal'}; cursor: pointer;" onclick="openStockAdjustModal(${acc.id}, '${escapeHtml(acc.name)}', ${item.id}, '${escapeHtml(item.name)}', ${qty})">
          ${qty > 0 ? qty : '-'} <i data-lucide="edit-2" style="width: 10px; height: 10px; opacity: 0.4; margin-left: 2px; display: inline-block;"></i>
        </span>`;
      } else {
        tdQty.textContent = qty > 0 ? qty : '-';
        if (qty > 0) {
          tdQty.style.color = 'var(--primary)';
          tdQty.style.fontWeight = '600';
        } else {
          tdQty.style.color = 'var(--text-muted)';
        }
      }
      tr.appendChild(tdQty);
    });

    if (STATE.reorderMode) {
      tr.addEventListener('dragstart', handleRowDragStart);
      tr.addEventListener('dragover', handleRowDragOver);
      tr.addEventListener('dragend', handleRowDragEnd);
    }

    body.appendChild(tr);
  });
}

document.getElementById('btn-view-consolidated').addEventListener('click', () => {
  STATE.stockViewMode = 'consolidated';
  document.getElementById('btn-view-consolidated').className = 'btn btn-primary';
  document.getElementById('btn-view-by-account').className = 'btn btn-outline';
  
  document.getElementById('stock-consolidated-view').classList.remove('hidden');
  document.getElementById('stock-by-account-view').classList.add('hidden');
  document.getElementById('account-filters-container').classList.add('hidden');
});

document.getElementById('btn-view-by-account').addEventListener('click', () => {
  STATE.stockViewMode = 'detailed';
  document.getElementById('btn-view-consolidated').className = 'btn btn-outline';
  document.getElementById('btn-view-by-account').className = 'btn btn-primary';

  document.getElementById('stock-consolidated-view').classList.add('hidden');
  document.getElementById('stock-by-account-view').classList.remove('hidden');
  document.getElementById('account-filters-container').classList.remove('hidden');
});

document.getElementById('stock-search').addEventListener('input', () => {
  loadStockData();
});

document.getElementById('stock-filter-acc-type').addEventListener('change', () => {
  loadStockData();
});

document.getElementById('stock-search-acc').addEventListener('input', () => {
  loadStockData();
});

// ================= LÓGICA DO FORMULÁRIO DE TRANSAÇÕES =================
async function loadTransferFormOptions() {
  try {
    const items = await apiFetch('/api/items');
    const accounts = await apiFetch('/api/accounts');
    const clients = await apiFetch('/api/clients');
    
    const user = STATE.user;
    let users = [];
    if (user.role === 'admin') {
      users = await apiFetch('/api/users');
    } else {
      users = [user];
    }

    STATE.items = items;
    STATE.accounts = accounts;
    STATE.clients = clients;

    const selectFrom = document.getElementById('tx-from-account');
    const selectTo = document.getElementById('tx-to-account');
    const selectHelper = document.getElementById('tx-helper');
    const selectClient = document.getElementById('tx-client-id');

    const prevFrom = selectFrom.value;
    const prevTo = selectTo.value;
    const prevHelper = selectHelper.value;
    const prevClient = selectClient.value;

    selectFrom.innerHTML = '<option value="" disabled selected>Selecione a conta...</option>';
    selectTo.innerHTML = '<option value="" disabled selected>Selecione a conta...</option>';
    selectTo.innerHTML += '<option value="CLIENT_SELECT">Cliente (Venda)...</option>';
    selectHelper.innerHTML = '<option value="">Ninguém (Apenas eu)</option>';
    selectClient.innerHTML = '<option value="" disabled selected>Selecione um cliente...</option>';

    const activeAccounts = accounts.filter(a => a.status === 'active');
    activeAccounts.forEach(a => {
      const typeLabel = a.type === 'cofre' ? 'Cofre' : 'Duper';
      selectFrom.innerHTML += `<option value="${a.id}">${escapeHtml(a.name)} (${typeLabel})</option>`;
      selectTo.innerHTML += `<option value="${a.id}">${escapeHtml(a.name)} (${typeLabel})</option>`;
    });

    clients.forEach(c => {
      selectClient.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });

    users.forEach(u => {
      if (u.id !== user.id) {
        selectHelper.innerHTML += `<option value="${u.id}">${escapeHtml(u.username)}</option>`;
      }
    });

    if (prevFrom) selectFrom.value = prevFrom;
    if (prevTo) selectTo.value = prevTo;
    if (prevHelper) selectHelper.value = prevHelper;
    if (prevClient) selectClient.value = prevClient;

    renderBagsSection();
    updateFormFieldsVisibility();
    updateStockFeedback();
  } catch (err) {
    console.error('Erro ao carregar seleções do formulário:', err);
  }
}

function renderBagsSection() {
  const container = document.getElementById('bags-list-container');
  if (!container) return;
  container.innerHTML = '';

  STATE.bags.forEach(bag => {
    const card = document.createElement('div');
    card.className = `bag-card ${bag.isDelivered ? 'bag-delivered' : ''}`;
    card.setAttribute('data-bag-id', bag.id);

    // Dropdown options for items
    const itemOptionsHtml = STATE.items.map(i => 
      `<option value="${i.id}" ${bag.isHalf ? '' : (parseInt(bag.itemIdA) === i.id ? 'selected' : '')}>${escapeHtml(i.name)} (${escapeHtml(i.category)})</option>`
    ).join('');

    const itemASelect = `
      <div class="bag-select-wrapper">
        <span>${bag.isHalf ? 'Item A (13 unidades)' : 'Item (26 unidades)'}</span>
        <select class="bag-item-select-a" onchange="updateBagState(${bag.id}, 'itemIdA', this.value)" required ${bag.isDelivered ? 'disabled' : ''}>
          <option value="" disabled ${!bag.itemIdA ? 'selected' : ''}>Selecione um item...</option>
          ${itemOptionsHtml}
        </select>
      </div>
    `;

    let itemBSelect = '';
    if (bag.isHalf) {
      const itemBOptionsHtml = STATE.items.map(i => 
        `<option value="${i.id}" ${parseInt(bag.itemIdB) === i.id ? 'selected' : ''}>${escapeHtml(i.name)} (${escapeHtml(i.category)})</option>`
      ).join('');
      
      itemBSelect = `
        <div class="bag-select-wrapper" style="margin-top: 6px;">
          <span>Item B (13 unidades)</span>
          <select class="bag-item-select-b" onchange="updateBagState(${bag.id}, 'itemIdB', this.value)" required ${bag.isDelivered ? 'disabled' : ''}>
            <option value="" disabled ${!bag.itemIdB ? 'selected' : ''}>Selecione um item...</option>
            ${itemBOptionsHtml}
          </select>
        </div>
      `;
    }

    const btnText = bag.isDelivered ? '<i data-lucide="check-circle-2"></i> Entregue (Desfazer)' : '<i data-lucide="play"></i> Marcar como Entregue';

    card.innerHTML = `
      <div class="bag-header">
        <div class="bag-title">
          <i data-lucide="backpack"></i> Bag ${bag.id}
        </div>
        <label class="bag-switch-container">
          <input type="checkbox" ${bag.isHalf ? 'checked' : ''} onchange="toggleBagHalf(${bag.id}, this.checked)" ${bag.isDelivered ? 'disabled' : ''}>
          <span>Half Bag</span>
        </label>
      </div>
      
      <div class="bag-selectors-container">
        ${itemASelect}
        ${itemBSelect}
      </div>

      <button type="button" class="bag-btn-deliver" onclick="toggleBagDelivered(${bag.id})">
        ${btnText}
      </button>
    `;

    container.appendChild(card);
  });

  lucide.createIcons();
}

window.updateBagState = function(bagId, field, value) {
  const bag = STATE.bags.find(b => b.id === bagId);
  if (bag) {
    bag[field] = value;
    updateStockFeedback();
  }
};

window.toggleBagHalf = function(bagId, isChecked) {
  const bag = STATE.bags.find(b => b.id === bagId);
  if (bag) {
    bag.isHalf = isChecked;
    if (!isChecked) {
      bag.itemIdB = ''; // Reset item B if unchecked
    }
    renderBagsSection();
    updateStockFeedback();
  }
};

window.toggleBagDelivered = function(bagId) {
  const bag = STATE.bags.find(b => b.id === bagId);
  if (bag) {
    // Validate if items are selected first
    if (!bag.itemIdA || (bag.isHalf && !bag.itemIdB)) {
      alert(`Por favor, selecione os itens da Bag ${bagId} antes de marcar como entregue.`);
      return;
    }
    bag.isDelivered = !bag.isDelivered;
    renderBagsSection();
    updateStockFeedback();
  }
};

async function updateStockFeedback() {
  const fromAccountId = document.getElementById('tx-from-account').value;
  const type = document.getElementById('tx-type').value;
  const panel = document.getElementById('stock-feedback-panel');

  if (!panel) return;

  // Calculate needed quantities
  const needed = {};
  STATE.bags.forEach(bag => {
    if (bag.isHalf) {
      if (bag.itemIdA) {
        needed[bag.itemIdA] = (needed[bag.itemIdA] || 0) + 13;
      }
      if (bag.itemIdB) {
        needed[bag.itemIdB] = (needed[bag.itemIdB] || 0) + 13;
      }
    } else {
      if (bag.itemIdA) {
        needed[bag.itemIdA] = (needed[bag.itemIdA] || 0) + 26;
      }
    }
  });

  const itemsNeeded = Object.keys(needed);
  if (itemsNeeded.length === 0) {
    panel.classList.add('hidden');
    return;
  }

  let stockMap = {};
  if (fromAccountId && (type === 'transfer' || type === 'adjust_sub' || type === 'sale' || type === 'fill_account')) {
    try {
      const details = await apiFetch('/api/inventory/details');
      details.forEach(d => {
        if (parseInt(d.account_id) === parseInt(fromAccountId)) {
          stockMap[d.item_id] = d.quantity;
        }
      });
    } catch (err) {
      console.error('Error fetching inventory for feedback:', err);
    }
  }

  panel.classList.remove('hidden');
  
  let html = `
    <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
      <i data-lucide="info" style="width: 14px; height: 14px; color: var(--primary);"></i> 
      Balanço da Remessa (Necessário vs Estoque de Origem)
    </h4>
    <div class="stock-feedback-grid">
  `;

  itemsNeeded.forEach(itemId => {
    const item = STATE.items.find(i => i.id === parseInt(itemId));
    if (!item) return;

    const qtyNeeded = needed[itemId];
    const currentStock = stockMap[itemId] || 0;
    const diff = currentStock - qtyNeeded;

    let statusClass = '';
    let statusText = '';
    let icon = '';

    if (diff >= 0) {
      statusClass = 'feedback-ok';
      statusText = `Sobrando ${diff}`;
      icon = '<i data-lucide="check" style="width: 12px; height: 12px; vertical-align: middle;"></i>';
    } else {
      statusClass = 'feedback-error';
      statusText = `Faltando ${Math.abs(diff)}`;
      icon = '<i data-lucide="x" style="width: 12px; height: 12px; vertical-align: middle;"></i>';
    }

    html += `
      <div class="stock-feedback-item">
        <span class="stock-feedback-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="stock-feedback-status ${statusClass}">
          ${icon} ${statusText}
        </span>
        <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Remessa: ${qtyNeeded} | Estoque: ${currentStock}</span>
      </div>
    `;
  });

  html += '</div>';
  panel.innerHTML = html;
  lucide.createIcons();
}

document.getElementById('transaction-form').addEventListener('reset', () => {
  STATE.bags = Array.from({ length: 1 }, (_, i) => ({
    id: i + 1,
    isHalf: false,
    itemIdA: '',
    itemIdB: '',
    isDelivered: false
  }));
  const countEl = document.getElementById('tx-bags-count');
  if (countEl) countEl.value = 1;
  setTimeout(() => {
    renderBagsSection();
    updateStockFeedback();
  }, 50);
});

function updateFormFieldsVisibility() {
  const type = document.getElementById('tx-type').value;
  const fromGroup = document.getElementById('group-from-account');
  const toGroup = document.getElementById('group-to-account');

  const selectFrom = document.getElementById('tx-from-account');
  const selectTo = document.getElementById('tx-to-account');

  const clientFields = document.getElementById('group-client-fields');
  const saleFields = document.getElementById('group-sale-fields');
  const clientMode = document.getElementById('tx-client-mode').value;
  const groupClientExisting = document.getElementById('group-client-existing');
  const groupClientNew = document.getElementById('group-client-new');

  const selectClientId = document.getElementById('tx-client-id');
  const inputClientName = document.getElementById('tx-client-name');

  if (type === 'sale' || selectTo.value === 'CLIENT_SELECT') {
    if (type !== 'sale') {
      document.getElementById('tx-type').value = 'sale';
    }
    if (selectTo.value !== 'CLIENT_SELECT') {
      selectTo.value = 'CLIENT_SELECT';
    }

    fromGroup.classList.remove('hidden');
    toGroup.classList.remove('hidden');
    selectFrom.required = true;
    selectTo.required = true;

    clientFields.classList.remove('hidden');
    saleFields.classList.remove('hidden');

    if (clientMode === 'existing') {
      groupClientExisting.classList.remove('hidden');
      groupClientNew.classList.add('hidden');
      selectClientId.required = true;
      inputClientName.required = false;
    } else {
      groupClientExisting.classList.add('hidden');
      groupClientNew.classList.remove('hidden');
      selectClientId.required = false;
      inputClientName.required = true;
    }
  } else {
    clientFields.classList.add('hidden');
    saleFields.classList.add('hidden');
    selectClientId.required = false;
    inputClientName.required = false;

    if (type === 'transfer' || type === 'fill_account') {
      fromGroup.classList.remove('hidden');
      toGroup.classList.remove('hidden');
      selectFrom.required = true;
      selectTo.required = true;
    } else if (type === 'adjust_add') {
      fromGroup.classList.add('hidden');
      toGroup.classList.remove('hidden');
      selectFrom.required = false;
      selectTo.required = true;
    } else if (type === 'adjust_sub') {
      fromGroup.classList.remove('hidden');
      toGroup.classList.add('hidden');
      selectFrom.required = true;
      selectTo.required = false;
    }
  }
}

document.getElementById('tx-type').addEventListener('change', () => {
  updateFormFieldsVisibility();
  updateStockFeedback();
});
document.getElementById('tx-client-mode').addEventListener('change', updateFormFieldsVisibility);
document.getElementById('tx-from-account').addEventListener('change', updateStockFeedback);
document.getElementById('tx-to-account').addEventListener('change', () => {
  const selectTo = document.getElementById('tx-to-account');
  const type = document.getElementById('tx-type').value;
  if (selectTo.value === 'CLIENT_SELECT') {
    document.getElementById('tx-type').value = 'sale';
  } else if (type === 'sale') {
    document.getElementById('tx-type').value = 'transfer';
  }
  updateFormFieldsVisibility();
  updateStockFeedback();
});

document.getElementById('tx-bags-count').addEventListener('input', (e) => {
  let N = parseInt(e.target.value);
  if (isNaN(N) || N < 1) N = 1;
  if (N > 15) N = 15;

  const currentLength = STATE.bags.length;
  if (N > currentLength) {
    const diff = N - currentLength;
    for (let i = 0; i < diff; i++) {
      STATE.bags.push({
        id: currentLength + i + 1,
        isHalf: false,
        itemIdA: '',
        itemIdB: '',
        isDelivered: false
      });
    }
  } else if (N < currentLength) {
    STATE.bags = STATE.bags.slice(0, N);
  }

  renderBagsSection();
  updateStockFeedback();
});

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('tx-type').value;
  const fromAccountId = document.getElementById('tx-from-account').value;
  const toAccountId = document.getElementById('tx-to-account').value;
  const helperId = document.getElementById('tx-helper').value;
  const notes = document.getElementById('tx-notes').value.trim();

  const errEl = document.getElementById('tx-error');
  const succEl = document.getElementById('tx-success');

  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  const deliveredBags = STATE.bags.filter(b => b.isDelivered);
  if (deliveredBags.length === 0) {
    errEl.textContent = 'Nenhuma Bag foi marcada como entregue! Marque as bags entregues na partida antes de finalizar.';
    errEl.classList.remove('hidden');
    return;
  }

  // Validate that all delivered bags have their items selected
  for (const bag of deliveredBags) {
    if (!bag.itemIdA || (bag.isHalf && !bag.itemIdB)) {
      errEl.textContent = `A Bag ${bag.id} marcada como entregue está com itens incompletos.`;
      errEl.classList.remove('hidden');
      return;
    }
  }

  // Group items to submit
  const itemQuantities = {};
  deliveredBags.forEach(bag => {
    if (bag.isHalf) {
      itemQuantities[bag.itemIdA] = (itemQuantities[bag.itemIdA] || 0) + 13;
      itemQuantities[bag.itemIdB] = (itemQuantities[bag.itemIdB] || 0) + 13;
    } else {
      itemQuantities[bag.itemIdA] = (itemQuantities[bag.itemIdA] || 0) + 26;
    }
  });

  const itemsToSubmit = Object.entries(itemQuantities).map(([itemId, quantity]) => ({
    itemId: parseInt(itemId),
    quantity
  }));

  try {
    let clientId = null;
    let newClientName = null;
    let saleValue = null;
    let saleCurrency = null;
    let reduceStock = false;

    if (type === 'sale') {
      const clientMode = document.getElementById('tx-client-mode').value;
      if (clientMode === 'existing') {
        clientId = document.getElementById('tx-client-id').value;
        if (!clientId) {
          errEl.textContent = 'Por favor, selecione um cliente cadastrado.';
          errEl.classList.remove('hidden');
          return;
        }
      } else {
        newClientName = document.getElementById('tx-client-name').value.trim();
        if (!newClientName) {
          errEl.textContent = 'Por favor, digite o nome / ID do novo cliente.';
          errEl.classList.remove('hidden');
          return;
        }
      }
      saleValue = document.getElementById('tx-sale-value').value;
      saleCurrency = document.getElementById('tx-sale-currency').value;
      reduceStock = document.getElementById('tx-reduce-stock').checked;
    }

    // Submit a transaction for each unique item type
    for (let i = 0; i < itemsToSubmit.length; i++) {
      const itemData = itemsToSubmit[i];
      const payload = {
        type,
        itemId: itemData.itemId,
        quantity: itemData.quantity,
        fromAccountId: type !== 'adjust_add' ? fromAccountId : null,
        toAccountId: (type !== 'adjust_sub' && toAccountId !== 'CLIENT_SELECT') ? toAccountId : null,
        helperId: helperId || null,
        notes
      };

      if (type === 'sale') {
        if (clientId) {
          payload.clientId = clientId;
        } else {
          payload.newClientName = newClientName;
        }
        // Allocate full saleValue to the first item transaction, and 0 to subsequent item transactions
        payload.saleValue = i === 0 ? saleValue : 0;
        payload.saleCurrency = saleCurrency;
        payload.reduceStock = reduceStock;
      }

      await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    succEl.textContent = 'Entrega de remessa finalizada com sucesso!';
    succEl.classList.remove('hidden');
    document.getElementById('transaction-form').reset();
    updateFormFieldsVisibility();
    await loadTransferFormOptions(); // Recarregar dropdown para listar novos clientes
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ================= LÓGICA DE HISTÓRICO DE MOVIMENTAÇÕES =================
async function loadHistoryData() {
  try {
    const list = await apiFetch('/api/transactions');
    STATE.currentTransactions = list; // Cache local para edições
    renderHistoryTable(list);
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
  }
}

function renderHistoryTable(transactions) {
  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  const filterSearch = document.getElementById('history-search').value.toLowerCase();
  const filterType = document.getElementById('filter-tx-type').value;
  const isAdmin = STATE.user && STATE.user.role === 'admin';

  const filtered = transactions.filter(tx => {
    const textMatch = 
      tx.item_name.toLowerCase().includes(filterSearch) ||
      tx.operator_name.toLowerCase().includes(filterSearch) ||
      (tx.from_account_name && tx.from_account_name.toLowerCase().includes(filterSearch)) ||
      (tx.to_account_name && tx.to_account_name.toLowerCase().includes(filterSearch)) ||
      (tx.client_name && tx.client_name.toLowerCase().includes(filterSearch)) ||
      (tx.notes && tx.notes.toLowerCase().includes(filterSearch));

    const typeMatch = !filterType || tx.type === filterType;
    return textMatch && typeMatch;
  });

  const colspan = isAdmin ? 10 : 9;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted" style="padding: 20px;">Nenhuma transação localizada no histórico.</td></tr>`;
    return;
  }

  // Toggle "Ações" header column visibility based on role
  const actionsHeader = document.querySelector('#history-table thead th.admin-only');
  if (actionsHeader) {
    if (isAdmin) {
      actionsHeader.classList.remove('hidden');
    } else {
      actionsHeader.classList.add('hidden');
    }
  }

  filtered.forEach(tx => {
    const tr = document.createElement('tr');
    const dateStr = new Date(tx.timestamp).toLocaleString('pt-BR');
    
    let badge = '';
    let destHtml = '';
    let fromHtml = '';
    
    if (tx.type === 'transfer') {
      badge = '<span class="badge-type badge-type-transfer">Transferência</span>';
      destHtml = tx.to_account_name ? escapeHtml(tx.to_account_name) : '<span class="text-muted">-</span>';
      fromHtml = tx.from_account_name ? escapeHtml(tx.from_account_name) : '<span class="text-muted">-</span>';
    } else if (tx.type === 'fill_account') {
      badge = '<span class="badge-type badge-type-fill">Encher Conta</span>';
      destHtml = tx.to_account_name ? escapeHtml(tx.to_account_name) : '<span class="text-muted">-</span>';
      fromHtml = tx.from_account_name ? escapeHtml(tx.from_account_name) : '<span class="text-muted">-</span>';
    } else if (tx.type === 'adjust_add') {
      badge = '<span class="badge-type badge-type-add">Entrada (Farm)</span>';
      destHtml = tx.to_account_name ? escapeHtml(tx.to_account_name) : '<span class="text-muted">-</span>';
      fromHtml = '<span class="text-muted">-</span>';
    } else if (tx.type === 'adjust_sub') {
      badge = '<span class="badge-type badge-type-sub">Saída (Ajuste)</span>';
      destHtml = '<span class="text-muted">-</span>';
      fromHtml = tx.from_account_name ? escapeHtml(tx.from_account_name) : '<span class="text-muted">-</span>';
    } else if (tx.type === 'sale') {
      badge = '<span class="badge-type" style="background: rgba(168, 85, 247, 0.15); color: #D8B4FE;">Venda</span>';
      const valStr = tx.sale_value !== null ? (tx.sale_currency === 'USD' ? `$ ${tx.sale_value.toFixed(2)}` : `R$ ${tx.sale_value.toFixed(2)}`) : 'Consolidada';
      destHtml = `Cliente: <strong>${escapeHtml(tx.client_name)}</strong><br/><span style="font-size: 11px; color: var(--primary); font-weight: 600; display: inline-block; margin-top: 2px;">${valStr}</span>`;
      const stockStatus = tx.reduce_stock 
        ? '<span style="color:var(--status-banned); font-size:9px; display:block; margin-top:2px;">(Estoq. Deduzido)</span>' 
        : '<span style="color:var(--text-muted); font-size:9px; display:block; margin-top:2px;">(Estoq. Preservado)</span>';
      fromHtml = `${tx.from_account_name ? escapeHtml(tx.from_account_name) : '<span class="text-muted">-</span>'}${stockStatus}`;
    }

    let actionsCell = '';
    if (isAdmin) {
      actionsCell = `
        <td class="text-right admin-only" style="white-space: nowrap;">
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;" onclick="openEditTxModal(${tx.id})">
            <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i> Editar
          </button>
          <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; color: var(--status-banned); border-color: var(--status-banned); display: inline-flex; align-items: center; gap: 4px;" onclick="deleteHistoryTransaction(${tx.id})">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Excluir
          </button>
        </td>
      `;
    }

    tr.innerHTML = `
      <td style="white-space: nowrap;">${dateStr}</td>
      <td>${badge}</td>
      <td><strong>${escapeHtml(tx.item_name)}</strong></td>
      <td class="text-right" style="color: var(--primary); font-weight: 600;">${tx.quantity}</td>
      <td>${fromHtml}</td>
      <td>${destHtml}</td>
      <td>${escapeHtml(tx.operator_name)}</td>
      <td>${tx.helper_name ? escapeHtml(tx.helper_name) : '<span class="text-muted">Apenas operador</span>'}</td>
      <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(tx.notes || '')}">
        ${escapeHtml(tx.notes || '-')}
      </td>
      ${actionsCell}
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

document.getElementById('history-search').addEventListener('input', () => {
  loadHistoryData();
});
document.getElementById('filter-tx-type').addEventListener('change', () => {
  loadHistoryData();
});

// ================= LÓGICA DE CONTAS DE JOGO =================
async function loadAccountsData() {
  try {
    const list = await apiFetch('/api/accounts');
    renderAccounts(list);
  } catch (err) {
    console.error('Erro ao carregar contas:', err);
  }
}

function renderAccounts(accounts) {
  const container = document.getElementById('accounts-cards-container');
  container.innerHTML = '';

  if (accounts.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px;" class="text-muted">Nenhuma conta cadastrada no sistema.</div>`;
    return;
  }

  accounts.forEach(acc => {
    const card = document.createElement('div');
    card.className = 'account-card';
    
    let statusClass = 'status-active';
    let statusText = 'Ativa';
    if (acc.status === 'inactive') {
      statusClass = 'status-inactive';
      statusText = 'Inativa';
    } else if (acc.status === 'banned') {
      statusClass = 'status-banned';
      statusText = 'Banida';
    }

    // Configurar badge do tipo de conta
    const typeClass = acc.type === 'cofre' ? 'badge-type-cofre' : 'badge-type-duper';
    const typeText = acc.type === 'cofre' ? 'Conta Cofre' : 'Conta Duper';

    const isAdmin = STATE.user.role === 'admin';
    const actionButtons = isAdmin ? `
      <div class="account-card-actions">
        <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;" onclick="editAccount(${acc.id})">
          <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i> Editar
        </button>
        <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; border-color: var(--status-banned); color: var(--status-banned);" onclick="deleteAccount(${acc.id})">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Excluir
        </button>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="account-card-header">
        <h3><i data-lucide="shield-check" style="color: var(--primary);"></i> ${escapeHtml(acc.name)}</h3>
        <div style="display: flex; gap: 6px;">
          <span class="badge-status ${typeClass}">${typeText}</span>
          <span class="badge-status ${statusClass}">${statusText}</span>
        </div>
      </div>
      <div class="account-credentials">
        <div class="credential-item">
          <strong>Acesso:</strong>
          <span class="credential-value" title="${escapeHtml(acc.login_method || '')}">${escapeHtml(acc.login_method || 'Não cadastrado')}</span>
        </div>
        <div class="credential-item">
          <strong>Token:</strong>
          <span class="credential-value" title="${escapeHtml(acc.token || '')}">${escapeHtml(acc.token || 'Nenhum')}</span>
        </div>
        <div class="credential-item" style="flex-direction: column; align-items: flex-start; gap: 4px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px; margin-top: 4px;">
          <strong>Notas:</strong>
          <span style="color: var(--text-muted); font-size: 12px; word-break: break-all;">${escapeHtml(acc.notes || 'Sem observações')}</span>
        </div>
      </div>
      ${actionButtons}
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

const accountModal = document.getElementById('account-modal');

document.getElementById('btn-new-account').addEventListener('click', () => {
  document.getElementById('account-modal-title').textContent = 'Cadastrar Nova Conta';
  document.getElementById('account-form').reset();
  document.getElementById('acc-id').value = '';
  document.getElementById('acc-error').classList.add('hidden');
  accountModal.classList.remove('hidden');
  lucide.createIcons();
});

function closeAccountModal() {
  accountModal.classList.add('hidden');
}

document.getElementById('btn-close-account-modal').addEventListener('click', closeAccountModal);
document.getElementById('btn-cancel-account-modal').addEventListener('click', closeAccountModal);

document.getElementById('account-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('acc-id').value;
  const name = document.getElementById('acc-name').value.trim();
  const login_method = document.getElementById('acc-login-method').value.trim();
  const token = document.getElementById('acc-token').value.trim();
  const status = document.getElementById('acc-status').value;
  const type = document.getElementById('acc-type').value;
  const notes = document.getElementById('acc-notes').value.trim();

  const errEl = document.getElementById('acc-error');
  errEl.classList.add('hidden');

  try {
    const payload = { name, login_method, token, status, type, notes };
    if (id) {
      await apiFetch(`/api/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch('/api/accounts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    closeAccountModal();
    loadAccountsData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

window.editAccount = async function(id) {
  try {
    const accounts = await apiFetch('/api/accounts');
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    document.getElementById('account-modal-title').textContent = 'Editar Conta';
    document.getElementById('acc-id').value = acc.id;
    document.getElementById('acc-name').value = acc.name;
    document.getElementById('acc-login-method').value = acc.login_method || '';
    document.getElementById('acc-token').value = acc.token || '';
    document.getElementById('acc-status').value = acc.status;
    document.getElementById('acc-type').value = acc.type || 'duper';
    document.getElementById('acc-notes').value = acc.notes || '';
    document.getElementById('acc-error').classList.add('hidden');

    accountModal.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao buscar dados da conta:', err);
  }
};

window.deleteAccount = async function(id) {
  if (!confirm('Tem certeza que deseja excluir esta conta permanentemente? Isso apagará também todo o seu estoque.')) {
    return;
  }

  try {
    await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
    loadAccountsData();
  } catch (err) {
    alert(err.message);
  }
};

// ================= LÓGICA DE CADASTRO DE ITENS (ADMIN ONLY) =================
async function loadItemsData() {
  try {
    const list = await apiFetch('/api/items');
    renderItemsTable(list);
  } catch (err) {
    console.error('Erro ao carregar itens:', err);
  }
}

function renderItemsTable(items) {
  const tbody = document.querySelector('#items-table tbody');
  tbody.innerHTML = '';

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding: 20px;">Nenhum item cadastrado.</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    const colorClass = item.color || 'gray';
    tr.innerHTML = `
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td><span class="item-badge badge-${colorClass}">${escapeHtml(item.category)}</span></td>
      <td class="text-right">
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px;" onclick="editItem(${item.id})">Editar</button>
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-color: var(--status-banned); color: var(--status-banned);" onclick="deleteItem(${item.id})">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('item-id').value;
  const name = document.getElementById('item-name').value.trim();
  const category = document.getElementById('item-category').value.trim();
  const color = document.getElementById('item-color').value;

  const errEl = document.getElementById('item-error');
  const succEl = document.getElementById('item-success');

  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  try {
    const payload = { name, category, color };
    if (id) {
      await apiFetch(`/api/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      succEl.textContent = 'Item atualizado com sucesso!';
    } else {
      await apiFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      succEl.textContent = 'Item adicionado com sucesso!';
    }

    succEl.classList.remove('hidden');
    cancelItemEdit();
    loadItemsData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

window.editItem = async function(id) {
  try {
    const items = await apiFetch('/api/items');
    const item = items.find(i => i.id === id);
    if (!item) return;

    document.getElementById('item-form-title').innerHTML = `<i data-lucide="edit-3"></i> Editar Item`;
    document.getElementById('item-id').value = item.id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category;
    document.getElementById('item-color').value = item.color || 'gray';

    document.getElementById('btn-cancel-item-edit').classList.remove('hidden');
    document.getElementById('btn-submit-item').textContent = 'Salvar Alterações';
    
    document.getElementById('item-error').classList.add('hidden');
    document.getElementById('item-success').classList.add('hidden');
    
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao editar item:', err);
  }
};

function cancelItemEdit() {
  document.getElementById('item-form-title').innerHTML = `<i data-lucide="plus"></i> Novo Item`;
  document.getElementById('item-id').value = '';
  document.getElementById('item-form').reset();
  document.getElementById('item-color').value = 'gray';
  
  document.getElementById('btn-cancel-item-edit').classList.add('hidden');
  document.getElementById('btn-submit-item').textContent = 'Salvar Item';
  
  lucide.createIcons();
}

document.getElementById('btn-cancel-item-edit').addEventListener('click', cancelItemEdit);

window.deleteItem = async function(id) {
  if (!confirm('Excluir este item apagará permanentemente todo o estoque dele em todas as contas. Confirmar?')) {
    return;
  }

  try {
    await apiFetch(`/api/items/${id}`, { method: 'DELETE' });
    loadItemsData();
  } catch (err) {
    alert(err.message);
  }
};

// ================= LÓGICA DE GERENCIAMENTO DE EQUIPE (ADMIN ONLY) =================
async function loadTeamData() {
  try {
    const list = await apiFetch('/api/users');
    renderTeamTable(list);
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
  }
}

function renderTeamTable(users) {
  const tbody = document.querySelector('#team-table tbody');
  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    const dateStr = new Date(u.created_at).toLocaleString('pt-BR');
    const isSelf = u.id === STATE.user.id;

    let actionButtons = '';
    if (isSelf) {
      actionButtons = '<span class="text-muted" style="font-size:12px;">(Você)</span>';
    } else {
      const loginsBtn = u.role === 'operator'
        ? `<button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; margin-right: 6px; border-color: var(--secondary); color: var(--secondary);" onclick="openOperatorLoginsModal(${u.id}, '${escapeHtml(u.username)}')">
             Logins
           </button>`
        : '';

      actionButtons = `
        ${loginsBtn}
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; margin-right: 6px; border-color: var(--primary); color: var(--primary);" onclick="openEditUserModal(${u.id})">
           Editar
        </button>
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-color: var(--status-banned); color: var(--status-banned);" onclick="deleteUser(${u.id})">
           Excluir
        </button>
      `;
    }

    const roleClass = u.role === 'admin' ? 'status-active' : 'status-inactive';
    const roleLabel = u.role === 'admin' ? 'Administrador' : 'Operador (Duper)';
    
    // Adicionar exibição da meta e ganho para os operadores
    const metaDetails = u.role === 'operator' 
      ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Comissão: R$ ${u.payment_per_register.toFixed(2)} | Meta: ${u.daily_goal} conta(s) cheia(s)/dia (${u.daily_goal * Math.ceil(280/26)} runs)</div>` 
      : '';

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(u.username)}</strong>
        ${metaDetails}
      </td>
      <td>${escapeHtml(u.nickname || '-')}</td>
      <td><span class="badge-status ${roleClass}">${roleLabel}</span></td>
      <td>${dateStr}</td>
      <td class="text-right">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal de Edição de Membro da Equipe (Admin Only)
const userEditModal = document.getElementById('user-edit-modal');
const editUserRoleSelect = document.getElementById('edit-user-role');
const editUserOperatorFields = document.getElementById('edit-user-operator-fields');

if (editUserRoleSelect) {
  editUserRoleSelect.addEventListener('change', () => {
    if (editUserRoleSelect.value === 'admin') {
      editUserOperatorFields.classList.add('hidden');
    } else {
      editUserOperatorFields.classList.remove('hidden');
    }
  });
}

window.openEditUserModal = async function(id) {
  try {
    const users = await apiFetch('/api/users');
    const u = users.find(user => user.id === id);
    if (!u) return;

    document.getElementById('edit-user-id-field').value = u.id;
    document.getElementById('edit-user-username').value = u.username;
    document.getElementById('edit-user-nickname').value = u.nickname || '';
    document.getElementById('edit-user-password').value = ''; // campo de senha vazio por padrão
    document.getElementById('edit-user-role').value = u.role;
    document.getElementById('edit-user-payment').value = u.payment_per_register !== null && u.payment_per_register !== undefined ? u.payment_per_register : 2.50;
    document.getElementById('edit-user-goal').value = u.daily_goal || 1;

    if (u.role === 'admin') {
      editUserOperatorFields.classList.add('hidden');
    } else {
      editUserOperatorFields.classList.remove('hidden');
    }

    document.getElementById('edit-user-error-msg').classList.add('hidden');
    userEditModal.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao buscar membro da equipe:', err);
  }
};

function closeUserEditModal() {
  userEditModal.classList.add('hidden');
}

if (document.getElementById('btn-close-user-edit-modal')) {
  document.getElementById('btn-close-user-edit-modal').addEventListener('click', closeUserEditModal);
}
if (document.getElementById('btn-cancel-user-edit-modal')) {
  document.getElementById('btn-cancel-user-edit-modal').addEventListener('click', closeUserEditModal);
}

const userEditForm = document.getElementById('user-edit-form');
if (userEditForm) {
  userEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-user-id-field').value;
    const username = document.getElementById('edit-user-username').value.trim();
    const nickname = document.getElementById('edit-user-nickname').value.trim();
    const password = document.getElementById('edit-user-password').value;
    const role = document.getElementById('edit-user-role').value;
    const payment = document.getElementById('edit-user-payment').value;
    const goal = document.getElementById('edit-user-goal').value;

    const errEl = document.getElementById('edit-user-error-msg');
    errEl.classList.add('hidden');

    try {
      const body = {
        username,
        nickname: nickname || null,
        role,
        password: password || undefined
      };
      if (role === 'operator') {
        body.payment_per_register = payment !== '' ? parseFloat(payment) : 0;
        body.daily_goal = goal !== '' ? parseInt(goal) : 1;
      }

      await apiFetch(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      closeUserEditModal();
      loadTeamData();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameVal = document.getElementById('new-username').value.trim();
  const nicknameVal = document.getElementById('new-nickname').value.trim();
  const passwordVal = document.getElementById('new-password').value;
  const roleVal = document.getElementById('new-role').value;

  const errEl = document.getElementById('user-error');
  const succEl = document.getElementById('user-success');

  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  try {
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ 
        username: usernameVal, 
        nickname: nicknameVal || null, 
        password: passwordVal, 
        role: roleVal 
      })
    });

    succEl.textContent = 'Membro da equipe adicionado com sucesso!';
    succEl.classList.remove('hidden');
    document.getElementById('user-form').reset();
    loadTeamData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

window.deleteUser = async function(id) {
  if (!confirm('Tem certeza que deseja excluir o acesso deste membro da equipe?')) {
    return;
  }

  try {
    await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    loadTeamData();
  } catch (err) {
    alert(err.message);
  }
};

// ================= LÓGICA DE CLIENTES =================
async function loadClientsData() {
  try {
    const clients = await apiFetch('/api/clients');
    STATE.clients = clients;
    renderClients(clients);
    
    // Se houver cliente selecionado ativo, recarrega os dados dele
    if (STATE.activeClientId) {
      selectClient(STATE.activeClientId);
    } else {
      resetClientDetailsPanel();
    }
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
  }
}

function renderClients(clients) {
  const tbody = document.getElementById('clients-list-body');
  tbody.innerHTML = '';

  const searchVal = document.getElementById('client-search').value.toLowerCase();
  const filtered = clients.filter(c => c.name.toLowerCase().includes(searchVal));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td class="text-center text-muted" style="padding: 20px;">Nenhum cliente.</td></tr>`;
    return;
  }

  filtered.forEach(c => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (STATE.activeClientId === c.id) {
      tr.style.background = 'rgba(168, 85, 247, 0.1)';
      tr.style.borderLeft = '3px solid var(--secondary)';
    }
    
    tr.innerHTML = `<td><strong>${escapeHtml(c.name)}</strong></td>`;
    
    tr.addEventListener('click', () => {
      STATE.activeClientId = c.id;
      // Re-renderizar lista para marcar a linha ativa
      renderClients(clients);
      selectClient(c.id);
    });
    
    tbody.appendChild(tr);
  });
}

async function selectClient(id) {
  try {
    const details = await apiFetch(`/api/clients/${id}`);
    renderClientDetails(details);
  } catch (err) {
    console.error('Erro ao buscar dados do cliente:', err);
  }
}

function resetClientDetailsPanel() {
  const container = document.getElementById('client-details-body');
  container.innerHTML = `
    <div class="text-center text-muted" style="padding: 60px 0;">
      <i data-lucide="user" style="width: 48px; height: 48px; opacity: 0.3; margin-bottom: 10px;"></i>
      <p>Selecione um cliente na lista para ver suas estatísticas de compras e histórico de pedidos.</p>
    </div>
  `;
  lucide.createIcons();
}

function renderClientDetails(data) {
  const container = document.getElementById('client-details-body');
  container.innerHTML = '';

  const { client, stats, itemsPurchased, history } = data;

  const dateCreated = new Date(client.created_at).toLocaleDateString('pt-BR');
  const lastOrderDate = stats.last_order_date 
    ? new Date(stats.last_order_date).toLocaleString('pt-BR') 
    : 'Nenhum pedido realizado';

  const usdTotal = stats.total_usd.toFixed(2);
  const brlTotal = stats.total_brl.toFixed(2);
  const ticketBrl = (stats.ticket_medio_brl || 0).toFixed(2);
  const ticketUsd = (stats.ticket_medio_usd || 0).toFixed(2);

  const isAdmin = STATE.user && STATE.user.role === 'admin';

  container.innerHTML = `
    <div class="client-info-header" style="margin-bottom: 24px; border-bottom: 1px dashed rgba(255,255,255,0.08); padding-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="font-family: var(--font-family-brand); color: var(--text-main); font-size: 22px; margin: 0;">
          <i data-lucide="user" style="color: var(--secondary); vertical-align: middle; margin-right: 6px;"></i> ${escapeHtml(client.name)}
        </h2>
        <span style="font-size: 12px; color: var(--text-muted);">Membro desde: ${dateCreated}</span>
      </div>
      ${isAdmin ? `
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="editClient(${client.id}, '${escapeHtml(client.name).replace(/'/g, "\\'")}')" style="padding: 6px 12px; font-size: 12px; height: 32px; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="edit-3" style="width: 14px; height: 14px; margin-right: 4px;"></i> Editar
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient(${client.id}, '${escapeHtml(client.name).replace(/'/g, "\\'")}')" style="padding: 6px 12px; font-size: 12px; height: 32px; background: var(--status-banned); border-color: var(--status-banned); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="trash-2" style="width: 14px; height: 14px; margin-right: 4px;"></i> Excluir
          </button>
        </div>
      ` : ''}
    </div>

    <!-- Estatísticas Principais -->
    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 24px;">
      <div class="stat-card" style="padding: 15px; gap: 6px; background: rgba(0,0,0,0.15);">
        <span class="stat-title" style="font-size: 11px;">Renda em Reais</span>
        <div style="font-size: 18px; font-weight: 700; color: var(--primary);">R$ ${brlTotal}</div>
      </div>
      <div class="stat-card" style="padding: 15px; gap: 6px; background: rgba(0,0,0,0.15);">
        <span class="stat-title" style="font-size: 11px;">Renda em Dólar</span>
        <div style="font-size: 18px; font-weight: 700; color: #34D399;">$ ${usdTotal}</div>
      </div>
      <div class="stat-card" style="padding: 15px; gap: 6px; background: rgba(0,0,0,0.15);">
        <span class="stat-title" style="font-size: 11px;">Ticket Médio (BRL)</span>
        <div style="font-size: 18px; font-weight: 700; color: var(--primary);">R$ ${ticketBrl} <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">/bag</span></div>
      </div>
      <div class="stat-card" style="padding: 15px; gap: 6px; background: rgba(0,0,0,0.15);">
        <span class="stat-title" style="font-size: 11px;">Ticket Médio (USD)</span>
        <div style="font-size: 18px; font-weight: 700; color: #34D399;">$ ${ticketUsd} <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">/bag</span></div>
      </div>
      <div class="stat-card" style="padding: 15px; gap: 6px; background: rgba(0,0,0,0.15);">
        <span class="stat-title" style="font-size: 11px;">Pedidos Feitos</span>
        <div style="font-size: 18px; font-weight: 700;">${stats.total_orders}</div>
      </div>
      <div class="stat-card" style="padding: 15px; gap: 6px; background: rgba(0,0,0,0.15);">
        <span class="stat-title" style="font-size: 11px;">Itens Comprados</span>
        <div style="font-size: 18px; font-weight: 700;">${stats.total_items}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
      <!-- Detalhes dos Itens Comprados -->
      <div class="dashboard-panel" style="background: rgba(0,0,0,0.1);">
        <div class="panel-header" style="padding: 12px 16px;">
          <h4 style="font-size: 14px; font-weight: 600;"><i data-lucide="shopping-bag" style="width: 14px; height: 14px; margin-right: 6px; vertical-align: middle;"></i> Itens Adquiridos</h4>
        </div>
        <div class="panel-body" style="padding: 15px; max-height: 200px; overflow-y: auto;">
          <table class="data-table" style="font-size: 12px;">
            <thead>
              <tr>
                <th>Recurso</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsPurchased.map(i => `
                <tr>
                  <td><strong>${escapeHtml(i.item_name)}</strong></td>
                  <td class="text-right" style="color: var(--primary); font-weight: 600;">${i.total_qty}</td>
                </tr>
              `).join('')}
              ${itemsPurchased.length === 0 ? '<tr><td colspan="2" class="text-center text-muted">Nenhum item comprado.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detalhes de Último Pedido -->
      <div class="dashboard-panel" style="background: rgba(0,0,0,0.1); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px;">
        <i data-lucide="clock" style="width: 24px; height: 24px; color: var(--secondary); margin-bottom: 10px;"></i>
        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 6px;">Último Pedido Realizado</h4>
        <div style="font-size: 13px; color: var(--text-main); font-weight: 500; margin-bottom: 4px;">${lastOrderDate}</div>
      </div>
    </div>

    <!-- Histórico Completo do Cliente -->
    <div class="dashboard-panel" style="background: rgba(0,0,0,0.1);">
      <div class="panel-header" style="padding: 12px 16px;">
        <h4 style="font-size: 14px; font-weight: 600;"><i data-lucide="history" style="width: 14px; height: 14px; margin-right: 6px; vertical-align: middle;"></i> Histórico de Compras</h4>
      </div>
      <div class="panel-body" style="padding: 15px; max-height: 250px; overflow-y: auto;">
        <table class="data-table" style="font-size: 12px;">
          <thead>
            <tr>
              <th>Data</th>
              <th>Item</th>
              <th class="text-right">Qtd</th>
              <th class="text-right">Valor</th>
              <th>Origem</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => {
              const valStr = h.sale_currency === 'USD' ? `$ ${h.sale_value.toFixed(2)}` : `R$ ${h.sale_value.toFixed(2)}`;
              const stockLabel = h.reduce_stock 
                ? '<span style="color:var(--status-banned); font-size: 8px;">(Deduzido)</span>' 
                : '<span style="color:var(--text-muted); font-size: 8px;">(Preservado)</span>';
              return `
                <tr>
                  <td style="white-space: nowrap;">${new Date(h.timestamp).toLocaleDateString('pt-BR')}</td>
                  <td><strong>${escapeHtml(h.item_name)}</strong></td>
                  <td class="text-right">${h.quantity}</td>
                  <td class="text-right" style="color: var(--primary); font-weight: 600;">${valStr}</td>
                  <td>${escapeHtml(h.from_account_name || '-')} ${stockLabel}</td>
                  <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(h.notes || '')}">${escapeHtml(h.notes || '-')}</td>
                </tr>
              `;
            }).join('')}
            ${history.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Sem histórico.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  lucide.createIcons();
}

// Escutador para campo de busca de clientes
document.getElementById('client-search').addEventListener('input', () => {
  renderClients(STATE.clients);
});

window.editClient = async function(id, currentName) {
  const newName = prompt('Digite o novo nome para o cliente:', currentName);
  if (newName === null) return; // Cancelado
  if (!newName.trim()) {
    alert('Nome do cliente não pode ser vazio.');
    return;
  }
  try {
    await apiFetch(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName.trim() })
    });
    alert('Cliente atualizado com sucesso.');
    await loadClientsData();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteClient = async function(id, clientName) {
  if (!confirm(`Tem certeza que deseja excluir o cliente "${clientName}"?\nO histórico de compras dele será preservado.`)) {
    return;
  }
  try {
    await apiFetch(`/api/clients/${id}`, {
      method: 'DELETE'
    });
    alert('Cliente removido com sucesso.');
    if (STATE.activeClientId === id) {
      STATE.activeClientId = null;
    }
    await loadClientsData();
  } catch (err) {
    alert(err.message);
  }
};

// ================= CONTROLE DE XSS (ESCAPE HTML) =================
function escapeHtml(string) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(string).replace(/[&<>"']/g, function(m) { return map[m]; });
}

// ================= AJUSTE MANUAL DE ESTOQUE (ADMIN ONLY) =================
const stockAdjustModal = document.getElementById('stock-adjust-modal');

window.openStockAdjustModal = function(accountId, accountName, itemId, itemName, currentQty) {
  document.getElementById('adjust-account-id').value = accountId;
  document.getElementById('adjust-item-id').value = itemId;
  document.getElementById('adjust-account-name').value = accountName;
  document.getElementById('adjust-item-name').value = itemName;
  document.getElementById('adjust-new-qty').value = currentQty;
  document.getElementById('adjust-stock-error').classList.add('hidden');

  stockAdjustModal.classList.remove('hidden');
  lucide.createIcons();
};

function closeStockAdjustModal() {
  stockAdjustModal.classList.add('hidden');
}

document.getElementById('btn-close-stock-adjust-modal').addEventListener('click', closeStockAdjustModal);
document.getElementById('btn-cancel-stock-adjust-modal').addEventListener('click', closeStockAdjustModal);

document.getElementById('stock-adjust-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const accountId = document.getElementById('adjust-account-id').value;
  const itemId = document.getElementById('adjust-item-id').value;
  const newQuantity = document.getElementById('adjust-new-qty').value;

  const errEl = document.getElementById('adjust-stock-error');
  errEl.classList.add('hidden');

  try {
    await apiFetch('/api/inventory/manual', {
      method: 'POST',
      body: JSON.stringify({ accountId, itemId, newQuantity })
    });
    closeStockAdjustModal();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ================= DRAG AND DROP LÓGICA =================
let dragSourceEl = null;

function handleRowDragStart(e) {
  dragSourceEl = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleRowDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  const draggingRow = document.querySelector('.dragging');
  const targetRow = this;
  if (draggingRow && targetRow && draggingRow !== targetRow) {
    const parent = targetRow.parentNode;
    const bounding = targetRow.getBoundingClientRect();
    const offset = e.clientY - bounding.top;
    if (offset > bounding.height / 2) {
      parent.insertBefore(draggingRow, targetRow.nextSibling);
    } else {
      parent.insertBefore(draggingRow, targetRow);
    }
  }
  return false;
}

function handleRowDragEnd(e) {
  this.classList.remove('dragging');
  saveItemOrderFromDOM();
}

function handleCardDragStart(e) {
  dragSourceEl = this;
  this.classList.add('dragging-card');
  e.dataTransfer.effectAllowed = 'move';
}

function handleCardDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  const draggingCard = document.querySelector('.dragging-card');
  const targetCard = this;
  if (draggingCard && targetCard && draggingCard !== targetCard) {
    const parent = targetCard.parentNode;
    const bounding = targetCard.getBoundingClientRect();
    const offset = e.clientX - bounding.left;
    if (offset > bounding.width / 2) {
      parent.insertBefore(draggingCard, targetCard.nextSibling);
    } else {
      parent.insertBefore(draggingCard, targetCard);
    }
  }
  return false;
}

function handleCardDragEnd(e) {
  this.classList.remove('dragging-card');
  saveItemOrderFromCardsDOM();
}

function saveItemOrderFromDOM() {
  const rows = document.querySelectorAll('#detailed-stock-body tr');
  const order = [];
  rows.forEach(row => {
    const itemId = row.getAttribute('data-item-id');
    if (itemId) {
      order.push(parseInt(itemId, 10));
    }
  });
  if (order.length > 0 && STATE.user) {
    localStorage.setItem(`item_order_${STATE.user.username}`, JSON.stringify(order));
    loadStockDataSilent();
  }
}

function saveItemOrderFromCardsDOM() {
  const cards = document.querySelectorAll('#consolidated-stock-cards .stock-item-card');
  const order = [];
  cards.forEach(card => {
    const itemId = card.getAttribute('data-item-id');
    if (itemId) {
      order.push(parseInt(itemId, 10));
    }
  });
  if (order.length > 0 && STATE.user) {
    localStorage.setItem(`item_order_${STATE.user.username}`, JSON.stringify(order));
    loadStockDataSilent();
  }
}

async function loadStockDataSilent() {
  try {
    const stock = await apiFetch('/api/inventory');
    const details = await apiFetch('/api/inventory/details');
    const items = await apiFetch('/api/items');
    const accounts = await apiFetch('/api/accounts');

    STATE.items = items;
    STATE.accounts = accounts;
  } catch (err) {
    console.error('Erro silent stock fetch:', err);
  }
}

// Botão toggle de Ordenação
document.getElementById('btn-toggle-reorder').addEventListener('click', () => {
  STATE.reorderMode = !STATE.reorderMode;
  const btn = document.getElementById('btn-toggle-reorder');
  if (STATE.reorderMode) {
    btn.className = 'btn btn-primary';
    btn.style.background = 'linear-gradient(135deg, var(--secondary) 0%, #a855f7 100%)';
    btn.style.borderColor = 'var(--secondary)';
    btn.style.color = '#fff';
    btn.innerHTML = `<i data-lucide="check"></i> Concluir`;
  } else {
    btn.className = 'btn btn-outline';
    btn.style.background = 'transparent';
    btn.style.borderColor = 'var(--secondary)';
    btn.style.color = 'var(--secondary)';
    btn.innerHTML = `<i data-lucide="grip-vertical"></i> Organizar Itens`;
  }
  loadStockData();
});

// ================= LÓGICA DA ABA FINANCEIRA (ADMIN ONLY) =================
async function loadFinanceData() {
  try {
    const stats = await apiFetch('/api/finance/stats');
    const cashflow = await apiFetch('/api/finance/cashflow');

    // Render cash stats cards
    const summary = stats.cashSummary;
    document.getElementById('fin-net-consolidated-brl').textContent = formatBrl(summary.consolidatedBrl);
    document.getElementById('fin-net-brl').textContent = formatBrl(summary.netBrl);
    document.getElementById('fin-net-usd').textContent = formatUsd(summary.netUsd);

    // Tooltips/Sub-descriptions
    document.getElementById('fin-sales-brl-desc').innerHTML = `Vendas: ${formatBrl(summary.salesBrl)} | Entradas: ${formatBrl(summary.inflowBrl)} | Saídas: ${formatBrl(summary.outflowBrl)}`;
    document.getElementById('fin-sales-usd-desc').innerHTML = `Vendas: ${formatUsd(summary.salesUsd)} | Entradas: ${formatUsd(summary.inflowUsd)} | Saídas: ${formatUsd(summary.outflowUsd)}`;

    // Render operators table
    const opsBody = document.querySelector('#finance-operators-table tbody');
    opsBody.innerHTML = '';
    if (stats.operators.length === 0) {
      opsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum operador cadastrado.</td></tr>';
    } else {
      stats.operators.forEach(op => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHtml(op.username)}</strong></td>
          <td class="text-right">${parseFloat(op.total_runs.toFixed(2))}</td>
          <td class="text-right">${formatBrl(op.payment_per_register)}</td>
          <td class="text-right" style="color: var(--primary); font-weight: 600;">${formatBrl(op.total_earned)}</td>
        `;
        opsBody.appendChild(tr);
      });
    }

    // Render cashflow history table
    const cfBody = document.querySelector('#finance-cashflow-table tbody');
    cfBody.innerHTML = '';
    if (cashflow.length === 0) {
      cfBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 15px;">Nenhum lançamento de caixa registrado.</td></tr>';
    } else {
      cashflow.forEach(item => {
        const tr = document.createElement('tr');
        const dateStr = new Date(item.timestamp).toLocaleString('pt-BR');
        const amountFormatted = item.currency === 'USD' ? formatUsd(item.amount) : formatBrl(item.amount);
        const typeBadge = item.type === 'inflow' 
          ? '<span class="badge-type badge-type-add">Entrada</span>' 
          : '<span class="badge-type badge-type-sub">Saída</span>';

        tr.innerHTML = `
          <td>${dateStr}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${typeBadge}</td>
          <td class="text-right" style="font-weight:600; color:${item.type === 'inflow' ? 'var(--status-active)' : 'var(--status-banned)'}">${amountFormatted}</td>
          <td class="text-right">
            <button class="btn btn-outline" style="padding: 2px 6px; font-size:10px; color:var(--status-banned); border-color:var(--status-banned);" onclick="deleteCashflowEntry(${item.id})">
              <i data-lucide="trash-2" style="width:11px; height:11px;"></i>
            </button>
          </td>
        `;
        cfBody.appendChild(tr);
      });
    }
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao carregar dados financeiros:', err);
  }
}

// Format BRL/USD helper functions
function formatBrl(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}
function formatUsd(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

// Lançamento de Caixa
document.getElementById('cashflow-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const description = document.getElementById('cf-description').value.trim();
  const amount = document.getElementById('cf-amount').value;
  const currency = document.getElementById('cf-currency').value;
  const type = document.getElementById('cf-type').value;

  const errEl = document.getElementById('cf-error');
  const succEl = document.getElementById('cf-success');
  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  try {
    await apiFetch('/api/finance/cashflow', {
      method: 'POST',
      body: JSON.stringify({ description, amount, currency, type })
    });
    succEl.textContent = 'Lançamento financeiro registrado!';
    succEl.classList.remove('hidden');
    document.getElementById('cashflow-form').reset();
    await loadFinanceData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

window.deleteCashflowEntry = async function(id) {
  if (!confirm('Deseja realmente excluir este lançamento financeiro?')) return;
  try {
    const res = await apiFetch(`/api/finance/cashflow/${id}`, { method: 'DELETE' });
    alert(res.message);
    await loadFinanceData();
  } catch (err) {
    alert('Erro ao excluir: ' + err.message);
  }
};

// ================= LÓGICA DE EDIÇÃO E MODAL DE TRANSAÇÕES =================
window.openEditTxModal = async function(txId) {
  const tx = STATE.currentTransactions.find(t => t.id === txId);
  if (!tx) return;

  document.getElementById('edit-tx-id').value = tx.id;
  document.getElementById('edit-tx-summary').value = `${tx.item_name} | Qtd: ${tx.quantity} | Operação: ${tx.type}`;
  document.getElementById('edit-tx-notes').value = tx.notes || '';

  // Populate Helper dropdown
  const selectHelper = document.getElementById('edit-tx-helper');
  selectHelper.innerHTML = '<option value="">Ninguém (Apenas eu)</option>';
  try {
    const users = await apiFetch('/api/users');
    users.forEach(u => {
      if (u.id !== STATE.user.id) {
        selectHelper.innerHTML += `<option value="${u.id}" ${tx.helper_id === u.id ? 'selected' : ''}>${escapeHtml(u.username)}</option>`;
      }
    });
  } catch (err) {
    console.error('Erro ao carregar equipe para edição:', err);
  }

  // Toggle sale fields visibility
  const saleFields = document.getElementById('edit-tx-sale-fields');
  if (tx.type === 'sale') {
    saleFields.classList.remove('hidden');
    const selectClient = document.getElementById('edit-tx-client-id');
    selectClient.innerHTML = '';
    try {
      const clients = await apiFetch('/api/clients');
      clients.forEach(c => {
        selectClient.innerHTML += `<option value="${c.id}" ${tx.client_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`;
      });
    } catch (err) {
      console.error('Erro ao carregar clientes para edição:', err);
    }
    document.getElementById('edit-tx-sale-value').value = tx.sale_value !== null ? tx.sale_value : '';
    document.getElementById('edit-tx-sale-currency').value = tx.sale_currency || 'BRL';
  } else {
    saleFields.classList.add('hidden');
  }

  document.getElementById('edit-tx-error').classList.add('hidden');
  document.getElementById('edit-tx-modal').classList.remove('hidden');
  lucide.createIcons();
};

function closeEditTxModal() {
  document.getElementById('edit-tx-modal').classList.add('hidden');
}
document.getElementById('btn-close-edit-tx-modal').addEventListener('click', closeEditTxModal);
document.getElementById('btn-cancel-edit-tx-modal').addEventListener('click', closeEditTxModal);

document.getElementById('edit-tx-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-tx-id').value;
  const notes = document.getElementById('edit-tx-notes').value.trim();
  const helperId = document.getElementById('edit-tx-helper').value;

  const payload = { notes, helperId: helperId || null };

  const saleFields = document.getElementById('edit-tx-sale-fields');
  if (!saleFields.classList.contains('hidden')) {
    payload.clientId = document.getElementById('edit-tx-client-id').value;
    payload.saleValue = document.getElementById('edit-tx-sale-value').value;
    payload.saleCurrency = document.getElementById('edit-tx-sale-currency').value;
  }

  const errEl = document.getElementById('edit-tx-error');
  errEl.classList.add('hidden');

  try {
    await apiFetch(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    closeEditTxModal();
    await loadHistoryData();
    if (STATE.activeTab === 'clientes') {
      await loadClientsData();
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

window.deleteHistoryTransaction = async function(txId) {
  if (!confirm('Tem certeza que deseja excluir esta transação? O estoque associado será revertido automaticamente (devolvendo para a conta de origem e retirando da conta de destino).')) {
    return;
  }
  try {
    const res = await apiFetch(`/api/transactions/${txId}`, { method: 'DELETE' });
    alert(res.message);
    await loadHistoryData();
    if (STATE.activeTab === 'estoque') {
      await loadStockData();
    }
  } catch (err) {
    alert('Erro ao excluir transação: ' + err.message);
  }
};

// ================= LÓGICA DA ABA DEV (ADMIN ONLY) =================
function initDevTab() {
  document.getElementById('dev-error').classList.add('hidden');
  document.getElementById('dev-success').classList.add('hidden');
  document.getElementById('dev-reset-form').reset();
}

document.getElementById('dev-reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const resetTransactions = document.getElementById('reset-transactions').checked;
  const resetStock = document.getElementById('reset-stock').checked;
  const resetFinance = document.getElementById('reset-finance').checked;

  const errEl = document.getElementById('dev-error');
  const succEl = document.getElementById('dev-success');
  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  if (!resetTransactions && !resetStock && !resetFinance) {
    errEl.textContent = 'Por favor, selecione pelo menos uma opção para resetar.';
    errEl.classList.remove('hidden');
    return;
  }

  if (!confirm('Esta ação é destrutiva e irá resetar os dados selecionados! Deseja mesmo prosseguir? O backup será feito automaticamente.')) {
    return;
  }

  try {
    const res = await apiFetch('/api/dev/reset-dashboard', {
      method: 'POST',
      body: JSON.stringify({ resetTransactions, resetStock, resetFinance })
    });
    succEl.innerHTML = `
      <strong>${escapeHtml(res.message)}</strong><br/>
      Cópia de segurança criada com sucesso:<br/>
      <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px; display:inline-block; margin-top:4px;">${escapeHtml(res.backupFile)}</code>
    `;
    succEl.classList.remove('hidden');
    document.getElementById('dev-reset-form').reset();
    
    // Sincronizar todos os dados locais pós-reset
    if (resetStock) await loadStockDataSilent();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ================= LÓGICA DE LOGINS DOS OPERADORES =================

// Helpers de plataforma
function platformLabel(platform, custom) {
  if (platform === 'steam') return '🎮 Steam';
  if (platform === 'xbox') return '🟢 Xbox';
  return custom ? `🔗 ${escapeHtml(custom)}` : '🔗 Outra';
}

// --- Aba "Suas Informações" (Operador) ---
async function loadMyLogins() {
  const container = document.getElementById('my-logins-container');
  try {
    const logins = await apiFetch('/api/my-logins');
    if (logins.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted" style="padding: 40px;">
          <i data-lucide="lock" style="width: 40px; height: 40px; display: block; margin: 0 auto 12px; opacity: 0.4;"></i>
          <p>Nenhuma conta designada pelo administrador ainda.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    let html = '<div style="display: grid; gap: 16px;">';
    logins.forEach(l => {
      html += `
        <div class="form-container-card" style="padding: 16px; border-left: 3px solid var(--primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 700; font-size: 15px; color: var(--text-main);">${platformLabel(l.platform, l.platform_custom)}</span>
            <span class="text-muted" style="font-size: 11px;">${new Date(l.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
            <div>
              <span class="text-muted">Login:</span><br>
              <div style="display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
                <code style="background: rgba(0,0,0,0.3); padding: 3px 8px; border-radius: 4px; user-select: all; display: inline-block;">${escapeHtml(l.login)}</code>
                <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(l.login)}', 'email')" title="Copiar Login">
                  <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                </button>
              </div>
            </div>
            <div>
              <span class="text-muted">Senha:</span><br>
              <div style="display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
                <span class="license-password-display" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); toggleLicensePassword(this, '${escapeHtml(l.password)}')">
                  <span class="pw-stars">••••••••</span>
                  <i data-lucide="eye" style="width: 12px; height: 12px; opacity: 0.7;"></i>
                </span>
                <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(l.password)}')" title="Copiar Senha">
                  <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                </button>
              </div>
            </div>
          </div>
          ${l.token ? `<div style="margin-top: 8px; font-size: 13px;">
            <span class="text-muted">Token:</span><br>
            <div style="display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
              <span class="license-password-display" style="cursor: pointer; background: rgba(59,130,246,0.1); color: #60A5FA; padding: 2px 6px; border-radius: 4px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); toggleLicenseToken(this, '${escapeHtml(l.token)}')">
                <span class="token-stars">••••••••</span>
                <i data-lucide="eye" style="width: 10px; height: 10px; opacity: 0.7;"></i>
              </span>
              <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(l.token)}', 'token')" title="Copiar Token">
                <i data-lucide="copy" style="width: 11px; height: 11px;"></i>
              </button>
            </div>
          </div>` : ''}
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<p class="text-center" style="color: var(--status-banned);">Erro ao carregar logins: ${escapeHtml(err.message)}</p>`;
  }
}

// --- Admin: Modal de gerenciamento de logins do operador ---
const opLoginsModal = document.getElementById('operator-logins-modal');
const editOpLoginModal = document.getElementById('edit-op-login-modal');

window.openOperatorLoginsModal = async function(userId, username) {
  document.getElementById('op-logins-user-id').value = userId;
  document.getElementById('op-logins-username').textContent = username;
  document.getElementById('op-login-add-error').classList.add('hidden');
  document.getElementById('op-login-add-form').reset();
  document.getElementById('op-login-custom-group').classList.add('hidden');

  opLoginsModal.classList.remove('hidden');
  await renderOperatorLoginsList(userId);
  lucide.createIcons();
};

async function renderOperatorLoginsList(userId) {
  const listContainer = document.getElementById('op-logins-list');
  const addSection = document.getElementById('op-login-add-section');

  try {
    const logins = await apiFetch(`/api/users/${userId}/logins`);
    document.getElementById('op-logins-count').textContent = `(${logins.length}/5 contas)`;

    if (logins.length >= 5) {
      addSection.classList.add('hidden');
    } else {
      addSection.classList.remove('hidden');
    }

    if (logins.length === 0) {
      listContainer.innerHTML = '<p class="text-center text-muted" style="padding: 15px;">Nenhuma conta atribuída.</p>';
      return;
    }

    let html = '';
    logins.forEach(l => {
      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--bg-hover); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${platformLabel(l.platform, l.platform_custom)}</div>
            <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
              <span>Login: <code style="background: rgba(0,0,0,0.2); padding: 1px 5px; border-radius: 3px;">${escapeHtml(l.login)}</code></span>
              <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(l.login)}', 'email')" title="Copiar Login">
                <i data-lucide="copy" style="width: 11px; height: 11px;"></i>
              </button>
              
              &nbsp;|&nbsp;
              
              <span>Senha: 
                <span class="license-password-display" style="cursor: pointer; background: rgba(0,0,0,0.2); padding: 1px 5px; border-radius: 3px;" onclick="event.stopPropagation(); toggleLicensePassword(this, '${escapeHtml(l.password)}')">
                  <span class="pw-stars">••••••••</span>
                  <i data-lucide="eye" style="width: 10px; height: 10px; opacity: 0.7; margin-left: 4px;"></i>
                </span>
              </span>
              <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(l.password)}')" title="Copiar Senha">
                <i data-lucide="copy" style="width: 11px; height: 11px;"></i>
              </button>

              ${l.token ? `
                &nbsp;|&nbsp;
                <span>Token: 
                  <span class="license-password-display" style="cursor: pointer; background: rgba(59,130,246,0.1); color: #60A5FA; padding: 1px 5px; border-radius: 3px;" onclick="event.stopPropagation(); toggleLicenseToken(this, '${escapeHtml(l.token)}')">
                    <span class="token-stars">••••••••</span>
                    <i data-lucide="eye" style="width: 10px; height: 10px; opacity: 0.7; margin-left: 4px;"></i>
                  </span>
                </span>
                <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(l.token)}', 'token')" title="Copiar Token">
                  <i data-lucide="copy" style="width: 11px; height: 11px;"></i>
                </button>
              ` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 6px; margin-left: 12px; flex-shrink: 0;">
            <button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px; border-color: var(--primary); color: var(--primary);" onclick="openEditOpLoginModal(${l.id}, ${userId})">Editar</button>
            <button class="btn btn-outline" style="padding: 3px 8px; font-size: 11px; border-color: var(--status-banned); color: var(--status-banned);" onclick="deleteOpLogin(${l.id}, ${userId})">Excluir</button>
          </div>
        </div>
      `;
    });
    listContainer.innerHTML = html;
  } catch (err) {
    listContainer.innerHTML = `<p class="text-center" style="color: var(--status-banned);">Erro: ${escapeHtml(err.message)}</p>`;
  }
}

// Toggle custom platform field em add form
document.getElementById('op-login-platform').addEventListener('change', (e) => {
  const customGroup = document.getElementById('op-login-custom-group');
  if (e.target.value === 'other') {
    customGroup.classList.remove('hidden');
    document.getElementById('op-login-platform-custom').required = true;
  } else {
    customGroup.classList.add('hidden');
    document.getElementById('op-login-platform-custom').required = false;
  }
});

// Add login form submit
document.getElementById('op-login-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('op-logins-user-id').value;
  const errEl = document.getElementById('op-login-add-error');
  errEl.classList.add('hidden');

  const body = {
    platform: document.getElementById('op-login-platform').value,
    platform_custom: document.getElementById('op-login-platform-custom').value.trim(),
    login: document.getElementById('op-login-login').value.trim(),
    password: document.getElementById('op-login-password').value,
    token: document.getElementById('op-login-token').value.trim() || null
  };

  try {
    await apiFetch(`/api/users/${userId}/logins`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    document.getElementById('op-login-add-form').reset();
    document.getElementById('op-login-custom-group').classList.add('hidden');
    await renderOperatorLoginsList(userId);
    lucide.createIcons();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// Close operator logins modal
document.getElementById('btn-close-op-logins-modal').addEventListener('click', () => {
  opLoginsModal.classList.add('hidden');
});

// --- Edit login modal ---
window.openEditOpLoginModal = async function(loginId, userId) {
  try {
    const logins = await apiFetch(`/api/users/${userId}/logins`);
    const login = logins.find(l => l.id === loginId);
    if (!login) return;

    document.getElementById('edit-op-login-id').value = login.id;
    document.getElementById('edit-op-login-platform').value = login.platform;
    document.getElementById('edit-op-login-platform-custom').value = login.platform_custom || '';
    document.getElementById('edit-op-login-login').value = login.login;
    document.getElementById('edit-op-login-password').value = login.password;
    document.getElementById('edit-op-login-token').value = login.token || '';
    document.getElementById('edit-op-login-error').classList.add('hidden');

    if (login.platform === 'other') {
      document.getElementById('edit-op-login-custom-group').classList.remove('hidden');
    } else {
      document.getElementById('edit-op-login-custom-group').classList.add('hidden');
    }

    // Store userId for refresh
    editOpLoginModal.dataset.userId = userId;
    editOpLoginModal.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao abrir edição de login:', err);
  }
};

// Toggle custom platform field em edit form
document.getElementById('edit-op-login-platform').addEventListener('change', (e) => {
  const customGroup = document.getElementById('edit-op-login-custom-group');
  if (e.target.value === 'other') {
    customGroup.classList.remove('hidden');
  } else {
    customGroup.classList.add('hidden');
  }
});

// Edit login form submit
document.getElementById('edit-op-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const loginId = document.getElementById('edit-op-login-id').value;
  const errEl = document.getElementById('edit-op-login-error');
  errEl.classList.add('hidden');

  const body = {
    platform: document.getElementById('edit-op-login-platform').value,
    platform_custom: document.getElementById('edit-op-login-platform-custom').value.trim(),
    login: document.getElementById('edit-op-login-login').value.trim(),
    password: document.getElementById('edit-op-login-password').value,
    token: document.getElementById('edit-op-login-token').value.trim() || null
  };

  try {
    await apiFetch(`/api/operator-logins/${loginId}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    editOpLoginModal.classList.add('hidden');
    const userId = editOpLoginModal.dataset.userId;
    await renderOperatorLoginsList(userId);
    lucide.createIcons();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// Close edit login modal
document.getElementById('btn-close-edit-op-login').addEventListener('click', () => {
  editOpLoginModal.classList.add('hidden');
});
document.getElementById('btn-cancel-edit-op-login').addEventListener('click', () => {
  editOpLoginModal.classList.add('hidden');
});

// Delete login
window.deleteOpLogin = async function(loginId, userId) {
  if (!confirm('Tem certeza que deseja remover esta conta do operador?')) return;
  try {
    await apiFetch(`/api/operator-logins/${loginId}`, { method: 'DELETE' });
    await renderOperatorLoginsList(userId);
    lucide.createIcons();
  } catch (err) {
    alert('Erro ao excluir login: ' + err.message);
  }
};

// ==========================================
// LÓGICA DE LICENÇAS (CONTAS MÃE E FILHA)
// ==========================================

// Estado de colapso de cada conta mãe (guardado em memória)
const STATE_LICENSES_COLLAPSED = {};

// Carregar dados da aba de licenças
async function loadLicensesData() {
  try {
    const licenses = await apiFetch('/api/licenses');
    STATE.licenses = licenses;
    renderLicensesTree(licenses);
    
    // Atualizar dropdowns nos modais
    populateMotherSelectOptions(licenses);
    if (STATE.user.role === 'admin') {
      await populateOperatorSelectOptions();
    }
  } catch (err) {
    console.error('Erro ao carregar dados de licenças:', err);
  }
}

// Preencher dropdown de contas mãe no formulário
function populateMotherSelectOptions(licenses) {
  const select = document.getElementById('license-mother-id');
  select.innerHTML = '<option value="" disabled selected>Selecione uma conta mãe...</option>';
  
  const mothers = licenses.filter(l => l.type === 'mother');
  mothers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.login;
    select.appendChild(opt);
  });
}

// Preencher dropdown de vinculados no formulário (Admin Only)
async function populateOperatorSelectOptions() {
  const select = document.getElementById('license-operator-id');
  if (!select) return;
  select.innerHTML = '<option value="">Nenhum (Sem vínculo)</option>';
  
  try {
    const users = await apiFetch('/api/users');
    // Ordena por cargo (Admin primeiro, depois Operador) e depois por apelido/username
    users.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'admin' ? -1 : 1;
      }
      const nameA = (a.nickname || a.username).toLowerCase();
      const nameB = (b.nickname || b.username).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      const roleLabel = u.role === 'admin' ? 'Administrador' : 'Operador (Duper)';
      const displayName = u.nickname ? `${u.nickname} (${u.username})` : u.username;
      opt.textContent = `${displayName} [${roleLabel}]`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Erro ao buscar usuários para vínculo:', err);
  }
}

// Alternar visibilidade dos campos com base no tipo da conta
function updateLicenseFormFields() {
  const type = document.getElementById('license-type').value;
  const motherGroup = document.getElementById('license-mother-select-group');
  const cardGroup = document.getElementById('license-card-group');
  const refundedGroup = document.getElementById('license-refunded-group');
  const operatorGroup = document.getElementById('license-operator-group');
  const accountUsernameGroup = document.getElementById('license-account-username-group');
  const tokenStatusGroup = document.getElementById('license-token-status-group');
  const tokenGroup = document.getElementById('license-token-group');
  const statusGroup = document.getElementById('license-status-group');

  const isEditing = !!document.getElementById('license-id-field').value;
  const isOperator = STATE.user.role === 'operator';

  const loginInput = document.getElementById('license-login');
  const passwordInput = document.getElementById('license-password');
  const typeSelect = document.getElementById('license-type');
  const accountUsernameInput = document.getElementById('license-account-username');
  const tokenInput = document.getElementById('license-token');
  const motherSelect = document.getElementById('license-mother-id');

  if (isOperator && isEditing) {
    loginInput.setAttribute('disabled', 'disabled');
    passwordInput.setAttribute('disabled', 'disabled');
    typeSelect.setAttribute('disabled', 'disabled');
    accountUsernameInput.setAttribute('disabled', 'disabled');
    tokenInput.setAttribute('disabled', 'disabled');
    motherSelect.setAttribute('disabled', 'disabled');
    
    loginInput.removeAttribute('required');
    passwordInput.removeAttribute('required');
    typeSelect.removeAttribute('required');
  } else {
    loginInput.removeAttribute('disabled');
    passwordInput.removeAttribute('disabled');
    typeSelect.removeAttribute('disabled');
    accountUsernameInput.removeAttribute('disabled');
    tokenInput.removeAttribute('disabled');
    motherSelect.removeAttribute('disabled');
    
    loginInput.setAttribute('required', 'required');
    passwordInput.setAttribute('required', 'required');
    typeSelect.setAttribute('required', 'required');
  }

  // Ocultar opção Reembolsada do status se for operador
  const refundedOption = document.getElementById('license-status-option-refunded');
  if (refundedOption) {
    refundedOption.style.display = isOperator ? 'none' : '';
  }

  // Ocultar/exibir status group
  if (statusGroup) {
    if (isOperator && !isEditing) {
      statusGroup.classList.add('hidden');
    } else {
      statusGroup.classList.remove('hidden');
    }
  }

  if (type === 'mother') {
    motherGroup.classList.add('hidden');
    document.getElementById('license-mother-id').removeAttribute('required');
    
    cardGroup.classList.remove('hidden');
    if (refundedGroup) refundedGroup.classList.remove('hidden');
    if (accountUsernameGroup) accountUsernameGroup.classList.add('hidden');
    if (tokenStatusGroup) tokenStatusGroup.classList.add('hidden');
    if (tokenGroup) tokenGroup.classList.add('hidden');
    operatorGroup.classList.add('hidden');
  } else {
    motherGroup.classList.remove('hidden');
    document.getElementById('license-mother-id').setAttribute('required', 'required');
    
    cardGroup.classList.add('hidden');
    if (refundedGroup) refundedGroup.classList.add('hidden');
    if (accountUsernameGroup) accountUsernameGroup.classList.remove('hidden');
    if (tokenStatusGroup) tokenStatusGroup.classList.remove('hidden');
    if (tokenGroup) tokenGroup.classList.remove('hidden');
    operatorGroup.classList.remove('hidden');
  }
}

document.getElementById('license-type').addEventListener('change', updateLicenseFormFields);

// Filtros da árvore de licenças
document.getElementById('filter-mother-status').addEventListener('change', () => {
  renderLicensesTree(STATE.licenses || []);
});
document.getElementById('filter-child-token-status').addEventListener('change', () => {
  renderLicensesTree(STATE.licenses || []);
});

// Abrir modal de cadastro
const licenseModal = document.getElementById('license-modal');
document.getElementById('btn-open-license-modal').addEventListener('click', () => {
  document.getElementById('license-modal-title').textContent = 'Cadastrar Licença';
  document.getElementById('license-form').reset();
  document.getElementById('license-id-field').value = '';
  document.getElementById('license-error-msg').classList.add('hidden');
  
  updateLicenseFormFields();
  licenseModal.classList.remove('hidden');
  lucide.createIcons();
});

// Fechar modal
const closeLicenseModal = () => {
  licenseModal.classList.add('hidden');
};
document.getElementById('btn-close-license-modal').addEventListener('click', closeLicenseModal);
document.getElementById('btn-cancel-license-modal').addEventListener('click', closeLicenseModal);

// Salvar / Submeter formulário
document.getElementById('license-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('license-id-field').value;
  const errEl = document.getElementById('license-error-msg');
  errEl.classList.add('hidden');

  const type = document.getElementById('license-type').value;
  const body = {
    login: document.getElementById('license-login').value.trim(),
    password: document.getElementById('license-password').value,
    type,
    mother_id: type === 'child' ? document.getElementById('license-mother-id').value : null,
    token: document.getElementById('license-token').value.trim() || null,
    account_username: type === 'child' ? document.getElementById('license-account-username').value.trim() || null : null,
    token_status: type === 'child' ? document.getElementById('license-token-status').value : 'empty',
    status: document.getElementById('license-status').value
  };

  // Campos exclusivos de admin
  if (STATE.user.role === 'admin') {
    body.card_used = type === 'mother' ? document.getElementById('license-card-used').value.trim() : null;
    body.refunded = type === 'mother' ? document.getElementById('license-refunded').value : 'no';
    body.operator_id = type === 'child' ? document.getElementById('license-operator-id').value : null;
  }

  try {
    if (id) {
      // Editar
      await apiFetch(`/api/licenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    } else {
      // Cadastrar
      await apiFetch('/api/licenses', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
    licenseModal.classList.add('hidden');
    loadLicensesData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// Renderizar árvore de licenças mãe/filha
function renderLicensesTree(licenses) {
  const container = document.getElementById('licenses-tree-container');
  container.innerHTML = '';
  const isAdmin = STATE.user && STATE.user.role === 'admin';

  // Obter valores dos filtros
  const filterMother = document.getElementById('filter-mother-status')?.value || 'all';
  const filterChild = document.getElementById('filter-child-token-status')?.value || 'all';

  let mothers = licenses.filter(l => l.type === 'mother');
  let children = licenses.filter(l => l.type === 'child');

  // Filtrar contas mãe
  if (filterMother !== 'all') {
    mothers = mothers.filter(m => m.status === filterMother);
  }

  // Filtrar contas filha para cada mãe, e opcionalmente filtrar contas mãe que não tenham filhas correspondentes
  const mothersToShow = [];
  const childrenMap = new Map();

  mothers.forEach(m => {
    const myChildren = children.filter(c => c.mother_id === m.id);
    let matchedChildren = myChildren;

    if (filterChild !== 'all') {
      matchedChildren = myChildren.filter(c => c.token_status === filterChild);
      // Se filtro de filha ativo, só mostra a mãe se ela tiver pelo menos uma filha correspondente
      if (matchedChildren.length > 0) {
        mothersToShow.push(m);
        childrenMap.set(m.id, matchedChildren);
      }
    } else {
      mothersToShow.push(m);
      childrenMap.set(m.id, matchedChildren);
    }
  });

  if (mothersToShow.length === 0) {
    container.innerHTML = '<p class="text-center text-muted" style="padding: 40px 0;">Nenhuma licença cadastrada ou correspondente aos filtros.</p>';
    return;
  }

  const treeDiv = document.createElement('div');
  treeDiv.className = 'licenses-tree';

  mothersToShow.forEach(m => {
    const card = document.createElement('div');
    card.className = 'license-mother-card';
    
    // Obter contas filhas desta mãe
    const myChildren = childrenMap.get(m.id) || [];
    
    // Estado do colapso
    if (STATE_LICENSES_COLLAPSED[m.id] === undefined) {
      STATE_LICENSES_COLLAPSED[m.id] = true; // Colapsada por padrão
    }
    const isCollapsed = STATE_LICENSES_COLLAPSED[m.id];

    // Badge de status
    let statusClass = 'badge-green';
    let statusText = 'Ativa';
    if (m.status === 'banned') {
      statusClass = 'badge-red';
      statusText = 'Banida';
    } else if (m.status === 'refunded') {
      statusClass = 'status-refunded';
      statusText = 'Reembolsada';
    }

    const cardInfoText = m.card_used ? `<span style="font-size: 11px; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">💳 ${escapeHtml(m.card_used)}</span>` : '';

    const isRefunded = m.refunded || 'no';
    let refundedLabel = 'Não';
    let refundedClass = 'badge-red';
    if (isRefunded === 'yes') {
      refundedLabel = 'Sim';
      refundedClass = 'badge-green';
    } else if (isRefunded === 'pending') {
      refundedLabel = 'Pendente';
      refundedClass = 'status-refunded';
    }
    const refundedInfoText = `<span class="badge-status ${refundedClass}" style="font-size: 11px; padding: 2px 6px; margin-left: 4px;">Reembolso: ${refundedLabel}</span>`;

    const adminActions = `
      <div class="license-actions" onclick="event.stopPropagation();">
        <button class="btn btn-secondary btn-sm" onclick="openEditLicenseModal(${m.id})" style="padding: 4px 8px; font-size: 11px;">
          <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Editar
        </button>
        ${isAdmin ? `
        <button class="btn btn-danger btn-sm" onclick="deleteLicenseAccount(${m.id})" style="padding: 4px 8px; font-size: 11px; background: var(--status-banned); border-color: var(--status-banned);">
          <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Excluir
        </button>
        ` : ''}
      </div>
    `;

    // Header da conta mãe
    const header = document.createElement('div');
    header.className = 'license-mother-header';
    header.innerHTML = `
      <div class="license-info-left">
        <i data-lucide="chevron-down" class="tree-arrow ${isCollapsed ? 'collapsed' : ''}" style="width: 18px; height: 18px; color: var(--text-muted);"></i>
        <i data-lucide="key" style="width: 16px; height: 16px; color: var(--secondary);"></i>
        <span class="license-login-text">${escapeHtml(m.login)}</span>
        <button class="btn-icon-only" style="padding: 2px; margin-right: 6px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(m.login)}', 'email')" title="Copiar E-mail">
          <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
        </button>
        <span class="license-password-display" style="cursor: pointer;" onclick="event.stopPropagation(); toggleLicensePassword(this, '${escapeHtml(m.password)}')">
          <span class="pw-stars">••••••••</span>
          <i data-lucide="eye" style="width: 12px; height: 12px; opacity: 0.7;"></i>
        </span>
        <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(m.password)}')" title="Copiar Senha">
          <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
        </button>
        <span class="badge-status ${statusClass}">${statusText}</span>
        ${cardInfoText}
        ${refundedInfoText}
      </div>
      ${adminActions}
    `;

    // Clique no header para expandir/colapsar
    header.addEventListener('click', () => {
      STATE_LICENSES_COLLAPSED[m.id] = !STATE_LICENSES_COLLAPSED[m.id];
      const arrow = header.querySelector('.tree-arrow');
      const container = card.querySelector('.license-child-container');
      if (STATE_LICENSES_COLLAPSED[m.id]) {
        arrow.classList.add('collapsed');
        if (container) container.classList.add('hidden');
      } else {
        arrow.classList.remove('collapsed');
        if (container) container.classList.remove('hidden');
      }
    });

    card.appendChild(header);

    // Lista de contas filhas
    if (myChildren.length > 0) {
      const childContainer = document.createElement('div');
      childContainer.className = `license-child-container ${isCollapsed ? 'hidden' : ''}`;
      
      myChildren.forEach(c => {
        const cCard = document.createElement('div');
        cCard.className = 'license-child-card';

        let cStatusClass = 'badge-green';
        let cStatusText = 'Ativa';
        if (c.status === 'banned') {
          cStatusClass = 'badge-red';
          cStatusText = 'Banida';
        } else if (c.status === 'refunded') {
          cStatusClass = 'status-refunded';
          cStatusText = 'Reembolsada';
        }

        const displayName = c.operator_nickname ? `${c.operator_nickname} (${c.operator_username})` : c.operator_username;
        const opText = c.operator_username 
          ? `<span style="font-size: 11px; color: var(--secondary); background: rgba(168,85,247,0.1); padding: 2px 6px; border-radius: 4px;"><i data-lucide="user" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i> ${escapeHtml(displayName)}</span>` 
          : '<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">Sem Vínculo</span>';

        const adminActionsChild = `
          <div class="license-actions">
            <button class="btn btn-secondary btn-sm" onclick="openEditLicenseModal(${c.id})" style="padding: 2px 6px; font-size: 10px; height: 26px;">
              <i data-lucide="edit-3" style="width: 10px; height: 10px;"></i> Editar
            </button>
            ${isAdmin ? `
            <button class="btn btn-danger btn-sm" onclick="deleteLicenseAccount(${c.id})" style="padding: 2px 6px; font-size: 10px; height: 26px; background: var(--status-banned); border-color: var(--status-banned);">
              <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i> Excluir
            </button>
            ` : ''}
          </div>
        `;

        const tokenInfoText = c.token ? `
          <span class="license-password-display" style="cursor: pointer; background: rgba(59,130,246,0.1); color: #60A5FA; padding: 2px 6px; border-radius: 4px; font-size: 11px;" onclick="event.stopPropagation(); toggleLicenseToken(this, '${escapeHtml(c.token)}')">
            <span class="token-stars">••••••••</span>
            <i data-lucide="eye" style="width: 10px; height: 10px; opacity: 0.7; margin-left: 4px;"></i>
          </span>
          <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(c.token)}', 'token')" title="Copiar Token">
            <i data-lucide="copy" style="width: 11px; height: 11px;"></i>
          </button>
        ` : '<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">Sem Token</span>';

        const accountUsernameText = c.account_username ? `
          <span style="font-size: 11px; font-weight: 600; color: var(--primary); background: rgba(168,85,247,0.05); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(168,85,247,0.15); margin-left: 4px;">
            👤 ${escapeHtml(c.account_username)}
          </span>
          <button class="btn-icon-only" style="padding: 2px;" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(c.account_username)}', 'usuario')" title="Copiar Usuário da Conta">
            <i data-lucide="copy" style="width: 11px; height: 11px;"></i>
          </button>
        ` : '';

        let tokenStatusLabel = 'Vazia';
        let tokenStatusStyle = 'background: rgba(156, 163, 175, 0.1); color: #9CA3AF; border: 1px solid rgba(156, 163, 175, 0.2);';
        
        if (c.token_status === 'full') {
          tokenStatusLabel = 'FULL';
          tokenStatusStyle = 'background: rgba(16, 185, 129, 0.1); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.2);';
        } else if (c.token_status === 'filling') {
          tokenStatusLabel = 'Enchendo';
          tokenStatusStyle = 'background: rgba(245, 158, 11, 0.1); color: #FBBF24; border: 1px solid rgba(245, 158, 11, 0.2);';
        }
        
        const tokenStatusBadge = `
          <span style="font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 4px; ${tokenStatusStyle}">
            ${tokenStatusLabel}
          </span>
        `;

        cCard.innerHTML = `
          <div class="license-info-left" style="gap: 10px;">
            <i data-lucide="corner-down-right" style="width: 14px; height: 14px; color: var(--text-muted); margin-left: 5px;"></i>
            <i data-lucide="link-2" style="width: 14px; height: 14px; color: var(--primary);"></i>
            <span style="font-size: 13px; font-weight: 500;">${escapeHtml(c.login)}</span>
            <button class="btn-icon-only" style="padding: 2px;" onclick="copyToClipboard('${escapeHtml(c.login)}', 'email')" title="Copiar E-mail">
              <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
            </button>
            <span class="license-password-display" style="cursor: pointer;" onclick="toggleLicensePassword(this, '${escapeHtml(c.password)}')">
              <span class="pw-stars">••••••••</span>
              <i data-lucide="eye" style="width: 12px; height: 12px; opacity: 0.7;"></i>
            </span>
            <button class="btn-icon-only" style="padding: 2px;" onclick="copyToClipboard('${escapeHtml(c.password)}')" title="Copiar Senha">
              <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
            </button>
            <span class="badge-status ${cStatusClass}" style="font-size: 9px; padding: 2px 6px;">${cStatusText}</span>
            ${accountUsernameText}
            ${tokenStatusBadge}
            ${tokenInfoText}
            ${opText}
          </div>
          ${adminActionsChild}
        `;
        childContainer.appendChild(cCard);
      });
      card.appendChild(childContainer);
    } else {
      const childContainer = document.createElement('div');
      childContainer.className = `license-child-container ${isCollapsed ? 'hidden' : ''}`;
      childContainer.innerHTML = '<span style="font-size: 11px; color: var(--text-muted); font-style: italic; margin-left: 20px;">Nenhuma conta filha vinculada.</span>';
      card.appendChild(childContainer);
    }

    treeDiv.appendChild(card);
  });

  container.appendChild(treeDiv);
  lucide.createIcons();
}

// Alternar visualização da senha
window.toggleLicensePassword = function(element, password) {
  const stars = element.querySelector('.pw-stars');
  const icon = element.querySelector('i');
  if (stars.textContent === '••••••••') {
    stars.textContent = password;
    stars.style.color = '#34D399'; // Verde temporário
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    stars.textContent = '••••••••';
    stars.style.color = '';
    icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
};

// Alternar visualização do token
window.toggleLicenseToken = function(element, token) {
  const stars = element.querySelector('.token-stars');
  const icon = element.querySelector('i');
  if (stars.textContent === '••••••••') {
    stars.textContent = token;
    stars.style.color = '#60A5FA'; // Azul temporário
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    stars.textContent = '••••••••';
    stars.style.color = '';
    icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
};

// Copiar para o clipboard helper
window.copyToClipboard = function(text, type = 'senha') {
  navigator.clipboard.writeText(text).then(() => {
    let label = 'Senha';
    if (type === 'email') label = 'Email';
    else if (type === 'token') label = 'Token';
    else if (type === 'usuario') label = 'Usuário da conta';
    alert(`${label} copiado para a área de transferência!`);
  }).catch(err => {
    console.error(`Erro ao copiar ${type}:`, err);
  });
};

// Excluir licença
window.deleteLicenseAccount = async function(id) {
  if (!confirm('Tem certeza que deseja excluir esta licença?\nSe for uma conta mãe, todas as filhas vinculadas também serão excluídas.')) return;
  try {
    await apiFetch(`/api/licenses/${id}`, { method: 'DELETE' });
    loadLicensesData();
  } catch (err) {
    alert('Erro ao excluir licença: ' + err.message);
  }
};

// Abrir modal para edição de licença
window.openEditLicenseModal = async function(id) {
  try {
    const licenses = await apiFetch('/api/licenses');
    const license = licenses.find(l => l.id === id);
    if (!license) return;

    document.getElementById('license-modal-title').textContent = 'Editar Licença';
    document.getElementById('license-error-msg').classList.add('hidden');
    document.getElementById('license-id-field').value = license.id;
    document.getElementById('license-login').value = license.login;
    document.getElementById('license-password').value = license.password;
    document.getElementById('license-type').value = license.type;
    document.getElementById('license-token').value = license.token || '';
    document.getElementById('license-account-username').value = license.account_username || '';
    document.getElementById('license-token-status').value = license.token_status || 'empty';

    // Atualizar dropdowns
    populateMotherSelectOptions(licenses);
    document.getElementById('license-mother-id').value = license.mother_id || '';
    document.getElementById('license-status').value = license.status;
    
    if (STATE.user.role === 'admin') {
      await populateOperatorSelectOptions();
      document.getElementById('license-card-used').value = license.card_used || '';
      document.getElementById('license-refunded').value = license.refunded || 'no';
      document.getElementById('license-operator-id').value = license.operator_id || '';
    }

    updateLicenseFormFields();
    licenseModal.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao buscar dados da licença para edição:', err);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  initApp();
});
