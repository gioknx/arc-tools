const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');

// 1. Configurações
const sqliteDbPath = path.resolve(__dirname, 'database.db');
const supabaseUrl = "postgresql://postgres.xlxjqyksvklsqkgndtri:M%40rc0spaulo1311@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

console.log('🔄 Iniciando processo de migração de dados...');
console.log(`📁 Banco SQLite de origem: ${sqliteDbPath}`);

const localDb = new sqlite3.Database(sqliteDbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao SQLite local:', err.message);
    process.exit(1);
  }
});

const pgClient = new Client({
  connectionString: supabaseUrl,
  ssl: { rejectUnauthorized: false }
});

// Helper para copiar tabela
async function copyTable(tableName, columns) {
  return new Promise((resolve, reject) => {
    localDb.all(`SELECT * FROM ${tableName}`, async (err, rows) => {
      if (err) {
        return reject(new Error(`Erro ao ler tabela ${tableName} do SQLite: ${err.message}`));
      }
      
      console.log(`📤 Copiando ${rows.length} registros da tabela "${tableName}" para o Supabase...`);
      if (rows.length === 0) {
        console.log(`ℹ️ Tabela "${tableName}" está vazia.`);
        return resolve();
      }
      
      const colNames = columns.join(', ');
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      const insertQuery = `INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders})`;
      
      try {
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          await pgClient.query(insertQuery, values);
        }
        console.log(`✅ Tabela "${tableName}" copiada com sucesso!`);
        resolve();
      } catch (pgErr) {
        reject(new Error(`Erro ao inserir na tabela ${tableName} do Supabase: ${pgErr.message}`));
      }
    });
  });
}

async function runMigration() {
  try {
    console.log('🔌 Conectando ao Supabase (PostgreSQL)...');
    await pgClient.connect();
    console.log('✅ Conectado ao Supabase com sucesso.');

    // 2. Limpar tabelas remotas (Truncate com Cascade para limpar na ordem certa de FKs)
    console.log('🧹 Limpando dados antigos do Supabase para evitar conflitos...');
    await pgClient.query(`
      TRUNCATE TABLE 
        sessions, 
        transactions, 
        inventories, 
        operator_logins, 
        cash_transactions, 
        licenses,
        users, 
        clients, 
        accounts, 
        items 
      RESTART IDENTITY CASCADE
    `);
    console.log('✅ Supabase limpo e pronto para receber os dados.');

    // 3. Copiar tabelas na ordem de dependência das Chaves Estrangeiras (FKs)
    
    // Tabela: users
    await copyTable('users', [
      'id', 'username', 'password_hash', 'nickname', 'role', 
      'payment_per_register', 'daily_goal', 'created_at'
    ]);

    // Tabela: clients
    await copyTable('clients', ['id', 'name', 'created_at']);

    // Tabela: accounts
    await copyTable('accounts', [
      'id', 'name', 'login_method', 'token', 
      'status', 'type', 'notes', 'created_at'
    ]);

    // Tabela: items
    await copyTable('items', ['id', 'name', 'category', 'color', 'created_at']);

    // Tabela: inventories (NÃO tem coluna auto-incremento id)
    await copyTable('inventories', ['account_id', 'item_id', 'quantity', 'updated_at']);

    // Tabela: transactions
    await copyTable('transactions', [
      'id', 'type', 'item_id', 'quantity', 'from_account_id', 
      'to_account_id', 'operator_id', 'helper_id', 'notes', 
      'timestamp', 'client_id', 'sale_value', 'sale_currency', 'reduce_stock'
    ]);

    // Tabela: cash_transactions
    await copyTable('cash_transactions', [
      'id', 'description', 'amount', 'currency', 'type', 'timestamp'
    ]);

    // Tabela: operator_logins
    await copyTable('operator_logins', [
      'id', 'user_id', 'platform', 'platform_custom', 
      'login', 'password', 'token', 'created_at'
    ]);

    // Tabela: sessions (NÃO tem coluna auto-incremento id)
    await copyTable('sessions', ['token', 'user_id', 'username', 'role', 'created_at']);

    // Tabela: licenses
    await copyTable('licenses', [
      'id', 'login', 'password', 'type', 
      'mother_id', 'operator_id', 'status', 'card_used', 'token', 'refunded', 'account_username', 'token_status', 'created_at'
    ]);

    // 4. Sincronizar as sequências (auto-incremento) das chaves primárias no PostgreSQL
    console.log('\n🔄 Ajustando sequências de chaves primárias (auto-incremento) no PostgreSQL...');
    const tablesToReset = [
      { name: 'users', seq: 'users_id_seq' },
      { name: 'clients', seq: 'clients_id_seq' },
      { name: 'accounts', seq: 'accounts_id_seq' },
      { name: 'items', seq: 'items_id_seq' },
      { name: 'transactions', seq: 'transactions_id_seq' },
      { name: 'cash_transactions', seq: 'cash_transactions_id_seq' },
      { name: 'operator_logins', seq: 'operator_logins_id_seq' },
      { name: 'licenses', seq: 'licenses_id_seq' }
    ];

    for (const table of tablesToReset) {
      await pgClient.query(`SELECT setval('${table.seq}', COALESCE((SELECT MAX(id) FROM ${table.name}), 1))`);
    }
    console.log('✅ Todas as sequências sincronizadas com sucesso.');

    console.log('\n🎉 ==========================================');
    console.log('🏆 MIGRAÇÃO CONCLUÍDA COM TOTAL SUCESSO!');
    console.log('==============================================');
    console.log('Todos os dados locais foram copiados para a nuvem.');
    console.log('Você pode iniciar a aplicação online na Vercel agora.');

  } catch (err) {
    console.error('\n❌ Ocorreu um erro crítico durante a migração:');
    console.error(err.message);
  } finally {
    localDb.close();
    await pgClient.end();
  }
}

runMigration();
