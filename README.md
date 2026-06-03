# ARC Tools

Userscripts (Tampermonkey) para o portal **Pioneer** do ARC Raiders. Se atualizam sozinhos.

## Instalação (1x)
1. Instale a extensão **Tampermonkey**.
2. Em `chrome://extensions` → **Tampermonkey** → **Detalhes** → ative **Permitir scripts de usuário** (*Allow user scripts*). *(Exigência do Chrome — sem isso não roda.)*
3. Clique nos links abaixo e confirme **Instalar / Reinstalar** no Tampermonkey:
   - **ARC Ledger** (painel anti-dupe): [`arc_ledger.user.js`](https://raw.githubusercontent.com/gioknx/arc-tools/main/arc_ledger.user.js)
   - **ARC Cookie Switcher** (troca de conta): [`arc_cookie_switcher.user.js`](https://raw.githubusercontent.com/gioknx/arc-tools/main/arc_cookie_switcher.user.js)

Depois disso, **atualizam sozinhos** (o Tampermonkey checa o `@updateURL` periodicamente).

## ARC Ledger
Abre sozinho no Pioneer. Marca em vermelho (⚠) os itens já enviados pro destinatário atual (anti-duplicação) e **registra o envio automaticamente** ao apertar o botão **SUPER**. Tem abas Send / Receive / Inspect / Snapshot / Config (migrar/clonar conta + backup). Dados ficam só no navegador (`localStorage`).

> Deixe o campo **Recipient** preenchido pro auto-log do SUPER funcionar.

## ARC Cookie Switcher
Botão flutuante **⇄ Conta** pra alternar entre contas. Os tokens ficam **só** no storage do Tampermonkey (você cola 1x) — **nunca** no código.
