# Guia de Deploy Online e Gratuito (Render + Supabase/PostgreSQL)

Este guia explica como colocar o seu Dashboard RMT online de forma **100% gratuita** utilizando o **Render.com** (para rodar a aplicação Node.js) e o **Supabase** ou **Neon.tech** (para hospedar o banco de dados PostgreSQL).

---

## 🚀 Passo 1: Criar o Banco de Dados Gratuito

### Opção A: Usando o Supabase (Recomendado)
1. Acesse [Supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **New Project** (Novo Projeto) e configure:
   * Nome do projeto (ex: `arc-dashboard-db`).
   * Senha do banco (guarde esta senha).
3. Aguarde o projeto ser inicializado (cerca de 2 minutos).
4. Acesse a barra lateral esquerda em **Project Settings** (Configurações) -> **Database**.
5. Em **Connection String**, selecione a aba **URI** e copie a URL de conexão. Ela se parece com:
   `postgresql://postgres:[SUA-SENHA]@db.[ID-DO-PROJETO].supabase.co:5432/postgres`
   *(Substitua `[SUA-SENHA]` pela senha que você criou)*.

### Opção B: Usando o Neon.tech
1. Acesse [Neon.tech](https://neon.tech) e crie uma conta gratuita.
2. Crie um novo projeto e ele gerará a URL de conexão instantaneamente.
3. Copie a Connection String (ela já vem com a senha preenchida).

---

## 📦 Passo 2: Criar Repositório no GitHub e Enviar o Código

1. Crie um novo repositório **Privado** no seu [GitHub](https://github.com) chamado `arc-raiders-rmt-dashboard`.
2. Abra o terminal na pasta local do projeto e execute os comandos abaixo para enviar o código:
   ```bash
   git remote add origin <URL-DO-SEU-REPOSITORIO-GITHUB>
   git branch -M main
   git push -u origin main
   ```

---

## ☁️ Passo 3: Criar o Serviço Web no Render.com

1. Acesse [Render.com](https://render.com) e crie uma conta gratuita (conecte com o seu GitHub).
2. No painel, clique em **New** (Novo) -> **Web Service**.
3. Conecte o repositório do seu GitHub `arc-raiders-rmt-dashboard`.
4. Configure as opções básicas:
   * **Name:** `arc-raiders-rmt-dashboard`
   * **Region:** Selecione a mais próxima (ex: Oregon ou Ohio).
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `node server.js`
   * **Instance Type:** **Free** (Grátis)
5. Clique em **Advanced** (Avançado) e adicione as seguintes **Environment Variables** (Variáveis de Ambiente):
   * `DATABASE_URL` = `<A-URL-DE-CONEXAO-QUE-VOCE-COPIOU-NO-PASSO-1>`
6. Clique em **Create Web Service**.
7. O Render começará a instalar os pacotes e inicializar o servidor. Acompanhe os logs. Quando terminar, ele exibirá uma URL no topo esquerdo (ex: `https://arc-raiders-rmt-dashboard-xxxx.onrender.com`).

---

## 🔌 Passo 4: Atualizar o ARC Ledger (Tampermonkey)

Agora que o seu servidor está online, precisamos apontar o script do Tampermonkey para a URL de produção:

1. Acesse o seu Dashboard online através da URL do Render.
2. Faça login com o usuário padrão (`admin` / `admin123`).
3. Vá para a aba **"Registrar Mov."** no menu lateral.
4. No card de integração da direita, clique no botão **"Instalar / Atualizar Script"**.
5. O Tampermonkey identificará o script atualizado apontando para as novas URLs de produção de forma 100% automática! Clique em **Reinstalar** ou **Atualizar**.
6. Pronto! Agora todas as movimentações e estoques feitos no Pioneer/Daxus serão enviados direto para o seu Dashboard na nuvem!
