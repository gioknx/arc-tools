const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { 
  initDb, 
  dbAll, 
  dbGet, 
  dbRun, 
  executeTransaction 
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para habilitar CORS (essencial para receber requisições do script do Tampermonkey)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware para JSON
app.use(express.json());

let dbInitialized = false;
let dbInitPromise = null;

async function ensureDbInit() {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await initDb();
      await fetchExchangeRate(); // Busca cotação atualizada na inicialização
      dbInitialized = true;
    })();
  }
  return dbInitPromise;
}

// Middleware para garantir inicialização do banco de dados antes de qualquer rota
app.use(async (req, res, next) => {
  try {
    await ensureDbInit();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Erro de inicialização do banco de dados: ' + err.message });
  }
});

// Servir o userscript com o host de forma dinâmica
app.get('/arc_ledger.user.js', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'arc_ledger.user.js');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Erro ao carregar o script.');
    }
    // Determina o host atual do request (forçando https em produção para evitar bloqueio de conteúdo misto)
    const isLocal = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1');
    const protocol = isLocal ? req.protocol : 'https';
    const currentHost = `${protocol}://${req.get('host')}`;
    const modifiedData = data.replace(/http:\/\/localhost:3000/g, currentHost);
    res.setHeader('Content-Type', 'application/javascript');
    res.send(modifiedData);
  });
});

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de autenticação
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado. Faça login.' });
    }

    const token = authHeader.split(' ')[1];
    const session = await dbGet(`
      SELECT s.user_id, s.username, s.role, u.nickname 
      FROM sessions s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.token = ?
    `, [token]);

    if (!session) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    req.user = {
      id: session.user_id,
      username: session.username,
      nickname: session.nickname,
      role: session.role
    };
    next();
  } catch (err) {
    res.status(500).json({ error: 'Erro de autenticação interno: ' + err.message });
  }
};

// Middleware para restringir a admins
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Preencha usuário e senha.' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Criar token de sessão único
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    await dbRun(
      'INSERT INTO sessions (token, user_id, username, role) VALUES (?, ?, ?, ?)',
      [token, user.id, user.username, user.role]
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    await dbRun('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ message: 'Logout realizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ==========================================
// ROTAS DE USUÁRIOS (ADMIN ONLY)
// ==========================================

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT id, username, nickname, role, payment_per_register, daily_goal, created_at FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, role, password, payment_per_register, daily_goal, nickname } = req.body;

  if (!username || !role) {
    return res.status(400).json({ error: 'Nome de usuário e Cargo são obrigatórios.' });
  }

  if (role !== 'admin' && role !== 'operator') {
    return res.status(400).json({ error: 'Cargo inválido. Use admin ou operator.' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Membro da equipe não localizado.' });
    }

    // Se mudou o username, verifique se já existe
    if (username.trim() !== user.username) {
      const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username.trim()]);
      if (existing) {
        return res.status(400).json({ error: 'Nome de usuário já cadastrado.' });
      }
    }

    let passHash = user.password_hash;
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      passHash = await bcrypt.hash(password, salt);
    }

    let payPerReg = user.payment_per_register;
    if (payment_per_register !== undefined && payment_per_register !== null && payment_per_register !== '') {
      const parsed = parseFloat(payment_per_register);
      if (!isNaN(parsed)) {
        payPerReg = parsed;
      }
    }

    let dailyGoalVal = user.daily_goal;
    if (daily_goal !== undefined && daily_goal !== null && daily_goal !== '') {
      const parsed = parseInt(daily_goal);
      if (!isNaN(parsed)) {
        dailyGoalVal = parsed;
      }
    }

    await dbRun(
      `UPDATE users 
       SET username = ?, role = ?, password_hash = ?, payment_per_register = ?, daily_goal = ?, nickname = ?
       WHERE id = ?`,
      [username.trim(), role, passHash, payPerReg, dailyGoalVal, nickname ? nickname.trim() : null, id]
    );

    res.json({ message: 'Membro da equipe editado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role, nickname } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Preencha usuário, senha e cargo.' });
  }

  if (role !== 'admin' && role !== 'operator') {
    return res.status(400).json({ error: 'Cargo inválido.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    await dbRun('INSERT INTO users (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)', [username, hash, role, nickname ? nickname.trim() : null]);
    res.status(201).json({ message: 'Usuário criado com sucesso.' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Nome de usuário já existe.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
  }

  try {
    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE CONTAS
// ==========================================

app.get('/api/accounts', authenticate, async (req, res) => {
  try {
    const accounts = await dbAll('SELECT id, name, login_method, token, status, type, notes FROM accounts');
    
    // Se o usuário não for admin, mascaramos ou ocultamos os dados sensíveis (token e login_method)
    if (req.user.role !== 'admin') {
      const sanitized = accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        status: acc.status,
        type: acc.type,
        notes: acc.notes,
        login_method: 'Apenas Administrador',
        token: '********'
      }));
      return res.json(sanitized);
    }

    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', authenticate, requireAdmin, async (req, res) => {
  const { name, login_method, token, status, type, notes } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nome da conta é obrigatório.' });
  }

  try {
    await dbRun(
      'INSERT INTO accounts (name, login_method, token, status, type, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [name, login_method, token, status || 'active', type || 'duper', notes]
    );
    res.status(201).json({ message: 'Conta criada com sucesso.' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Nome de conta já cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/accounts/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, login_method, token, status, type, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Nome da conta é obrigatório.' });
  }

  try {
    await dbRun(
      'UPDATE accounts SET name = ?, login_method = ?, token = ?, status = ?, type = ?, notes = ? WHERE id = ?',
      [name, login_method, token, status, type, notes, id]
    );
    res.json({ message: 'Conta atualizada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun('DELETE FROM accounts WHERE id = ?', [id]);
    res.json({ message: 'Conta excluída com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE ITENS
// ==========================================

app.get('/api/items', authenticate, async (req, res) => {
  try {
    const items = await dbAll('SELECT id, name, category, color FROM items ORDER BY category, name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', authenticate, requireAdmin, async (req, res) => {
  const { name, category, color } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Preencha o nome e a categoria do item.' });
  }

  try {
    await dbRun('INSERT INTO items (name, category, color) VALUES (?, ?, ?)', [name, category, color || 'gray']);
    res.status(201).json({ message: 'Item cadastrado com sucesso.' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Este item já está cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, category, color } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Preencha o nome e a categoria.' });
  }

  try {
    await dbRun('UPDATE items SET name = ?, category = ?, color = ? WHERE id = ?', [name, category, color || 'gray', id]);
    res.json({ message: 'Item atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Apagar estoque associado
    await dbRun('DELETE FROM inventories WHERE item_id = ?', [id]);
    await dbRun('DELETE FROM items WHERE id = ?', [id]);
    res.json({ message: 'Item excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE ESTOQUE (INVENTÁRIO)
// ==========================================

// Estoque Consolidado (Soma de todos os itens ativos de todas as contas)
app.get('/api/inventory', authenticate, async (req, res) => {
  try {
    const sql = `
      SELECT i.id as item_id, i.name as item_name, i.category as item_category, i.color as item_color, COALESCE(SUM(inv.quantity), 0) as total_quantity
      FROM items i
      LEFT JOIN inventories inv ON i.id = inv.item_id
      LEFT JOIN accounts a ON inv.account_id = a.id
      WHERE a.status = 'active' OR inv.quantity IS NULL OR a.status IS NULL
      GROUP BY i.id
      ORDER BY i.category, i.name
    `;
    const inventory = await dbAll(sql);
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detalhes do Estoque (Divisão por conta e item)
app.get('/api/inventory/details', authenticate, async (req, res) => {
  try {
    const sql = `
      SELECT a.id as account_id, a.name as account_name, a.status as account_status,
             i.id as item_id, i.name as item_name, i.color as item_color, COALESCE(inv.quantity, 0) as quantity
      FROM accounts a
      CROSS JOIN items i
      LEFT JOIN inventories inv ON a.id = inv.account_id AND i.id = inv.item_id
      ORDER BY a.name, i.name
    `;
    const details = await dbAll(sql);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualização Manual de Estoque (Admin Only)
app.post('/api/inventory/manual', authenticate, requireAdmin, async (req, res) => {
  const { accountId, itemId, newQuantity } = req.body;
  const operatorId = req.user.id;

  if (accountId === undefined || itemId === undefined || newQuantity === undefined || newQuantity < 0) {
    return res.status(400).json({ error: 'Dados inválidos. A quantidade deve ser igual ou maior que zero.' });
  }

  try {
    // Obter quantidade atual
    const currentRecord = await dbGet(
      'SELECT quantity FROM inventories WHERE account_id = ? AND item_id = ?',
      [parseInt(accountId), parseInt(itemId)]
    );
    const currentQty = currentRecord ? currentRecord.quantity : 0;
    const diff = parseInt(newQuantity) - currentQty;

    if (diff === 0) {
      return res.json({ message: 'A quantidade já é igual à informada.' });
    }

    if (diff > 0) {
      // Ajuste de adição (Entrada)
      await executeTransaction({
        type: 'adjust_add',
        itemId: parseInt(itemId),
        quantity: diff,
        toAccountId: parseInt(accountId),
        operatorId,
        notes: `Ajuste manual do Admin (Estoque alterado de ${currentQty} para ${newQuantity})`
      });
    } else {
      // Ajuste de subtração (Saída)
      await executeTransaction({
        type: 'adjust_sub',
        itemId: parseInt(itemId),
        quantity: Math.abs(diff),
        fromAccountId: parseInt(accountId),
        operatorId,
        notes: `Ajuste manual do Admin (Estoque alterado de ${currentQty} para ${newQuantity})`
      });
    }

    res.json({ message: 'Estoque atualizado com sucesso e log registrado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE CLIENTES
// ==========================================

app.get('/api/clients', authenticate, async (req, res) => {
  try {
    const clients = await dbAll('SELECT id, name, created_at FROM clients ORDER BY name');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nome/ID Embark é obrigatório.' });
  }

  try {
    const result = await dbRun('INSERT INTO clients (name) VALUES (?)', [name.trim()]);
    res.status(201).json({ id: result.lastID, name, message: 'Cliente cadastrado com sucesso.' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Cliente com este nome/ID Embark já cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const client = await dbGet('SELECT id, name, created_at FROM clients WHERE id = ?', [id]);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não localizado.' });
    }

    // Calcular estatísticas agregadas automaticamente
    const stats = await dbGet(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(quantity), 0) as total_items,
        MAX(timestamp) as last_order_date,
        COALESCE(SUM(CASE WHEN sale_currency = 'BRL' THEN sale_value ELSE 0 END), 0) as total_brl,
        COALESCE(SUM(CASE WHEN sale_currency = 'USD' THEN sale_value ELSE 0 END), 0) as total_usd,
        COALESCE(SUM(CASE WHEN sale_currency = 'BRL' THEN quantity ELSE 0 END), 0) as items_brl,
        COALESCE(SUM(CASE WHEN sale_currency = 'USD' THEN quantity ELSE 0 END), 0) as items_usd
      FROM transactions
      WHERE client_id = ?
    `, [id]);

    const itemsPurchased = await dbAll(`
      SELECT i.name as item_name, SUM(t.quantity) as total_qty
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE t.client_id = ?
      GROUP BY i.name
      ORDER BY total_qty DESC
    `, [id]);

    const history = await dbAll(`
      SELECT t.id, t.type, t.quantity, t.notes, t.timestamp,
             t.sale_value, t.sale_currency, t.reduce_stock,
             i.name as item_name,
             acc_from.name as from_account_name,
             COALESCE(op.nickname, op.username) as operator_name
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      LEFT JOIN accounts acc_from ON t.from_account_id = acc_from.id
      JOIN users op ON t.operator_id = op.id
      WHERE t.client_id = ?
      ORDER BY t.timestamp DESC
    `, [id]);

    const itemsBrl = parseFloat(stats.items_brl || 0);
    const itemsUsd = parseFloat(stats.items_usd || 0);
    const totalBrl = parseFloat(stats.total_brl || 0);
    const totalUsd = parseFloat(stats.total_usd || 0);

    const bagsBrl = itemsBrl / 26.0;
    const bagsUsd = itemsUsd / 26.0;

    const ticketMedioBrl = bagsBrl > 0 ? totalBrl / bagsBrl : 0;
    const ticketMedioUsd = bagsUsd > 0 ? totalUsd / bagsUsd : 0;

    res.json({
      client,
      stats: {
        total_orders: stats.total_orders || 0,
        total_items: stats.total_items || 0,
        last_order_date: stats.last_order_date || null,
        total_brl: totalBrl,
        total_usd: totalUsd,
        ticket_medio_brl: ticketMedioBrl,
        ticket_medio_usd: ticketMedioUsd
      },
      itemsPurchased,
      history
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar cliente (admin only)
app.put('/api/clients/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
  }

  try {
    const existing = await dbGet('SELECT * FROM clients WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Cliente não localizado.' });
    }

    await dbRun('UPDATE clients SET name = ? WHERE id = ?', [name.trim(), id]);
    res.json({ message: 'Cliente editado com sucesso.' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed') || err.message.includes('unique constraint')) {
      return res.status(400).json({ error: 'Cliente com este nome/ID Embark já cadastrado.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Excluir cliente (admin only)
app.delete('/api/clients/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await dbGet('SELECT * FROM clients WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Cliente não localizado.' });
    }

    // Desassociar transações deste cliente para preservar histórico financeiro
    await dbRun('UPDATE transactions SET client_id = NULL WHERE client_id = ?', [id]);
    
    // Deletar o cliente
    await dbRun('DELETE FROM clients WHERE id = ?', [id]);
    res.json({ message: 'Cliente removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE LOGINS DOS OPERADORES
// ==========================================

// Listar logins de um operador (admin ou o próprio operador)
app.get('/api/users/:id/logins', authenticate, async (req, res) => {
  const { id } = req.params;
  // Operadores só podem ver seus próprios logins
  if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  try {
    const logins = await dbAll('SELECT * FROM operator_logins WHERE user_id = ? ORDER BY created_at DESC', [id]);
    res.json(logins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Operador busca seus próprios logins
app.get('/api/my-logins', authenticate, async (req, res) => {
  try {
    const logins = await dbAll('SELECT * FROM operator_logins WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(logins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adicionar login a um operador (admin only)
app.post('/api/users/:id/logins', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { platform, platform_custom, login, password, token } = req.body;

  if (!platform || !login || !password) {
    return res.status(400).json({ error: 'Plataforma, login e senha são obrigatórios.' });
  }
  if (platform === 'other' && (!platform_custom || !platform_custom.trim())) {
    return res.status(400).json({ error: 'Especifique o nome da plataforma.' });
  }

  // Verificar limite de 5 logins
  const count = await dbGet('SELECT COUNT(*) as count FROM operator_logins WHERE user_id = ?', [id]);
  if (count.count >= 5) {
    return res.status(400).json({ error: 'Limite de 5 contas por operador atingido.' });
  }

  try {
    await dbRun(
      'INSERT INTO operator_logins (user_id, platform, platform_custom, login, password, token) VALUES (?, ?, ?, ?, ?, ?)',
      [id, platform, platform === 'other' ? platform_custom.trim() : null, login.trim(), password, token || null]
    );
    res.status(201).json({ message: 'Conta adicionada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar login de operador (admin only)
app.put('/api/operator-logins/:loginId', authenticate, requireAdmin, async (req, res) => {
  const { loginId } = req.params;
  const { platform, platform_custom, login, password, token } = req.body;

  if (!platform || !login || !password) {
    return res.status(400).json({ error: 'Plataforma, login e senha são obrigatórios.' });
  }
  if (platform === 'other' && (!platform_custom || !platform_custom.trim())) {
    return res.status(400).json({ error: 'Especifique o nome da plataforma.' });
  }

  try {
    const existing = await dbGet('SELECT * FROM operator_logins WHERE id = ?', [loginId]);
    if (!existing) {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }

    await dbRun(
      'UPDATE operator_logins SET platform = ?, platform_custom = ?, login = ?, password = ?, token = ? WHERE id = ?',
      [platform, platform === 'other' ? platform_custom.trim() : null, login.trim(), password, token || null, loginId]
    );
    res.json({ message: 'Conta editada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir login de operador (admin only)
app.delete('/api/operator-logins/:loginId', authenticate, requireAdmin, async (req, res) => {
  const { loginId } = req.params;
  try {
    const existing = await dbGet('SELECT * FROM operator_logins WHERE id = ?', [loginId]);
    if (!existing) {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }
    await dbRun('DELETE FROM operator_logins WHERE id = ?', [loginId]);
    res.json({ message: 'Conta removida com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE LICENÇAS (CONTAS MÃE E FILHA)
// ==========================================

// Listar todas as licenças
app.get('/api/licenses', authenticate, async (req, res) => {
  try {
    const licenses = await dbAll(`
      SELECT l.*, mother.login as mother_login, u.username as operator_username, u.nickname as operator_nickname
      FROM licenses l
      LEFT JOIN licenses mother ON l.mother_id = mother.id
      LEFT JOIN users u ON l.operator_id = u.id
      ORDER BY l.type DESC, l.login ASC
    `);
    res.json(licenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/licenses', authenticate, async (req, res) => {
  const { login, password, type, mother_id, operator_id, status, card_used, token, refunded, account_username, token_status } = req.body;

  if (!login || !password || !type) {
    return res.status(400).json({ error: 'Login, senha e tipo (mother/child) são obrigatórios.' });
  }

  if (type !== 'mother' && type !== 'child') {
    return res.status(400).json({ error: 'Tipo de licença inválido.' });
  }

  if (type === 'child' && !mother_id) {
    return res.status(400).json({ error: 'Uma conta filha deve estar vinculada a uma conta mãe.' });
  }

  try {
    // Se for operador comum, limpar campos protegidos
    const finalOperatorId = req.user.role === 'admin' ? (operator_id ? parseInt(operator_id) : null) : null;
    const finalStatus = req.user.role === 'admin' ? (status || 'active') : 'active';
    const finalCardUsed = req.user.role === 'admin' ? (card_used || null) : null;
    const finalRefunded = req.user.role === 'admin' ? (refunded || 'no') : 'no';
    const finalMotherId = type === 'child' ? parseInt(mother_id) : null;
    const finalAccountUsername = type === 'child' ? (account_username ? account_username.trim() : null) : null;
    const finalTokenStatus = type === 'child' ? (token_status || 'empty') : 'empty';
    const finalToken = type === 'child' ? (token ? token.trim() : null) : null;

    if (finalMotherId) {
      const motherExists = await dbGet('SELECT id FROM licenses WHERE id = ? AND type = \'mother\'', [finalMotherId]);
      if (!motherExists) {
        return res.status(400).json({ error: 'Conta mãe de associação não encontrada.' });
      }
    }

    await dbRun(
      'INSERT INTO licenses (login, password, type, mother_id, operator_id, status, card_used, token, refunded, account_username, token_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [login.trim(), password, type, finalMotherId, finalOperatorId, finalStatus, finalCardUsed, finalToken, finalRefunded, finalAccountUsername, finalTokenStatus]
    );

    res.status(201).json({ message: 'Licença cadastrada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar licença (Admin ou Operador com restrições)
app.put('/api/licenses/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { login, password, type, mother_id, operator_id, status, card_used, token, refunded, account_username, token_status } = req.body;

  try {
    const existing = await dbGet('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Licença não encontrada.' });
    }

    let finalLogin = login ? login.trim() : existing.login;
    let finalPassword = password || existing.password;
    let finalType = type || existing.type;
    let finalMotherId = finalType === 'child' ? parseInt(mother_id || existing.mother_id) : null;
    let finalOperatorId = operator_id ? parseInt(operator_id) : existing.operator_id;
    let finalStatus = status || existing.status;
    let finalCardUsed = card_used || existing.card_used;
    let finalRefunded = refunded || existing.refunded;
    let finalAccountUsername = finalType === 'child' ? (account_username ? account_username.trim() : existing.account_username) : null;
    let finalTokenStatus = finalType === 'child' ? (token_status || existing.token_status || 'empty') : 'empty';
    let finalToken = finalType === 'child' ? (token ? token.trim() : existing.token) : null;

    if (req.user.role !== 'admin') {
      // Operador comum: força a manter as informações originais, exceto status e token_status!
      finalLogin = existing.login;
      finalPassword = existing.password;
      finalType = existing.type;
      finalMotherId = existing.mother_id;
      finalOperatorId = existing.operator_id;
      finalCardUsed = existing.card_used;
      finalRefunded = existing.refunded;
      finalAccountUsername = existing.account_username;
      finalToken = existing.token;

      // Restringir alterações de status pelo operador
      if (status && status !== 'active' && status !== 'banned') {
        return res.status(403).json({ error: 'Operadores só podem alterar o status para Ativa ou Banida.' });
      }
      finalStatus = status || existing.status;
      finalTokenStatus = existing.type === 'child' ? (token_status || existing.token_status || 'empty') : 'empty';
    } else {
      // Admin: validação padrão de campos requeridos
      if (!login || !password || !type) {
        return res.status(400).json({ error: 'Login, senha e tipo são obrigatórios.' });
      }
      if (finalMotherId) {
        const motherExists = await dbGet('SELECT id FROM licenses WHERE id = ? AND type = \'mother\'', [finalMotherId]);
        if (!motherExists) {
          return res.status(400).json({ error: 'Conta mãe de associação não encontrada.' });
        }
      }
    }

    await dbRun(
      'UPDATE licenses SET login = ?, password = ?, type = ?, mother_id = ?, operator_id = ?, status = ?, card_used = ?, token = ?, refunded = ?, account_username = ?, token_status = ? WHERE id = ?',
      [finalLogin, finalPassword, finalType, finalMotherId, finalOperatorId, finalStatus, finalCardUsed, finalToken, finalRefunded, finalAccountUsername, finalTokenStatus, id]
    );

    res.json({ message: 'Licença editada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir licença (Apenas Admin)
app.delete('/api/licenses/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await dbGet('SELECT * FROM licenses WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Licença não encontrada.' });
    }

    await dbRun('DELETE FROM licenses WHERE id = ?', [id]);
    res.json({ message: 'Licença removida com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE TRANSAÇÕES (REGISTRO & HISTÓRICO)
// ==========================================

app.get('/api/transactions', authenticate, async (req, res) => {
  try {
    // Operadores veem apenas movimentações feitas por outros operadores (não-admin)
    // Admins veem o histórico completo
    const operatorFilter = req.user.role !== 'admin' ? "AND op.role = 'operator'" : '';

    const sql = `
      SELECT t.id, t.type, t.quantity, t.notes, t.timestamp,
             t.sale_value, t.sale_currency, t.reduce_stock,
             i.name as item_name, i.category as item_category,
             acc_from.name as from_account_name,
             acc_to.name as to_account_name,
             c.name as client_name,
             COALESCE(op.nickname, op.username) as operator_name,
             COALESCE(hlp.nickname, hlp.username) as helper_name
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      LEFT JOIN accounts acc_from ON t.from_account_id = acc_from.id
      LEFT JOIN accounts acc_to ON t.to_account_id = acc_to.id
      LEFT JOIN clients c ON t.client_id = c.id
      JOIN users op ON t.operator_id = op.id
      LEFT JOIN users hlp ON t.helper_id = hlp.id
      WHERE 1=1 ${operatorFilter}
      ORDER BY t.timestamp DESC
      LIMIT 100
    `;
    const transactions = await dbAll(sql);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', authenticate, async (req, res) => {
  const { type, itemId, quantity, fromAccountId, toAccountId, helperId, notes, clientId, saleValue, saleCurrency, reduceStock, newClientName } = req.body;
  const operatorId = req.user.id;

  if (!type || !itemId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Dados de transação inválidos. A quantidade deve ser maior que zero.' });
  }

  try {
    let finalClientId = clientId;

    // Se for tipo sale (venda) e precisar criar um novo cliente de forma automática
    if (type === 'sale' && !finalClientId && newClientName) {
      const clientNameClean = newClientName.trim();
      // Verificar se o cliente já existe por nome
      let existingClient = await dbGet('SELECT id FROM clients WHERE name = ?', [clientNameClean]);
      if (existingClient) {
        finalClientId = existingClient.id;
      } else {
        const insertClient = await dbRun('INSERT INTO clients (name) VALUES (?)', [clientNameClean]);
        finalClientId = insertClient.lastID;
      }
    }

    const result = await executeTransaction({
      type,
      itemId: parseInt(itemId),
      quantity: parseInt(quantity),
      fromAccountId: fromAccountId ? parseInt(fromAccountId) : null,
      toAccountId: toAccountId ? parseInt(toAccountId) : null,
      operatorId,
      helperId: helperId ? parseInt(helperId) : null,
      notes,
      clientId: finalClientId ? parseInt(finalClientId) : null,
      saleValue: saleValue ? parseFloat(saleValue) : null,
      saleCurrency: saleCurrency || null,
      reduceStock: reduceStock ? 1 : 0
    });

    res.status(201).json({ message: 'Transação registrada com sucesso!', transactionId: result.transactionId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// FUNÇÕES AUXILIARES E ROTAS DE INTEGRAÇÃO COM ARC LEDGER (EXTERNAL SYNC)
// ==========================================

// Função auxiliar para sincronizar uma única transferência do script
async function syncSingleTransfer(transfer, operatorUsername) {
  const { id, from, to, itemNames, note, date } = transfer;
  if (!id || !from || !to || !itemNames) {
    throw new Error('Dados de transferência incompletos.');
  }

  // 1. Resolver Operador
  let operator = await dbGet('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [operatorUsername || '']);
  if (!operator) {
    // Tenta pegar o primeiro operador ou admin cadastrado como fallback para não quebrar
    operator = await dbGet('SELECT id FROM users ORDER BY role DESC, id ASC');
    if (!operator) {
      throw new Error('Nenhum usuário cadastrado no sistema para associar a movimentação.');
    }
  }
  const operatorId = operator.id;

  // 2. Verificar Duplicidade
  const extMarker = `[ARC Ledger ID: ${id}]`;
  const existing = await dbGet('SELECT id FROM transactions WHERE notes LIKE ?', [`%${extMarker}%`]);
  if (existing) {
    return { status: 'ignored', message: 'Já sincronizado.' };
  }

  // 3. Resolver Contas de Origem/Destino
  let fromAcc = await dbGet('SELECT id FROM accounts WHERE name = ?', [from]);
  if (!fromAcc) {
    const res = await dbRun('INSERT INTO accounts (name, type, status) VALUES (?, "duper", "active")', [from]);
    fromAcc = { id: res.lastID };
  }

  let toAcc = null;
  let clientId = null;
  let txType = 'transfer';

  // Verificar se o destino é um cliente (ex: cliente_joao ou se já existe como cliente)
  const toClean = to.trim();
  const isClient = toClean.toLowerCase().startsWith('cliente_') || toClean.toLowerCase().startsWith('client_');
  let clientName = toClean;
  if (isClient) {
    clientName = toClean.replace(/^(cliente_|client_)/i, '').trim();
  }

  let client = await dbGet('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)', [clientName.toLowerCase()]);
  if (client) {
    clientId = client.id;
    txType = 'sale';
  } else if (isClient) {
    const res = await dbRun('INSERT INTO clients (name) VALUES (?)', [clientName]);
    clientId = res.lastID;
    txType = 'sale';
  } else {
    // É uma conta de cofre/stash normal
    let toAccDb = await dbGet('SELECT id FROM accounts WHERE name = ?', [toClean]);
    if (!toAccDb) {
      const res = await dbRun('INSERT INTO accounts (name, type, status) VALUES (?, "cofre", "active")', [toClean]);
      toAcc = { id: res.lastID };
    } else {
      toAcc = toAccDb;
    }
  }

  // 4. Resolver Itens e Agrupar Quantidades
  const counts = {};
  itemNames.forEach(it => {
    const name = it.name || 'Desconhecido';
    counts[name] = (counts[name] || 0) + 1;
  });

  const notesWithId = `${note || ''} ${extMarker}`.trim();

  for (const [itemName, qty] of Object.entries(counts)) {
    let item = await dbGet('SELECT id FROM items WHERE LOWER(name) = LOWER(?)', [itemName.toLowerCase()]);
    if (!item) {
      const res = await dbRun('INSERT INTO items (name, category) VALUES (?, "Importado")', [itemName]);
      item = { id: res.lastID };
    }

    await executeTransaction({
      type: txType,
      itemId: item.id,
      quantity: qty,
      fromAccountId: fromAcc.id,
      toAccountId: toAcc ? toAcc.id : null,
      operatorId,
      helperId: null,
      notes: notesWithId,
      clientId,
      saleValue: null,
      saleCurrency: null,
      reduceStock: 0
    });
  }

  return { status: 'synced', message: 'Sincronizado com sucesso.' };
}

// 1. Sincronizar movimentação única
app.post('/api/external/sync-ledger', async (req, res) => {
  const { from, to, items, note, date, id, operator } = req.body;
  if (!id || !from || !to || !items) {
    return res.status(400).json({ error: 'Dados de sincronização incompletos.' });
  }

  try {
    const result = await syncSingleTransfer({
      id,
      from,
      to,
      itemNames: items,
      note,
      date
    }, operator);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Sincronizar histórico em lote (batch)
app.post('/api/external/sync-ledger/batch', async (req, res) => {
  const { transfers, operator } = req.body;
  if (!Array.isArray(transfers)) {
    return res.status(400).json({ error: 'Lista de transferências inválida.' });
  }

  try {
    let syncedCount = 0;
    let ignoredCount = 0;
    for (const tx of transfers) {
      const result = await syncSingleTransfer(tx, operator);
      if (result.status === 'synced') syncedCount++;
      if (result.status === 'ignored') ignoredCount++;
    }
    res.json({ count: syncedCount, ignored: ignoredCount, message: `${syncedCount} registros importados, ${ignoredCount} duplicados ignorados.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Sincronizar inventário/estoque em tempo real de uma conta
app.post('/api/external/sync-inventory', async (req, res) => {
  const { account, inventory } = req.body;
  if (!account || !Array.isArray(inventory)) {
    return res.status(400).json({ error: 'Dados de inventário incompletos ou inválidos.' });
  }

  try {
    // Achar ou criar a conta
    const accountClean = account.trim();
    let acc = await dbGet('SELECT id FROM accounts WHERE name = ?', [accountClean]);
    if (!acc) {
      // Como o script escaneia o próprio perfil aberto, é uma conta de duper/operador
      const insertAcc = await dbRun('INSERT INTO accounts (name, type, status) VALUES (?, "duper", "active")', [accountClean]);
      acc = { id: insertAcc.lastID };
    }

    // Agrupar itens por nome
    const counts = {};
    inventory.forEach(it => {
      const name = it.name || 'Desconhecido';
      counts[name] = (counts[name] || 0) + 1;
    });

    // Limpar estoque atual desta conta no banco
    await dbRun('DELETE FROM inventories WHERE account_id = ?', [acc.id]);

    // Inserir os novos itens
    for (const [itemName, qty] of Object.entries(counts)) {
      let item = await dbGet('SELECT id FROM items WHERE LOWER(name) = LOWER(?)', [itemName.toLowerCase()]);
      if (!item) {
        const res = await dbRun('INSERT INTO items (name, category) VALUES (?, "Importado")', [itemName]);
        item = { id: res.lastID };
      }
      await dbRun('INSERT INTO inventories (account_id, item_id, quantity) VALUES (?, ?, ?)', [acc.id, item.id, qty]);
    }

    res.json({ message: 'Estoque da conta sincronizado com sucesso!', accountId: acc.id, itemsCount: Object.keys(counts).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// METRICAS DO DASHBOARD
// ==========================================

app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  const { period } = req.query;
  await getExchangeRate(); // Garante cotação atualizada no Serverless
  
  const isPg = !!process.env.DATABASE_URL;
  let dateFilter = isPg ? "DATE(timestamp) = CURRENT_DATE" : "DATE(timestamp) = DATE('now')";
  let periodDays = 1;
  
  if (period === '7days') {
    dateFilter = isPg ? "DATE(timestamp) >= CURRENT_DATE - INTERVAL '7 days'" : "DATE(timestamp) >= DATE('now', '-7 days')";
    periodDays = 7;
  } else if (period === '30days') {
    dateFilter = isPg ? "DATE(timestamp) >= CURRENT_DATE - INTERVAL '30 days'" : "DATE(timestamp) >= DATE('now', '-30 days')";
    periodDays = 30;
  } else if (period === 'all') {
    dateFilter = "1=1";
    periodDays = 365; // placeholder
  }

  try {
    const accountsCount = await dbGet("SELECT COUNT(*) as count FROM accounts WHERE status = 'active'");
    const itemsCount = await dbGet("SELECT COUNT(*) as count FROM items");
    const clientsCount = await dbGet("SELECT COUNT(*) as count FROM clients");
    
    if (req.user.role === 'admin') {
      const transactionsCount = await dbGet(`SELECT COUNT(*) as count FROM transactions WHERE ${dateFilter}`);
      const todayVolume = await dbGet(`SELECT SUM(quantity) as count FROM transactions WHERE ${dateFilter}`);
      
      const salesCount = await dbGet(`SELECT COUNT(*) as count FROM transactions WHERE type = 'sale' AND ${dateFilter}`);
      const salesBrl = await dbGet(`SELECT COALESCE(SUM(sale_value), 0) as total FROM transactions WHERE type = 'sale' AND sale_currency = 'BRL' AND ${dateFilter}`);
      const salesUsd = await dbGet(`SELECT COALESCE(SUM(sale_value), 0) as total FROM transactions WHERE type = 'sale' AND sale_currency = 'USD' AND ${dateFilter}`);

      const dupersStats = await dbAll(`
        SELECT u.id, u.nickname, u.daily_goal, u.payment_per_register,
               COALESCE(u.nickname, u.username) as username,
               COALESCE(SUM(CASE WHEN t.type IN ('transfer', 'fill_account') THEN t.quantity ELSE 0 END), 0) / 26.0 as transactions_period
        FROM users u
        LEFT JOIN transactions t ON u.id = t.operator_id AND ${dateFilter.replace(/timestamp/g, 't.timestamp')}
        WHERE u.role = 'operator'
        GROUP BY u.id, u.username, u.nickname, u.daily_goal, u.payment_per_register
      `);

      // Top 5 transações recentes
      const recentSql = `
        SELECT t.type, t.quantity, t.timestamp, i.name as item_name, COALESCE(op.nickname, op.username) as operator_name
        FROM transactions t
        JOIN items i ON t.item_id = i.id
        JOIN users op ON t.operator_id = op.id
        ORDER BY t.timestamp DESC
        LIMIT 5
      `;
      const recentTransactions = await dbAll(recentSql);

      res.json({
        role: 'admin',
        activeAccounts: accountsCount.count,
        totalItems: itemsCount.count,
        totalClients: clientsCount.count,
        totalTransactions: transactionsCount.count,
        todayVolume: todayVolume.count || 0,
        salesCount: salesCount.count || 0,
        salesBrl: salesBrl.total || 0,
        salesUsd: salesUsd.total || 0,
        salesUsdInBrl: (salesUsd.total || 0) * cachedUsdToBrlRate,
        usdToBrlRate: cachedUsdToBrlRate,
        period: period || 'today',
        dupersStats,
        recentTransactions
      });
    } else {
      // É Operador / Duper
      const operatorId = req.user.id;
      const opInfo = await dbGet('SELECT daily_goal, payment_per_register FROM users WHERE id = ?', [operatorId]);

      // Total de runs baseadas na quantidade (1 run = 26 slots)
      const periodTx = await dbGet(`
        SELECT COALESCE(SUM(quantity), 0) as total_qty FROM transactions 
        WHERE operator_id = ? AND ${dateFilter} AND type IN ('transfer', 'fill_account')
      `, [operatorId]);

      const totalVolume = periodTx.total_qty / 26.0;
      const earnings = totalVolume * (opInfo.payment_per_register !== null && opInfo.payment_per_register !== undefined ? opInfo.payment_per_register : 2.50);

      // Top 5 transações do operador logado
      const recentSql = `
        SELECT t.type, t.quantity, t.timestamp, i.name as item_name, COALESCE(op.nickname, op.username) as operator_name
        FROM transactions t
        JOIN items i ON t.item_id = i.id
        JOIN users op ON t.operator_id = op.id
        WHERE t.operator_id = ?
        ORDER BY t.timestamp DESC
        LIMIT 5
      `;
      const recentTransactions = await dbAll(recentSql, [operatorId]);

      res.json({
        role: 'operator',
        activeAccounts: accountsCount.count,
        totalItems: itemsCount.count,
        totalClients: clientsCount.count,
        totalTransactions: totalVolume,
        todayVolume: totalVolume,
        dailyGoal: opInfo.daily_goal || 1,
        paymentPerRegister: opInfo.payment_per_register !== null && opInfo.payment_per_register !== undefined ? opInfo.payment_per_register : 2.50,
        todayEarnings: earnings,
        period: period || 'today',
        periodDays,
        recentTransactions
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TAXA DE CÂMBIO (USD-BRL) E ATUALIZAÇÃO DIÁRIA
// ==========================================

let cachedUsdToBrlRate = 5.15; // Valor fallback atualizado caso todas as APIs falhem

async function fetchExchangeRate() {
  // 1. Tentar AwesomeAPI (Principal)
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
    if (response.ok) {
      const parsed = await response.json();
      if (parsed && parsed.USDBRL && parsed.USDBRL.bid) {
        const rate = parseFloat(parsed.USDBRL.bid);
        if (!isNaN(rate) && rate > 0) {
          cachedUsdToBrlRate = rate;
          console.log(`[Cotação Dólar - AwesomeAPI] Atualizada: 1 USD = R$ ${cachedUsdToBrlRate.toFixed(4)}`);
          return cachedUsdToBrlRate;
        }
      }
    }
  } catch (e) {
    console.warn('[Cotação Dólar - AwesomeAPI] Falhou, tentando ExchangeRate-API...', e.message);
  }

  // 2. Tentar ExchangeRate-API (Backup 1)
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (response.ok) {
      const parsed = await response.json();
      if (parsed && parsed.rates && parsed.rates.BRL) {
        const rate = parseFloat(parsed.rates.BRL);
        if (!isNaN(rate) && rate > 0) {
          cachedUsdToBrlRate = rate;
          console.log(`[Cotação Dólar - ExchangeRate-API] Atualizada: 1 USD = R$ ${cachedUsdToBrlRate.toFixed(4)}`);
          return cachedUsdToBrlRate;
        }
      }
    }
  } catch (e) {
    console.warn('[Cotação Dólar - ExchangeRate-API] Falhou, tentando OpenER-API...', e.message);
  }

  // 3. Tentar OpenER-API (Backup 2)
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (response.ok) {
      const parsed = await response.json();
      if (parsed && parsed.rates && parsed.rates.BRL) {
        const rate = parseFloat(parsed.rates.BRL);
        if (!isNaN(rate) && rate > 0) {
          cachedUsdToBrlRate = rate;
          console.log(`[Cotação Dólar - OpenER-API] Atualizada: 1 USD = R$ ${cachedUsdToBrlRate.toFixed(4)}`);
          return cachedUsdToBrlRate;
        }
      }
    }
  } catch (e) {
    console.error('[Cotação Dólar - OpenER-API] Falhou.', e.message);
  }

  console.log(`[Cotação Dólar] Usando valor em cache/fallback: R$ ${cachedUsdToBrlRate.toFixed(4)}`);
  return cachedUsdToBrlRate;
}

let lastFetchTime = 0;
async function getExchangeRate() {
  const now = Date.now();
  // Se foi buscado a menos de 2 horas, usa o cache
  if (now - lastFetchTime < 2 * 60 * 60 * 1000) {
    return cachedUsdToBrlRate;
  }
  await fetchExchangeRate();
  lastFetchTime = now;
  return cachedUsdToBrlRate;
}

// ==========================================
// ROTAS FINANCEIRAS, DE HISTÓRICO E DEV (ADMIN ONLY)
// ==========================================

// 1. GET /api/finance/stats - Estatísticas financeiras completas
app.get('/api/finance/stats', authenticate, requireAdmin, async (req, res) => {
  await getExchangeRate(); // Garante cotação atualizada no Serverless
  try {
    const operatorsSql = `
      SELECT u.id, u.nickname, u.payment_per_register, u.daily_goal,
             COALESCE(u.nickname, u.username) as username,
             COUNT(t.id) as total_runs,
             COUNT(t.id) * COALESCE(u.payment_per_register, 2.50) as total_earned
      FROM users u
      LEFT JOIN transactions t ON u.id = t.operator_id
      WHERE u.role = 'operator'
      GROUP BY u.id, u.username, u.nickname, u.payment_per_register, u.daily_goal
    `;
    const operators = await dbAll(operatorsSql);

    // Sum of sales (BRL & USD)
    const salesSql = `
      SELECT sale_currency, SUM(sale_value) as total
      FROM transactions
      WHERE type = 'sale' AND sale_value > 0
      GROUP BY sale_currency
    `;
    const sales = await dbAll(salesSql);
    let salesBrl = 0;
    let salesUsd = 0;
    sales.forEach(s => {
      if (s.sale_currency === 'BRL') salesBrl = s.total;
      if (s.sale_currency === 'USD') salesUsd = s.total;
    });

    // Sum of manual inflows/outflows in cash_transactions
    const cashflowSql = `
      SELECT type, currency, SUM(amount) as total
      FROM cash_transactions
      GROUP BY type, currency
    `;
    const cashflows = await dbAll(cashflowSql);
    let inflowBrl = 0;
    let inflowUsd = 0;
    let outflowBrl = 0;
    let outflowUsd = 0;

    cashflows.forEach(c => {
      if (c.type === 'inflow') {
        if (c.currency === 'BRL') inflowBrl = c.total;
        if (c.currency === 'USD') inflowUsd = c.total;
      } else if (c.type === 'outflow') {
        if (c.currency === 'BRL') outflowBrl = c.total;
        if (c.currency === 'USD') outflowUsd = c.total;
      }
    });

    // Calculations
    const netBrl = salesBrl + inflowBrl - outflowBrl;
    const netUsd = salesUsd + inflowUsd - outflowUsd;
    const consolidatedBrl = netBrl + (netUsd * cachedUsdToBrlRate);

    res.json({
      operators,
      cashSummary: {
        salesBrl,
        salesUsd,
        inflowBrl,
        inflowUsd,
        outflowBrl,
        outflowUsd,
        netBrl,
        netUsd,
        consolidatedBrl,
        usdToBrlRate: cachedUsdToBrlRate
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/finance/cashflow - Histórico de fluxo de caixa
app.get('/api/finance/cashflow', authenticate, requireAdmin, async (req, res) => {
  try {
    const list = await dbAll('SELECT * FROM cash_transactions ORDER BY timestamp DESC LIMIT 200');
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/finance/cashflow - Adicionar fluxo de caixa manual
app.post('/api/finance/cashflow', authenticate, requireAdmin, async (req, res) => {
  const { description, amount, currency, type } = req.body;
  if (!description || !amount || !currency || !type) {
    return res.status(400).json({ error: 'Todos os campos (descrição, valor, moeda, tipo) são obrigatórios.' });
  }
  if (amount <= 0) {
    return res.status(400).json({ error: 'O valor deve ser maior que zero.' });
  }
  if (!['BRL', 'USD'].includes(currency)) {
    return res.status(400).json({ error: 'Moeda inválida. Use BRL ou USD.' });
  }
  if (!['inflow', 'outflow'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido. Use inflow ou outflow.' });
  }

  try {
    await dbRun(
      'INSERT INTO cash_transactions (description, amount, currency, type) VALUES (?, ?, ?, ?)',
      [description.trim(), parseFloat(amount), currency, type]
    );
    res.status(201).json({ message: 'Lançamento financeiro registrado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE /api/finance/cashflow/:id - Remover fluxo de caixa manual
app.delete('/api/finance/cashflow/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const entry = await dbGet('SELECT * FROM cash_transactions WHERE id = ?', [id]);
    if (!entry) {
      return res.status(404).json({ error: 'Lançamento não localizado.' });
    }
    await dbRun('DELETE FROM cash_transactions WHERE id = ?', [id]);
    res.json({ message: 'Lançamento financeiro removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE /api/transactions/:id - Remover transação e reverter estoque
app.delete('/api/transactions/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { deleteTransaction } = require('./database');
    await deleteTransaction(id);
    res.json({ message: 'Transação removida e estoque revertido com sucesso.' });
  } catch (err) {
    let msg = err.message;
    if (
      msg.includes('CHECK constraint failed: quantity >= 0') ||
      msg.includes('violates check constraint') ||
      msg.includes('quantity >= 0')
    ) {
      msg = 'Não é possível remover esta transação pois resultaria em estoque negativo na conta de destino.';
    }
    res.status(400).json({ error: msg });
  }
});

// 6. PUT /api/transactions/:id - Editar transação (campos que não afetam estoque)
app.put('/api/transactions/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { notes, saleValue, saleCurrency, helperId, clientId } = req.body;

  try {
    const tx = await dbGet('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!tx) {
      return res.status(404).json({ error: 'Transação não encontrada.' });
    }

    const finalNotes = notes !== undefined ? notes.trim() : tx.notes;
    const finalSaleValue = saleValue !== undefined ? (saleValue === '' || saleValue === null ? null : parseFloat(saleValue)) : tx.sale_value;
    const finalSaleCurrency = saleCurrency !== undefined ? saleCurrency : tx.sale_currency;
    const finalHelperId = helperId !== undefined ? (helperId === '' || helperId === null ? null : parseInt(helperId)) : tx.helper_id;
    const finalClientId = clientId !== undefined ? (clientId === '' || clientId === null ? null : parseInt(clientId)) : tx.client_id;

    await dbRun(
      `UPDATE transactions 
       SET notes = ?, sale_value = ?, sale_currency = ?, helper_id = ?, client_id = ?
       WHERE id = ?`,
      [finalNotes, finalSaleValue, finalSaleCurrency, finalHelperId, finalClientId, id]
    );

    res.json({ message: 'Transação editada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/dev/reset-dashboard - Backup e reset de dados
app.post('/api/dev/reset-dashboard', authenticate, requireAdmin, async (req, res) => {
  const { resetTransactions, resetStock, resetFinance } = req.body;
  const fs = require('fs');
  const path = require('path');
  
  const isPg = !!process.env.DATABASE_URL;
  let backupName = null;

  try {
    // 1. Fazer backup do banco (apenas se for SQLite local)
    if (!isPg) {
      const activeDbPath = process.env.DATABASE_PATH 
        ? path.resolve(process.env.DATABASE_PATH)
        : path.resolve(__dirname, 'database.db');
      backupName = `database_backup_${Date.now()}.db`;
      const backupPath = path.join(path.dirname(activeDbPath), backupName);
      fs.copyFileSync(activeDbPath, backupPath);
      console.log(`[Backup] Banco de dados salvo em: ${backupPath}`);
    } else {
      console.log('[Backup] Pulado pois o banco ativo é PostgreSQL online');
    }

    // 2. Executar limpezas
    if (resetTransactions) {
      await dbRun('DELETE FROM transactions');
    }
    if (resetStock) {
      await dbRun('DELETE FROM inventories');
    }
    if (resetFinance) {
      await dbRun('DELETE FROM cash_transactions');
    }

    res.json({
      message: 'Valores resetados com sucesso!',
      backupFile: backupName
    });
  } catch (err) {
    res.status(500).json({ error: `Erro no reset e backup: ${err.message}` });
  }
});

// Atualiza a taxa de câmbio a cada 12 horas (apenas se não for ambiente Vercel Serverless)
if (!process.env.VERCEL) {
  setInterval(fetchExchangeRate, 12 * 60 * 60 * 1000);
}

// ==========================================
// INICIALIZAÇÃO E START DO SERVIDOR
// ==========================================

async function startServer() {
  if (!process.env.VERCEL) {
    try {
      await ensureDbInit();
      app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('Falha ao iniciar servidor local:', err.message);
    }
  }
}

startServer();

module.exports = app;
