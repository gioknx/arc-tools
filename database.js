const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');

const isPg = !!process.env.DATABASE_URL;
let db = null;
let pool = null;

if (isPg) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Necessário para conexões seguras com Supabase / Neon
    }
  });
  console.log('Banco de dados: Conectado ao PostgreSQL online (Supabase/Neon)');
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.DATABASE_PATH 
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(__dirname, 'database.db');
    
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao conectar ao banco de dados SQLite local:', err.message);
    } else {
      console.log('Banco de dados: Conectado ao SQLite local:', dbPath);
    }
  });
}

// Função auxiliar para adaptar a sintaxe SQL de SQLite para PostgreSQL
function prepareQuery(sql, params) {
  if (!isPg) return { sql, params };
  
  let index = 1;
  // Substituir marcadores de parâmetro "?" por "$1, $2, $3..." do PostgreSQL
  let convertedSql = sql.replace(/\?/g, () => `$${index++}`);
  
  // Substituir tipos incompatíveis do SQLite para PostgreSQL
  convertedSql = convertedSql.replace(/DATETIME/g, 'TIMESTAMP');
  convertedSql = convertedSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
  
  return { sql: convertedSql, params };
}

// Helper para rodar queries de gravação/alteração (INSERT, UPDATE, DELETE)
const dbRun = async (sql, params = []) => {
  if (isPg) {
    const prepared = prepareQuery(sql, params);
    let querySql = prepared.sql;
    
    // Para obter o ID recém-inserido em PostgreSQL, adicionamos RETURNING id se for INSERT (exceto tabelas sem coluna id)
    const lowerSql = querySql.toLowerCase().trim();
    const isNoIdTable = lowerSql.includes('into sessions') || lowerSql.includes('into inventories');
    if (lowerSql.startsWith('insert into') && !lowerSql.includes('returning') && !isNoIdTable) {
      querySql += ' RETURNING id';
    }
    
    const res = await pool.query(querySql, prepared.params);
    const lastID = res.rows[0]?.id || null;
    return { lastID, changes: res.rowCount };
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};

// Helper para obter uma única linha
const dbGet = async (sql, params = []) => {
  if (isPg) {
    const prepared = prepareQuery(sql, params);
    const res = await pool.query(prepared.sql, prepared.params);
    return res.rows[0];
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

// Helper para obter múltiplas linhas
const dbAll = async (sql, params = []) => {
  if (isPg) {
    const prepared = prepareQuery(sql, params);
    const res = await pool.query(prepared.sql, prepared.params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Inicialização das tabelas
async function initDb() {
  if (!isPg) {
    // Habilitar chaves estrangeiras no SQLite
    await dbRun('PRAGMA foreign_keys = ON;');
  }

  // Tabela de Usuários
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator')),
      payment_per_register REAL DEFAULT 2.50,
      daily_goal INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Clientes
  await dbRun(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Contas
  await dbRun(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      login_method TEXT,
      token TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'banned')),
      type TEXT DEFAULT 'duper' CHECK(type IN ('cofre', 'duper')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Itens (Tipos de recursos/materiais)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT,
      color TEXT DEFAULT 'gray',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Estoque por Conta (Estoque atual)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS inventories (
      account_id INTEGER,
      item_id INTEGER,
      quantity INTEGER DEFAULT 0 CHECK(quantity >= 0),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (account_id, item_id)
    )
  `);

  // Tabela de Transações (Histórico de Movimentações)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('transfer', 'adjust_add', 'adjust_sub', 'sale', 'fill_account')),
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      from_account_id INTEGER,
      to_account_id INTEGER,
      operator_id INTEGER NOT NULL,
      helper_id INTEGER,
      notes TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      client_id INTEGER,
      sale_value REAL,
      sale_currency TEXT,
      reduce_stock INTEGER DEFAULT 0
    )
  `);

  // Migrações dinâmicas para adicionar colunas em bases já criadas (SQLite e PG)
  try {
    await dbRun('ALTER TABLE users ADD COLUMN payment_per_register REAL DEFAULT 2.50');
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun('UPDATE users SET payment_per_register = 2.50 WHERE (payment_per_register IS NULL OR payment_per_register = 0.0) AND role = "operator"');
  } catch (e) { /* Ignorar */ }
  try {
    await dbRun('ALTER TABLE users ADD COLUMN daily_goal INTEGER DEFAULT 1');
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun('ALTER TABLE users ADD COLUMN nickname TEXT');
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun("ALTER TABLE accounts ADD COLUMN type TEXT DEFAULT 'duper'");
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun("ALTER TABLE items ADD COLUMN color TEXT DEFAULT 'gray'");
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun('ALTER TABLE licenses ADD COLUMN token TEXT');
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun("ALTER TABLE licenses ADD COLUMN refunded TEXT DEFAULT 'no'");
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun("UPDATE licenses SET refunded = 'yes' WHERE status = 'refunded' AND (refunded IS NULL OR refunded = 'no')");
  } catch (e) { /* Ignorar */ }
  try {
    await dbRun("ALTER TABLE licenses ADD COLUMN account_username TEXT");
  } catch (e) { /* Ignorar se já existe */ }
  try {
    await dbRun("ALTER TABLE licenses ADD COLUMN token_status TEXT DEFAULT 'empty'");
  } catch (e) { /* Ignorar se já existe */ }

  // Tabela de Transações de Caixa da Empresa (Financeiro)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS cash_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL CHECK(currency IN ('BRL', 'USD')),
      type TEXT NOT NULL CHECK(type IN ('inflow', 'outflow')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Logins dos Operadores (Contas designadas pelo Admin)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS operator_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('steam', 'xbox', 'other')),
      platform_custom TEXT,
      login TEXT NOT NULL,
      password TEXT NOT NULL,
      token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Sessões (Necessária para Vercel Serverless)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Licenças (Contas Mãe e Filha)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL,
      password TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('mother', 'child')),
      mother_id INTEGER,
      operator_id INTEGER,
      status TEXT NOT NULL CHECK(status IN ('active', 'refunded', 'banned')) DEFAULT 'active',
      card_used TEXT,
      token TEXT,
      refunded TEXT DEFAULT 'no' CHECK(refunded IN ('yes', 'no', 'pending')),
      account_username TEXT,
      token_status TEXT DEFAULT 'empty' CHECK(token_status IN ('full', 'empty', 'filling')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mother_id) REFERENCES licenses(id) ON DELETE CASCADE,
      FOREIGN KEY(operator_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  console.log('Estrutura de tabelas inicializada com sucesso.');

  // Criar Usuário Admin Padrão se não existir
  const adminExists = await dbGet('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminExists) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt);
    await dbRun('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
    console.log('Usuário admin padrão criado (usuario: admin / senha: admin123).');
  }

  // Criar alguns itens padrões de Arc Raiders se não existirem
  const itemsCount = await dbGet('SELECT COUNT(*) as count FROM items');
  if (parseInt(itemsCount.count) === 0) {
    const defaultItems = [
      { name: 'Cobre Refinado', category: 'Recursos Raros' },
      { name: 'Placa de Aço', category: 'Recursos Comuns' },
      { name: 'Componente Eletrônico', category: 'Tecnologia' },
      { name: 'Nódulo de Energia', category: 'Raros' },
      { name: 'Núcleo de Raider', category: 'Legendários' }
    ];
    for (const item of defaultItems) {
      await dbRun('INSERT INTO items (name, category) VALUES (?, ?)', [item.name, item.category]);
    }
    console.log('Itens padrões de Arc Raiders cadastrados.');
  }
}

// Registrar uma transação e atualizar estoque
async function executeTransaction({ type, itemId, quantity, fromAccountId, toAccountId, operatorId, helperId, notes, clientId, saleValue, saleCurrency, reduceStock }) {
  if (isPg) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const runQuery = async (sql, params) => {
        const prep = prepareQuery(sql, params);
        let q = prep.sql;
        const lowerQ = q.toLowerCase().trim();
        const isNoIdTable = lowerQ.includes('into sessions') || lowerQ.includes('into inventories');
        if (lowerQ.startsWith('insert into') && !lowerQ.includes('returning') && !isNoIdTable) {
          q += ' RETURNING id';
        }
        const res = await client.query(q, prep.params);
        return { lastID: res.rows[0]?.id || null, changes: res.rowCount };
      };

      const getQuery = async (sql, params) => {
        const prep = prepareQuery(sql, params);
        const res = await client.query(prep.sql, prep.params);
        return res.rows[0];
      };

      if (type === 'sale') {
        if (!fromAccountId) throw new Error('Conta de origem é obrigatória para este tipo de transação.');
        if (!clientId) throw new Error('Cliente é obrigatório para registrar uma venda.');

        if (reduceStock) {
          const row = await getQuery('SELECT quantity FROM inventories WHERE account_id = ? AND item_id = ?', [fromAccountId, itemId]);
          const currentQty = row ? row.quantity : 0;
          if (currentQty < quantity) {
            throw new Error(`Saldo insuficiente na conta de origem. Estoque atual: ${currentQty}`);
          }
          await runQuery('UPDATE inventories SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ? AND item_id = ?', [quantity, fromAccountId, itemId]);
        }
      } else {
        if (type === 'transfer' || type === 'adjust_sub') {
          if (!fromAccountId) throw new Error('Conta de origem é obrigatória para este tipo de transação.');
          const row = await getQuery('SELECT quantity FROM inventories WHERE account_id = ? AND item_id = ?', [fromAccountId, itemId]);
          const currentQty = row ? row.quantity : 0;
          if (currentQty < quantity) {
            throw new Error(`Saldo insuficiente na conta de origem. Estoque atual: ${currentQty}`);
          }
          await runQuery('UPDATE inventories SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ? AND item_id = ?', [quantity, fromAccountId, itemId]);
        }

        if (type === 'transfer' || type === 'adjust_add' || type === 'fill_account') {
          if (!toAccountId) throw new Error('Conta de destino é obrigatória para este tipo de transação.');
          await runQuery(
            `INSERT INTO inventories (account_id, item_id, quantity, updated_at) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(account_id, item_id) 
             DO UPDATE SET quantity = inventories.quantity + EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
            [toAccountId, itemId, quantity]
          );
        }
      }

      const res = await runQuery(
        `INSERT INTO transactions (type, item_id, quantity, from_account_id, to_account_id, operator_id, helper_id, notes, client_id, sale_value, sale_currency, reduce_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [type, itemId, quantity, fromAccountId, toAccountId, operatorId, helperId, notes, clientId, saleValue, saleCurrency, reduceStock ? 1 : 0]
      );

      await client.query('COMMIT');
      return { transactionId: res.lastID };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // Código SQLite original em bloco sincronizado serializado
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const handleErr = (err) => {
          db.run('ROLLBACK');
          reject(err);
        };

        try {
          if (type === 'sale') {
            if (!fromAccountId) return handleErr(new Error('Conta de origem é obrigatória para este tipo de transação.'));
            if (!clientId) return handleErr(new Error('Cliente é obrigatório para registrar uma venda.'));

            if (reduceStock) {
              db.get(
                'SELECT quantity FROM inventories WHERE account_id = ? AND item_id = ?',
                [fromAccountId, itemId],
                (err, row) => {
                  if (err) return handleErr(err);
                  const currentQty = row ? row.quantity : 0;
                  if (currentQty < quantity) {
                    return handleErr(new Error(`Saldo insuficiente na conta de origem. Estoque atual: ${currentQty}`));
                  }

                  db.run(
                    'UPDATE inventories SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ? AND item_id = ?',
                    [quantity, fromAccountId, itemId],
                    (err) => {
                      if (err) return handleErr(err);
                      insertTransactionRecord();
                    }
                  );
                }
              );
            } else {
              insertTransactionRecord();
            }
          } else {
            if (type === 'transfer' || type === 'adjust_sub') {
              if (!fromAccountId) throw new Error('Conta de origem é obrigatória para este tipo de transação.');

              db.get(
                'SELECT quantity FROM inventories WHERE account_id = ? AND item_id = ?',
                [fromAccountId, itemId],
                (err, row) => {
                  if (err) return handleErr(err);
                  const currentQty = row ? row.quantity : 0;
                  if (currentQty < quantity) {
                    return handleErr(new Error(`Saldo insuficiente na conta de origem. Estoque atual: ${currentQty}`));
                  }

                  db.run(
                    'UPDATE inventories SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ? AND item_id = ?',
                    [quantity, fromAccountId, itemId],
                    (err) => {
                      if (err) return handleErr(err);
                      continueToDest();
                    }
                  );
                }
              );
            } else {
              continueToDest();
            }
          }

          function continueToDest() {
            if (type === 'transfer' || type === 'adjust_add' || type === 'fill_account') {
              if (!toAccountId) {
                return handleErr(new Error('Conta de destino é obrigatória para este tipo de transação.'));
              }

              db.run(
                `INSERT INTO inventories (account_id, item_id, quantity, updated_at) 
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(account_id, item_id) 
                 DO UPDATE SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP`,
                [toAccountId, itemId, quantity, quantity],
                (err) => {
                  if (err) return handleErr(err);
                  insertTransactionRecord();
                }
              );
            } else {
              insertTransactionRecord();
            }
          }

          function insertTransactionRecord() {
            db.run(
              `INSERT INTO transactions (type, item_id, quantity, from_account_id, to_account_id, operator_id, helper_id, notes, client_id, sale_value, sale_currency, reduce_stock)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [type, itemId, quantity, fromAccountId, toAccountId, operatorId, helperId, notes, clientId, saleValue, saleCurrency, reduceStock ? 1 : 0],
              function (err) {
                if (err) return handleErr(err);
                
                db.run('COMMIT', (err) => {
                  if (err) return handleErr(err);
                  resolve({ transactionId: this.lastID });
                });
              }
            );
          }
        } catch (err) {
          db.run('ROLLBACK');
          reject(err);
        }
      });
    });
  }
}

// Excluir uma transação e reverter seu impacto no estoque de forma transacional
async function deleteTransaction(id) {
  if (isPg) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Obter detalhes da transação
      const txRes = await client.query('SELECT * FROM transactions WHERE id = $1', [id]);
      const tx = txRes.rows[0];
      if (!tx) {
        throw new Error('Transação não encontrada.');
      }

      const qty = tx.quantity;
      const itemId = tx.item_id;

      // 2. Reverter estoque correspondente
      if (tx.type === 'transfer') {
        // Devolver para a origem
        await client.query(
          `INSERT INTO inventories (account_id, item_id, quantity, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(account_id, item_id) DO UPDATE SET quantity = inventories.quantity + EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
          [tx.from_account_id, itemId, qty]
        );
        // Retirar do destino
        await client.query(
          `UPDATE inventories SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2 AND item_id = $3`,
          [qty, tx.to_account_id, itemId]
        );
      } else if (tx.type === 'fill_account' || tx.type === 'adjust_add') {
        // Retirar do destino
        await client.query(
          `UPDATE inventories SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2 AND item_id = $3`,
          [qty, tx.to_account_id, itemId]
        );
      } else if (tx.type === 'adjust_sub') {
        // Devolver para a origem
        await client.query(
          `INSERT INTO inventories (account_id, item_id, quantity, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(account_id, item_id) DO UPDATE SET quantity = inventories.quantity + EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
          [tx.from_account_id, itemId, qty]
        );
      } else if (tx.type === 'sale') {
        if (tx.reduce_stock === 1 || tx.reduce_stock === true) {
          // Devolver para a origem
          await client.query(
            `INSERT INTO inventories (account_id, item_id, quantity, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT(account_id, item_id) DO UPDATE SET quantity = inventories.quantity + EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
            [tx.from_account_id, itemId, qty]
          );
        }
      }

      // 3. Excluir o registro da transação
      await client.query('DELETE FROM transactions WHERE id = $1', [id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // Implementação SQLite original
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const rollback = (err) => {
          db.run('ROLLBACK');
          reject(err);
        };

        db.get('SELECT * FROM transactions WHERE id = ?', [id], (err, tx) => {
          if (err) return rollback(err);
          if (!tx) return rollback(new Error('Transação não encontrada.'));

          const qty = tx.quantity;
          const itemId = tx.item_id;

          const performDelete = () => {
            db.run('DELETE FROM transactions WHERE id = ?', [id], (err) => {
              if (err) return rollback(err);
              db.run('COMMIT', (err) => {
                if (err) return rollback(err);
                resolve();
              });
            });
          };

          if (tx.type === 'transfer') {
            db.run(
              `INSERT INTO inventories (account_id, item_id, quantity) VALUES (?, ?, ?)
               ON CONFLICT(account_id, item_id) DO UPDATE SET quantity = quantity + ?`,
              [tx.from_account_id, itemId, qty, qty],
              (err) => {
                if (err) return rollback(err);
                db.run(
                  `UPDATE inventories SET quantity = quantity - ? WHERE account_id = ? AND item_id = ?`,
                  [qty, tx.to_account_id, itemId],
                  (err) => {
                    if (err) return rollback(err);
                    performDelete();
                  }
                );
              }
            );
          } else if (tx.type === 'fill_account' || tx.type === 'adjust_add') {
            db.run(
              `UPDATE inventories SET quantity = quantity - ? WHERE account_id = ? AND item_id = ?`,
              [qty, tx.to_account_id, itemId],
              (err) => {
                if (err) return rollback(err);
                performDelete();
              }
            );
          } else if (tx.type === 'adjust_sub') {
            db.run(
              `INSERT INTO inventories (account_id, item_id, quantity) VALUES (?, ?, ?)
               ON CONFLICT(account_id, item_id) DO UPDATE SET quantity = quantity + ?`,
              [tx.from_account_id, itemId, qty, qty],
              (err) => {
                if (err) return rollback(err);
                performDelete();
              }
            );
          } else if (tx.type === 'sale') {
            if (tx.reduce_stock === 1) {
              db.run(
                `INSERT INTO inventories (account_id, item_id, quantity) VALUES (?, ?, ?)
                 ON CONFLICT(account_id, item_id) DO UPDATE SET quantity = quantity + ?`,
                [tx.from_account_id, itemId, qty, qty],
                (err) => {
                  if (err) return rollback(err);
                  performDelete();
                }
              );
            } else {
              performDelete();
            }
          } else {
            performDelete();
          }
        });
      });
    });
  }
}

module.exports = {
  db,
  initDb,
  dbRun,
  dbAll,
  dbGet,
  executeTransaction,
  deleteTransaction
};
