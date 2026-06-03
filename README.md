# ARC Tools

Userscripts (Tampermonkey) para os portais **Pioneer** e **Daxus** do ARC Raiders. Se atualizam sozinhos.

## Instalação (1x)
1. Instale a extensão **Tampermonkey**.
2. Em `chrome://extensions` → **Tampermonkey** → **Detalhes** → ative **Permitir scripts de usuário** (*Allow user scripts*). *(Exigência do Chrome — sem isso não roda.)*
3. Clique nos links abaixo e confirme **Instalar / Reinstalar** no Tampermonkey:
   - **ARC Ledger** (painel anti-dupe): [`arc_ledger.user.js`](https://raw.githubusercontent.com/gioknx/arc-tools/main/arc_ledger.user.js)
   - **ARC Cookie Switcher** (troca de conta): [`arc_cookie_switcher.user.js`](https://raw.githubusercontent.com/gioknx/arc-tools/main/arc_cookie_switcher.user.js)

Depois disso, **atualizam sozinhos** (o Tampermonkey checa o `@updateURL` periodicamente).

## ARC Ledger
Abre sozinho no **Pioneer** e no **Daxus** (`web.daxus.live`). **Esmaece** (escurece) os itens já enviados pro destinatário atual — os mandáveis ficam acesos, fácil de selecionar os que faltam. Clique no **topo** do painel pra recolher/expandir. Abas Send / Receive / Inspect / Snapshot / Config (migrar/clonar conta + backup). Dados ficam só no navegador (`localStorage`).

- **Pioneer:** ao apertar o botão **SUPER**, registra o envio automaticamente (deixe o **Recipient** preenchido).
- **Daxus:** não tem botão SUPER → o registro é **manual** (botão *Mark as sent*).

## ARC Cookie Switcher
Botão flutuante **⇄ Conta** pra alternar entre contas. Os tokens ficam **só** no storage do Tampermonkey (você cola 1x) — **nunca** no código.
