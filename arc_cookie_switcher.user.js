// ==UserScript==
// @name         ARC Cookie Switcher
// @namespace    arc-ledger
// @version      1.2
// @description  Troca rápida entre contas do Pioneer (gio / garrafa) injetando os cookies de auth. Tudo pelo botão flutuante "⇄ Conta" — não precisa do menu. Tokens ficam no storage do Tampermonkey (você cola 1x), NUNCA no arquivo.
// @match        https://pioneerfree.arc-traders.net/*
// @run-at       document-idle
// @grant        GM_cookie
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/gioknx/arc-tools/main/arc_cookie_switcher.user.js
// @downloadURL  https://raw.githubusercontent.com/gioknx/arc-tools/main/arc_cookie_switcher.user.js
// ==/UserScript==

/*
  COMO USAR (tudo pelo botão flutuante "⇄ Conta" no canto inferior esquerdo)
  ───────────────────────────────────────────────────────────────────────
  1. Clica em "⇄ Conta" → "➕ Adicionar / editar conta".
  2. Põe um nome (ex.: gio) e cola o JSON de cookies (export do Cookie-Editor).
  3. Repete pra garrafa.
  4. Depois é só abrir "⇄ Conta" e clicar no nome → injeta os cookies e recarrega.

  NOTA httpOnly: o cookie de login (RapidVolcano_Auth) é httpOnly, então precisa
  do Tampermonkey (GM_cookie) — bookmarklet/console não setam. Funciona só com o
  @grant GM_cookie acima; NÃO existe um botão "permitir cookies" pra achar.
  Se por algum motivo o GM_cookie não rodar, o switch cai pro modo "copiar JSON
  pro clipboard" e você importa pelo Cookie-Editor.

  SEGURANÇA: os tokens ficam só no storage do Tampermonkey (GM_setValue), nunca
  neste arquivo. São cookies de sessão e expiram — se a troca falhar, relogue e
  atualize o JSON.
*/

(function () {
  'use strict';

  const ORIGIN = 'https://pioneerfree.arc-traders.net/';
  const PK = 'arc_cookie_profiles_v1';            // { name: [cookieObj, ...] }
  const hasGMCookie = typeof GM_cookie !== 'undefined' && typeof GM_cookie.set === 'function';

  const loadProfiles = () => { try { return JSON.parse(GM_getValue(PK, '{}')); } catch (e) { return {}; } };
  const saveProfiles = p => GM_setValue(PK, JSON.stringify(p));

  // ── Define / paste a profile ────────────────────────────────────
  function defineProfile() {
    const name = (prompt('Nome da conta (ex.: gio, garrafa):', '') || '').trim();
    if (!name) return false;
    const raw = prompt('Cole o JSON de cookies (export do Cookie-Editor) para "' + name + '":', '');
    if (!raw) return false;
    let arr;
    try { arr = JSON.parse(raw); } catch (e) { alert('JSON inválido. Nada salvo.'); return false; }
    if (!Array.isArray(arr) || !arr.length) { alert('Esperado um array de cookies. Nada salvo.'); return false; }
    const profiles = loadProfiles();
    profiles[name] = arr;
    saveProfiles(profiles);
    alert('✓ Conta "' + name + '" salva (' + arr.length + ' cookies).');
    return true;
  }

  function removeProfile(name) {
    if (!confirm('Apagar a conta "' + name + '"?')) return;
    const profiles = loadProfiles();
    delete profiles[name];
    saveProfiles(profiles);
    openSwitcher();
  }

  // ── Cookie injection ────────────────────────────────────────────
  function setOne(c) {
    return new Promise(resolve => {
      const details = {
        url: ORIGIN, name: c.name, value: c.value,
        path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly,
      };
      if (!c.hostOnly && c.domain) details.domain = c.domain;
      if (c.sameSite) {
        const s = String(c.sameSite).toLowerCase();
        details.sameSite = (s === 'no_restriction' || s === 'none') ? 'no_restriction'
                         : (s === 'strict') ? 'strict' : 'lax';
      }
      if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
      try { GM_cookie.set(details, err => resolve(!err)); } catch (e) { resolve(false); }
    });
  }

  async function applyProfile(name) {
    const cookies = loadProfiles()[name];
    if (!cookies) { alert('Conta "' + name + '" não encontrada.'); return; }
    if (!hasGMCookie) {
      GM_setClipboard(JSON.stringify(cookies));
      alert('GM_cookie indisponível.\nCookies de "' + name + '" copiados pro clipboard — importe pelo Cookie-Editor e recarregue.');
      return;
    }
    let ok = 0;
    for (const c of cookies) { if (await setOne(c)) ok++; }
    if (ok < cookies.length) alert('⚠ Setou ' + ok + '/' + cookies.length + ' cookies de "' + name + '". Recarregando.');
    location.reload();
  }

  function copyProfile(name) {
    const cookies = loadProfiles()[name];
    if (!cookies) return;
    GM_setClipboard(JSON.stringify(cookies));
    alert('📋 Cookies de "' + name + '" copiados (formato Cookie-Editor).');
  }

  // ── Switch UI (popup) ───────────────────────────────────────────
  function openSwitcher() {
    document.getElementById('arc-cookie-pop')?.remove();
    const names = Object.keys(loadProfiles());
    const pop = document.createElement('div');
    pop.id = 'arc-cookie-pop';
    Object.assign(pop.style, {
      position: 'fixed', left: '16px', bottom: '64px', zIndex: '2147483647',
      background: 'rgba(22,24,29,0.94)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '14px', padding: '12px', minWidth: '240px',
      boxShadow: '0 16px 50px rgba(0,0,0,0.55)', backdropFilter: 'blur(22px) saturate(160%)',
      font: '13px -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif', color: '#e8eaed',
    });
    let html = '<div style="font-weight:600;margin-bottom:10px;font-size:14px;">⇄ Trocar conta</div>';
    if (!names.length) {
      html += '<div style="color:#9aa0a8;font-size:12px;line-height:1.5;margin-bottom:10px;">Nenhuma conta salva ainda. Clica em <b>➕ Adicionar conta</b> e cola o JSON do Cookie-Editor.</div>';
    } else {
      html += names.map(n =>
        '<div style="display:flex;gap:6px;margin-bottom:6px;">'
        + '<button data-go="' + n + '" style="flex:1;text-align:left;background:#0a84ff;color:#fff;border:none;border-radius:9px;padding:8px 12px;font:inherit;font-weight:600;cursor:pointer;">' + n + '</button>'
        + '<button data-copy="' + n + '" title="Copiar JSON pro Cookie-Editor" style="background:rgba(255,255,255,0.07);color:#dfe2e6;border:1px solid rgba(255,255,255,0.10);border-radius:9px;padding:8px 9px;font:inherit;cursor:pointer;">📋</button>'
        + '<button data-del="' + n + '" title="Apagar conta" style="background:rgba(255,107,107,0.10);color:#ff6b6b;border:1px solid rgba(255,107,107,0.35);border-radius:9px;padding:8px 9px;font:inherit;cursor:pointer;">🗑</button>'
        + '</div>'
      ).join('');
    }
    html += '<button id="arc-cookie-add" style="width:100%;margin-top:6px;background:rgba(255,255,255,0.07);color:#dfe2e6;border:1px solid rgba(255,255,255,0.10);border-radius:9px;padding:8px 12px;font:inherit;font-weight:500;cursor:pointer;">➕ Adicionar / editar conta</button>';
    html += '<div style="margin-top:8px;text-align:right;"><span id="arc-cookie-x" style="color:#8a8f98;cursor:pointer;font-size:12px;">fechar</span></div>';
    if (!hasGMCookie) html += '<div style="margin-top:8px;color:#ffb340;font-size:11px;">GM_cookie off → modo copiar pro clipboard.</div>';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    pop.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { pop.remove(); applyProfile(b.dataset.go); }));
    pop.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyProfile(b.dataset.copy)));
    pop.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeProfile(b.dataset.del)));
    document.getElementById('arc-cookie-add').addEventListener('click', () => { if (defineProfile()) openSwitcher(); });
    document.getElementById('arc-cookie-x').addEventListener('click', () => pop.remove());
  }

  // ── Floating button ─────────────────────────────────────────────
  function mountButton() {
    if (document.getElementById('arc-cookie-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'arc-cookie-btn';
    btn.textContent = '⇄ Conta';
    Object.assign(btn.style, {
      position: 'fixed', left: '16px', bottom: '16px', zIndex: '2147483647',
      background: 'rgba(22,24,29,0.92)', color: '#e8eaed',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '980px',
      padding: '8px 14px', font: '13px -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif',
      fontWeight: '600', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      backdropFilter: 'blur(20px) saturate(160%)',
    });
    btn.addEventListener('click', openSwitcher);
    document.body.appendChild(btn);
  }

  // Menu commands (backup — também funcionam, mas não são necessários)
  GM_registerMenuCommand('ARC ⇄ Trocar / adicionar conta', openSwitcher);

  mountButton();
})();
