import * as vault from './vault.js';
import { $, $$, esc, fmtDate, fmtDateTime, todayISO, daysBetween, scoreClass, initials } from './util.js';
import { STATUSES, KINDS, emptyState, normalize, newPerson, defaultVariables } from './defaults.js';
import { report, overall, valuesOf, weighted, activeVars, lastContact, groupByCategory } from './analysis.js';
import { APP_VERSION } from './version.js';

const app = $('#app');
const modal = $('#modal');
const S = () => vault.state;

// ---------- icons ----------
const ICONS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  del: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  up: 'M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z',
  down: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const iconBtn = (n, label, act, extra = '') => `<button class="icon-btn" type="button" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(n)}</button>`;
const badge = (n, big = false) => `<span class="badge ${scoreClass(n)}${big ? ' big' : ''}">${n ?? '–'}</span>`;

// ---------- toast, modal ----------
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="btn text">${esc(action.label)}</button>` : ''}`;
  t.hidden = false;
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 15000 : 3500);
}

function openModal(html, bind) {
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
  bind?.(modal);
}
function closeModal() {
  if (modal.open) modal.close();
  modal.innerHTML = '';
}

function ask(title, body, ok = 'OK', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; closeModal(); resolve(v); } };
    openModal(`<form class="dlg"><h2>${esc(title)}</h2><p>${esc(body)}</p>
      <div class="dlg-actions"><button type="button" class="btn text" data-x="no">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'filled'}">${esc(ok)}</button></div></form>`, (m) => {
      m.querySelector('form').onsubmit = (e) => { e.preventDefault(); finish(true); };
      m.querySelector('[data-x=no]').onclick = () => finish(false);
      m.oncancel = () => finish(false);
    });
  });
}

/** Resolves to { password, remember } or null. */
function askPassword({ title, message, confirm = false, remember = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; closeModal(); resolve(v); } };
    openModal(`<form class="dlg"><h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
      <label class="field"><span>Password (8 or more characters)</span><input name="a" type="password" autocomplete="new-password" required minlength="8"></label>
      ${confirm ? '<label class="field"><span>Repeat password</span><input name="b" type="password" autocomplete="new-password" required></label>' : ''}
      ${remember ? '<label class="check"><input type="checkbox" name="r" checked> Remember on this device (stored encrypted)</label>' : ''}
      <p class="err" hidden></p>
      <div class="dlg-actions"><button type="button" class="btn text" data-x="no">Cancel</button><button class="btn filled">OK</button></div></form>`, (m) => {
      const f = m.querySelector('form');
      f.onsubmit = (e) => {
        e.preventDefault();
        const a = f.a.value, b = f.b?.value;
        const err = f.querySelector('.err');
        if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
        if (confirm && a !== b) { err.textContent = 'The passwords don\'t match.'; err.hidden = false; return; }
        finish({ password: a, remember: !!f.r?.checked });
      };
      m.querySelector('[data-x=no]').onclick = () => finish(null);
      m.oncancel = () => finish(null);
      f.a.focus();
    });
  });
}

// ---------- install ----------
let installPrompt = null;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  for (const el of $$('[data-install]')) el.hidden = true;
  toast('Ledger is installed. Open it from your home screen.');
});

async function installApp() {
  if (installPrompt) {
    const p = installPrompt;
    installPrompt = null;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'dismissed') toast('Install cancelled. Tap Install app to try again.');
    return;
  }
  openModal(`<div class="dlg"><h2>Install Ledger</h2>
    <p>Chrome hasn't offered the install yet. You can install from its menu instead:</p>
    <ol class="bul"><li>Tap <b>⋮</b> in Chrome's top-right corner.</li>
    <li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
    <li>Choose <b>Install</b>.</li></ol>
    <p class="muted">If the menu shows <b>Open in app</b>, Ledger is already installed; look for it in your app drawer. Installing only works in a normal Chrome tab, not Incognito or a browser opened from inside another app.</p>
    <div class="dlg-actions"><button type="button" class="btn filled" data-x="ok">OK</button></div></div>`, (m) => {
    m.querySelector('[data-x=ok]').onclick = closeModal;
  });
}
const globalHandlers = { install: () => installApp() };

// ---------- lock handling ----------
let hiddenAt = 0;
let suppressLock = false;   // set while a file picker or share sheet is open
const cover = $('#cover');

async function doLock() {
  closeModal();
  await vault.lock();
  showLock();
}

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    if (!suppressLock) cover.hidden = false;
    vault.saveNow();
    if (!suppressLock && vault.isUnlocked() && vault.hasPin() && (S().settings.lockTimeout || 0) === 0) await doLock();
  } else {
    if (suppressLock) { suppressLock = false; }
    else if (vault.isUnlocked() && vault.hasPin() && Date.now() - hiddenAt >= (S().settings.lockTimeout || 0) * 1000) await doLock();
    cover.hidden = true;
  }
});
window.addEventListener('pagehide', () => vault.saveNow());

function pickFile(input) {
  suppressLock = true;
  input.click();
  // If the picker is dismissed without the page being hidden, don't leave the flag set.
  setTimeout(() => { if (!document.hidden) suppressLock = false; }, 1500);
}

// ---------- theme ----------
function applyTheme() {
  const t = S()?.settings.theme || 'system';
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

// ---------- routing ----------
function parseHash() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs || '') };
}
const go = (h) => { location.hash = h; };

let lastRoute = '';
function render() {
  if (!vault.isUnlocked()) return;
  const { parts, params } = parseHash();
  const route = parts.join('/');
  const keepScroll = route === lastRoute;
  lastRoute = route;
  const y = window.scrollY;
  const [v, id] = parts;
  if (!v) viewList();
  else if (v === 'p' && id) viewPerson(id, params.get('t') || 'profile');
  else if (v === 'edit' && id) viewEdit(id);
  else if (v === 'new') viewEdit(null);
  else if (v === 'vars') viewVars();
  else if (v === 'settings') viewSettings();
  else return go('#/');
  window.scrollTo(0, keepScroll ? y : 0);
}
window.addEventListener('hashchange', render);

function bar(title, left, right) {
  return `<header class="bar">${left || ''}<h1>${esc(title)}</h1><div class="bar-actions">${right || ''}</div></header>`;
}

let handlers = {};
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !app.contains(el)) return;
  const fn = handlers[el.dataset.act] || globalHandlers[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

function hydratePhotos(root = app) {
  for (const img of $$('img[data-photo]', root)) {
    vault.photoUrl(img.dataset.photo).then((u) => {
      if (u) { img.src = u; img.hidden = false; img.nextElementSibling?.setAttribute('hidden', ''); }
    });
  }
}
const avatar = (p, cls = '') =>
  `<span class="avatar ${cls}">${p.hasPhoto ? `<img data-photo="${esc(p.id)}" alt="" hidden>` : ''}<span>${esc(initials(p.name))}</span></span>`;

const personById = (id) => S().persons.find((p) => p.id === id);

// ---------- list ----------
const ui = { query: '', status: 'All', sort: 'Score', archived: false };
const SORTS = ['Score', 'Name', 'Last contact', 'Follow-up', 'Recently updated'];
const FILTERS = ['All', 'Follow-up due', ...STATUSES];

function followUpText(p) {
  if (!p.nextFollowUp) return null;
  const d = daysBetween(todayISO(), p.nextFollowUp);
  if (d < 0) return { text: `Follow-up overdue by ${-d} d`, due: true };
  if (d === 0) return { text: 'Follow-up due today', due: true };
  return { text: `Follow-up in ${d} d`, due: false };
}

const SEARCH_FIELDS = ['name', 'nickname', 'metWhere', 'context', 'occupation', 'appearance', 'features', 'personality',
  'interests', 'background', 'likes', 'dislikes', 'notes', 'talkingPoints', 'contact'];

function filteredPersons() {
  const s = S();
  const q = ui.query.trim().toLowerCase();
  const scores = new Map(s.persons.map((p) => [p.id, overall(s, p.id)]));
  const last = new Map(s.persons.map((p) => [p.id, lastContact(s, p.id) || p.metDate || '']));
  let l = s.persons.filter((p) => ui.archived || !p.archived);
  if (ui.status === 'Follow-up due') l = l.filter((p) => followUpText(p)?.due);
  else if (ui.status !== 'All') l = l.filter((p) => p.status === ui.status);
  if (q) l = l.filter((p) => SEARCH_FIELDS.some((f) => String(p[f] || '').toLowerCase().includes(q)));
  const by = {
    Name: (a, b) => a.name.localeCompare(b.name),
    'Last contact': (a, b) => last.get(b.id).localeCompare(last.get(a.id)),
    'Follow-up': (a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999'),
    'Recently updated': (a, b) => b.updatedAt - a.updatedAt,
    Score: (a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1)
  };
  return { list: l.sort(by[ui.sort] || by.Score), scores, last };
}

function listItems() {
  const { list, scores } = filteredPersons();
  if (!list.length) {
    return `<p class="empty">${S().persons.length ? 'No matches.' : 'No entries yet. Tap + to add someone.'}</p>`;
  }
  return list.map((p) => {
    const lc = lastContact(S(), p.id);
    const fu = followUpText(p);
    const sub = [p.status, p.metWhere].filter(Boolean).join(' · ');
    return `<a class="card person" href="#/p/${encodeURIComponent(p.id)}">
      ${avatar(p)}
      <span class="grow">
        <span class="title">${esc(p.name)}${p.nickname ? ` <span class="muted">(${esc(p.nickname)})</span>` : ''}${p.archived ? ' <span class="tag">Archived</span>' : ''}</span>
        ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
        ${lc ? `<span class="sub">Last contact ${esc(fmtDate(lc))}</span>` : ''}
        ${fu ? `<span class="sub ${fu.due ? 'due' : 'soon'}">${esc(fu.text)}</span>` : ''}
      </span>
      ${badge(scores.get(p.id))}
    </a>`;
  }).join('');
}

function viewList() {
  const s = S();
  const stale = s.persons.length && Date.now() - (s.settings.lastBackup || 0) > 14 * 86400000;
  app.innerHTML = `
    ${bar('Ledger', '', iconBtn('star', 'Rating variables', 'vars') + iconBtn('tune', 'Settings', 'settings') + (vault.hasPin() ? iconBtn('lock', 'Lock now', 'lock') : ''))}
    <main class="page">
      ${stale ? `<div class="banner"><span>${s.settings.lastBackup ? `Last backup ${esc(fmtDate(new Date(s.settings.lastBackup).toISOString().slice(0, 10)))}.` : 'Nothing is backed up yet.'} Browser data can be cleared, so keep a backup.</span><button class="btn tonal" data-act="backup">Back up</button></div>` : ''}
      ${isInstalled() ? '' : '<div class="banner" data-install><span>Install Ledger for offline use and its own home-screen icon.</span><button class="btn tonal" data-act="install">Install app</button></div>'}
      <label class="search">${icon('search')}<input id="q" type="search" placeholder="Search names, notes, features…" value="${esc(ui.query)}" autocomplete="off"></label>
      <div class="chips" role="group" aria-label="Filter">${FILTERS.map((f) => `<button type="button" class="chip" data-act="filter" data-v="${esc(f)}" aria-pressed="${ui.status === f}">${esc(f)}</button>`).join('')}</div>
      <div class="row controls">
        <label class="inline">Sort <select id="sort">${SORTS.map((o) => `<option${o === ui.sort ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="inline switch"><input type="checkbox" id="arch"${ui.archived ? ' checked' : ''}> Show archived</label>
      </div>
      <div id="items" class="stack">${listItems()}</div>
    </main>
    <a class="fab" href="#/new" aria-label="Add someone">${icon('add')}</a>`;
  hydratePhotos();
  const refresh = () => { $('#items').innerHTML = listItems(); hydratePhotos($('#items')); };
  $('#q').addEventListener('input', (e) => { ui.query = e.target.value; refresh(); });
  $('#sort').addEventListener('change', (e) => { ui.sort = e.target.value; refresh(); });
  $('#arch').addEventListener('change', (e) => { ui.archived = e.target.checked; refresh(); });
  handlers = {
    vars: () => go('#/vars'),
    settings: () => go('#/settings'),
    lock: () => doLock(),
    backup: () => backupNow(),
    filter: (el) => {
      ui.status = el.dataset.v;
      $$('.chip', app).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === ui.status)));
      refresh();
    }
  };
}

// ---------- person ----------
const TABS = [['profile', 'Profile'], ['ratings', 'Ratings'], ['log', 'Log'], ['analysis', 'Analysis']];

const PROFILE_FIELDS = [
  ['nickname', 'Nickname'], ['age', 'Age'], ['occupation', 'Occupation or study'], ['contact', 'Contact'],
  ['context', 'Context'], ['appearance', 'Appearance'], ['features', 'Distinguishing features'],
  ['personality', 'Personality'], ['interests', 'Interests'], ['background', 'Background'],
  ['likes', 'Likes'], ['dislikes', 'Dislikes'], ['talkingPoints', 'Talking points'], ['notes', 'Notes']
];

function touch(p) { p.updatedAt = Date.now(); }

function viewPerson(id, tab) {
  const p = personById(id);
  if (!p) return go('#/');
  const s = S();
  const score = overall(s, p.id);
  app.innerHTML = `
    ${bar(p.name, iconBtn('back', 'Back', 'back'), iconBtn('edit', 'Edit', 'edit') + iconBtn('del', 'Delete', 'delete'))}
    <main class="page">
      <section class="hero">
        ${avatar(p, 'lg')}
        <div class="grow">
          <div class="title">${esc(p.name)}</div>
          <div class="sub">${esc([p.status, p.archived ? 'Archived' : ''].filter(Boolean).join(' · '))}</div>
        </div>
        ${badge(score, true)}
      </section>
      <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<a role="tab" href="#/p/${encodeURIComponent(id)}?t=${k}" aria-selected="${tab === k}">${l}</a>`).join('')}</nav>
      <div id="tab">${tab === 'ratings' ? ratingsTab(p) : tab === 'log' ? logTab(p) : tab === 'analysis' ? analysisTab(p) : profileTab(p)}</div>
    </main>
    ${tab === 'log' ? `<button class="fab" type="button" data-act="addlog" aria-label="Log an interaction">${icon('add')}</button>` : ''}`;
  hydratePhotos();

  handlers = {
    back: () => go('#/'),
    edit: () => go(`#/edit/${encodeURIComponent(id)}`),
    delete: async () => {
      if (!(await ask(`Delete ${p.name}?`, 'This permanently removes the profile, ratings, history, and log. Archiving hides them instead.', 'Delete', true))) return;
      s.persons = s.persons.filter((x) => x.id !== id);
      delete s.ratings[id];
      s.history = s.history.filter((h) => h.p !== id);
      s.interactions = s.interactions.filter((i) => i.p !== id);
      if (p.hasPhoto) await vault.setPhoto(id, null);
      vault.save();
      go('#/');
    },
    addlog: () => logDialog(p, { id: null, p: id, date: todayISO(), kind: KINDS[0], place: '', summary: '', vibe: 50, next: '' }),
    openlog: (el) => logDialog(p, s.interactions.find((i) => i.id === el.dataset.id)),
    clear: (el) => {
      const vid = el.dataset.vid;
      if (s.ratings[id]) delete s.ratings[id][vid];
      touch(p); vault.save(); render();
    }
  };
  if (tab === 'ratings') bindRatings(p);
}

function profileTab(p) {
  const met = [p.metWhere, fmtDate(p.metDate)].filter(Boolean).join(', ');
  const fu = p.nextFollowUp ? fmtDate(p.nextFollowUp) : '';
  const rows = [['Status', p.status], ['Met', met], ...PROFILE_FIELDS.map(([k, l]) => [l, p[k]]), ['Follow up on', fu]]
    .filter(([, v]) => v);
  return `<dl class="info">${rows.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${rows.length <= 1 ? '<p class="empty">Nothing recorded yet. Tap the pencil to fill in the profile.</p>' : ''}
    <p class="meta">Added ${esc(fmtDateTime(p.createdAt))} · Updated ${esc(fmtDateTime(p.updatedAt))}</p>`;
}

function anchorFor(v, n) { return n < 34 ? v.low : n < 67 ? v.mid : v.high; }

function ratingsTab(p) {
  const s = S();
  const values = valuesOf(s, p.id);
  const groups = groupByCategory(activeVars(s));
  if (!groups.size) return '<p class="empty">No active variables. Add some under the ★ screen.</p>';
  return [...groups].map(([cat, list]) => {
    const cs = weighted(list, values);
    return `<section class="cat"><h2 class="section-h"><span>${esc(cat)}</span><span class="cat-score ${scoreClass(cs)}" data-cat="${esc(cat)}">${cs ?? '–'}</span></h2>
      ${list.map((v) => {
        const val = values[v.id];
        const has = val != null;
        return `<div class="rate${has ? '' : ' unrated'}" data-vid="${esc(v.id)}">
          <div class="rate-head">
            <div class="grow"><div class="title">${esc(v.name)}${v.weight > 1 ? ` <span class="muted">×${v.weight}</span>` : ''}</div>
            ${v.description ? `<div class="sub">${esc(v.description)}</div>` : ''}</div>
            <output class="val ${has ? scoreClass(val) : ''}">${has ? val : 'Unrated'}</output>
            ${has ? iconBtn('close', 'Clear rating', 'clear', `data-vid="${esc(v.id)}"`) : ''}
          </div>
          <input type="range" min="0" max="100" step="1" value="${has ? val : 50}" aria-label="${esc(v.name)}">
          <div class="anchor">${has && anchorFor(v, val) ? '≈ ' + esc(anchorFor(v, val)) : ''}</div>
        </div>`;
      }).join('')}</section>`;
  }).join('');
}

function bindRatings(p) {
  const s = S();
  const vars = activeVars(s);
  for (const row of $$('.rate', app)) {
    const v = vars.find((x) => x.id === row.dataset.vid);
    const range = row.querySelector('input');
    const out = row.querySelector('output');
    const anchor = row.querySelector('.anchor');
    range.addEventListener('input', () => {
      const n = Number(range.value);
      row.classList.remove('unrated');
      out.textContent = n;
      out.className = 'val ' + scoreClass(n);
      const a = anchorFor(v, n);
      anchor.textContent = a ? '≈ ' + a : '';
    });
    range.addEventListener('change', () => {
      const n = Number(range.value);
      const at = Date.now();
      (s.ratings[p.id] ??= {})[v.id] = { v: n, at };
      s.history.push({ p: p.id, v: v.id, val: n, at });
      touch(p);
      vault.save();
      if (!row.querySelector('[data-act=clear]')) {
        row.querySelector('.rate-head').insertAdjacentHTML('beforeend', iconBtn('close', 'Clear rating', 'clear', `data-vid="${esc(v.id)}"`));
      }
      updateScores(p);
    });
  }
}

function updateScores(p) {
  const s = S();
  const values = valuesOf(s, p.id);
  for (const [cat, list] of groupByCategory(activeVars(s))) {
    const el = $$('[data-cat]', app).find((x) => x.dataset.cat === cat);
    if (!el) continue;
    const n = weighted(list, values);
    el.textContent = n ?? '–';
    el.className = 'cat-score ' + scoreClass(n);
  }
  const big = $('.hero .badge', app);
  const n = overall(s, p.id);
  big.textContent = n ?? '–';
  big.className = `badge big ${scoreClass(n)}`;
}

function logTab(p) {
  const items = S().interactions.filter((i) => i.p === p.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  if (!items.length) return '<p class="empty">No interactions logged yet. Tap + after you see or talk to them.</p>';
  return `<div class="stack">${items.map((i) => `<button type="button" class="card log" data-act="openlog" data-id="${esc(i.id)}">
    <span class="row"><span class="title grow">${esc([fmtDate(i.date), i.kind, i.place].filter(Boolean).join(' · '))}</span>
    <span class="vibe ${scoreClass(i.vibe)}">Vibe ${i.vibe}</span></span>
    ${i.summary ? `<span class="body">${esc(i.summary)}</span>` : ''}
    ${i.next ? `<span class="next">Next: ${esc(i.next)}</span>` : ''}
  </button>`).join('')}</div>`;
}

function logDialog(p, i) {
  const isNew = !i.id;
  openModal(`<form class="dlg"><h2>${isNew ? 'Log interaction' : 'Edit interaction'}</h2>
    <label class="field"><span>Date</span><input type="date" name="date" value="${esc(i.date)}" required></label>
    <fieldset class="chips wrap"><legend>Type</legend>${KINDS.map((k) => `<label class="chip"><input type="radio" name="kind" value="${esc(k)}"${k === i.kind ? ' checked' : ''}>${esc(k)}</label>`).join('')}</fieldset>
    <label class="field"><span>Where</span><input name="place" value="${esc(i.place)}"></label>
    <label class="field"><span>What happened, what they said</span><textarea name="summary" rows="4">${esc(i.summary)}</textarea></label>
    <label class="field"><span>How it went: <output name="vo">${i.vibe}</output></span><input type="range" name="vibe" min="0" max="100" value="${i.vibe}"></label>
    <label class="field"><span>Next steps</span><textarea name="next" rows="2">${esc(i.next)}</textarea></label>
    <div class="dlg-actions">${isNew ? '' : '<button type="button" class="btn text danger-text" data-x="del">Delete</button>'}<span class="grow"></span>
      <button type="button" class="btn text" data-x="no">Cancel</button><button class="btn filled">Save</button></div></form>`, (m) => {
    const f = m.querySelector('form');
    f.vibe.oninput = () => { f.vo.value = f.vibe.value; };
    m.querySelector('[data-x=no]').onclick = closeModal;
    const s = S();
    m.querySelector('[data-x=del]')?.addEventListener('click', () => {
      s.interactions = s.interactions.filter((x) => x.id !== i.id);
      touch(p); vault.save(); closeModal(); render();
    });
    f.onsubmit = (e) => {
      e.preventDefault();
      const rec = {
        ...i, id: i.id || crypto.randomUUID(), created: i.created || Date.now(),
        date: f.date.value || todayISO(), kind: f.kind.value || KINDS[0], place: f.place.value.trim(),
        summary: f.summary.value.trim(), vibe: Number(f.vibe.value), next: f.next.value.trim()
      };
      if (isNew) s.interactions.push(rec);
      else s.interactions[s.interactions.findIndex((x) => x.id === i.id)] = rec;
      touch(p); vault.save(); closeModal(); render();
    };
  });
}

function analysisTab(p) {
  const r = report(S(), p);
  const stats = [`${r.interactionCount} interaction${r.interactionCount === 1 ? '' : 's'}`,
    r.daysSince == null ? '' : r.daysSince === 0 ? 'last contact today' : `last contact ${r.daysSince} d ago`, r.avgVibe != null ? `average vibe ${r.avgVibe}` : '']
    .filter(Boolean).join(' · ');
  const list = (title, items) => items.length ? `<h2 class="section-h">${title}</h2><ul class="bul">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return `<p class="muted">Weighted overall ${r.overall ?? '–'} · ${esc(stats)}</p>
    <h2 class="section-h">By category</h2>
    <div class="bars">${r.categories.map((c) => `<div class="barrow">
      <span class="lbl">${esc(c.name)}</span>
      <span class="track"><span class="fill ${scoreClass(c.score)}" style="width:${c.score ?? 0}%"></span></span>
      <span class="num">${c.score ?? '–'}</span>
      <span class="sub">${c.rated}/${c.total} rated</span></div>`).join('')}</div>
    ${list('Read', r.insights)}
    ${list('Strongest', r.strengths.map((x) => `${x.v.name}: ${x.val}`))}
    ${list('Weakest', r.weakest.map((x) => `${x.v.name}: ${x.val}`))}
    ${list('Changes over time', r.trends.map((t) => `${t.v.name}: ${t.from} → ${t.to} (${t.delta > 0 ? '+' : ''}${t.delta})`))}
    ${list('Conversation prompts', r.prompts)}
    ${r.unrated.length ? `<h2 class="section-h">Not yet rated</h2><p class="sub">${esc(r.unrated.map((v) => v.name).join(', '))}</p>` : ''}`;
}

// ---------- edit ----------
const EDIT_SECTIONS = [
  ['Identity', [['name', 'Name', 1, true], ['nickname', 'Nickname'], ['age', 'Age'], ['occupation', 'Occupation or study'], ['contact', 'Contact (number, handle)']]],
  ['How you met', [['metWhere', 'Where'], ['metDate', 'Date met', 'date'], ['context', 'Context, mutual friends, setting', 2]]],
  ['Appearance', [['appearance', 'Overall look (height, build, hair, eyes, skin, style)', 3], ['features', 'Distinguishing features (tattoos, piercings, voice, mannerisms)', 2]]],
  ['About them', [['personality', 'Personality', 2], ['interests', 'Interests (comma or line separated)', 2], ['background', 'Background (hometown, family, history)', 2], ['likes', 'Likes', 2], ['dislikes', 'Dislikes and turn-offs', 2]]],
  ['Next time', [['talkingPoints', 'Talking points (one per line)', 3], ['nextFollowUp', 'Follow up on', 'date']]],
  ['Notes', [['notes', 'Anything else', 4]]]
];

async function resizeImage(file, max = 800) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.82));
}

function viewEdit(id) {
  const existing = id ? personById(id) : null;
  if (id && !existing) return go('#/');
  const p = existing ? { ...existing } : newPerson();
  if (!existing) p.metDate = todayISO();
  let photo;          // undefined = unchanged, null = remove, Blob = new
  let previewUrl = null;

  const field = ([k, label, kind, required]) => {
    if (kind === 'date') return `<label class="field"><span>${esc(label)}</span><input type="date" name="${k}" value="${esc(p[k])}"></label>`;
    if (typeof kind === 'number' && kind > 1) return `<label class="field"><span>${esc(label)}</span><textarea name="${k}" rows="${kind}">${esc(p[k])}</textarea></label>`;
    return `<label class="field"><span>${esc(label)}${required ? ' *' : ''}</span><input name="${k}" value="${esc(p[k])}"${required ? ' required' : ''} autocomplete="off"></label>`;
  };

  app.innerHTML = `
    ${bar(existing ? 'Edit' : 'New entry', iconBtn('close', 'Cancel', 'cancel'), '<button class="btn filled" type="submit" form="pf">Save</button>')}
    <main class="page">
      <form id="pf" class="form" autocomplete="off">
        <section class="photo-row">
          <span class="avatar xl" id="pv">${p.hasPhoto ? `<img data-photo="${esc(p.id)}" alt="" hidden>` : ''}<span>${esc(initials(p.name))}</span></span>
          <div class="stack-s">
            <button type="button" class="btn tonal" data-act="photo">${p.hasPhoto ? 'Change photo' : 'Add photo'}</button>
            <button type="button" class="btn text" data-act="nophoto"${p.hasPhoto ? '' : ' hidden'}>Remove photo</button>
            <input type="file" id="pfile" accept="image/*" hidden>
          </div>
        </section>
        ${EDIT_SECTIONS.map(([title, fields], i) => `<h2 class="section-h">${esc(title)}</h2>${fields.map(field).join('')}
          ${i === 0 ? `<fieldset class="chips wrap"><legend>Status</legend>${STATUSES.map((st) => `<label class="chip"><input type="radio" name="status" value="${esc(st)}"${st === p.status ? ' checked' : ''}>${esc(st)}</label>`).join('')}</fieldset>` : ''}`).join('')}
        <label class="check big"><input type="checkbox" name="archived"${p.archived ? ' checked' : ''}><span><b>Archive</b><br><span class="sub">Hide from the main list without deleting</span></span></label>
      </form>
    </main>`;
  hydratePhotos();

  const form = $('#pf');
  const fileInput = $('#pfile');
  const showPreview = (url) => {
    const pv = $('#pv');
    pv.innerHTML = url ? `<img src="${url}" alt="">` : `<span>${esc(initials(form.name.value))}</span>`;
    $('[data-act=nophoto]').hidden = !url;
    $('[data-act=photo]').textContent = url ? 'Change photo' : 'Add photo';
  };
  fileInput.addEventListener('change', async () => {
    suppressLock = false;
    const f = fileInput.files[0];
    if (!f) return;
    try {
      photo = await resizeImage(f);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(photo);
      showPreview(previewUrl);
    } catch { toast('Couldn\'t read that image.'); }
  });

  handlers = {
    cancel: () => history.length > 1 ? history.back() : go('#/'),
    photo: () => pickFile(fileInput),
    nophoto: () => { photo = null; showPreview(null); }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    for (const [, fields] of EDIT_SECTIONS) for (const [k] of fields) p[k] = String(fd.get(k) || '').trim();
    p.status = fd.get('status') || p.status;
    p.archived = fd.get('archived') === 'on';
    if (!p.name) return form.name.focus();
    if (photo !== undefined) {
      await vault.setPhoto(p.id, photo);
      p.hasPhoto = !!photo;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    touch(p);
    const s = S();
    if (existing) s.persons[s.persons.findIndex((x) => x.id === p.id)] = p;
    else s.persons.push(p);
    vault.save();
    if (existing) history.back();
    else location.replace(`#/p/${encodeURIComponent(p.id)}`);
  });
}

// ---------- variables ----------
function viewVars() {
  const s = S();
  const vars = [...s.variables].sort((a, b) => a.order - b.order);
  app.innerHTML = `
    ${bar('Rating variables', iconBtn('back', 'Back', 'back'), '')}
    <main class="page">
      <p class="muted">Tap a variable to edit it. Weight (×1 to ×5) sets how much it counts towards the overall and category scores. Switching one off hides it without losing its ratings.</p>
      <div class="stack-0">${vars.map((v, i) => `<div class="varrow">
        <button type="button" class="grow plain" data-act="editvar" data-id="${esc(v.id)}">
          <span class="title">${esc(v.name)} <span class="muted">×${v.weight}</span></span>
          <span class="sub accent">${esc(v.category)}</span></button>
        ${iconBtn('up', 'Move up', 'up', `data-i="${i}"${i === 0 ? ' disabled' : ''}`)}
        ${iconBtn('down', 'Move down', 'down', `data-i="${i}"${i === vars.length - 1 ? ' disabled' : ''}`)}
        <label class="switch" aria-label="Active"><input type="checkbox" data-toggle="${esc(v.id)}"${v.active ? ' checked' : ''}></label>
      </div>`).join('')}</div>
      <div class="row gap"><button type="button" class="btn text" data-act="restore">Restore missing defaults</button></div>
    </main>
    <button class="fab" type="button" data-act="addvar" aria-label="Add a variable">${icon('add')}</button>`;

  const swap = (i, j) => {
    if (j < 0 || j >= vars.length) return;
    [vars[i].order, vars[j].order] = [vars[j].order, vars[i].order];
    vault.save(); render();
  };
  for (const cb of $$('[data-toggle]', app)) {
    cb.addEventListener('change', () => {
      s.variables.find((v) => v.id === cb.dataset.toggle).active = cb.checked;
      vault.save();
    });
  }
  handlers = {
    back: () => go('#/'),
    up: (el) => swap(+el.dataset.i, +el.dataset.i - 1),
    down: (el) => swap(+el.dataset.i, +el.dataset.i + 1),
    editvar: (el) => varDialog(s.variables.find((v) => v.id === el.dataset.id)),
    addvar: () => varDialog({ id: null, name: '', category: vars.at(-1)?.category || '', description: '', low: '', mid: '', high: '', weight: 1, active: true }),
    restore: () => {
      const have = new Set(s.variables.map((v) => v.id));
      let max = Math.max(0, ...s.variables.map((v) => v.order));
      const add = defaultVariables().filter((v) => !have.has(v.id)).map((v) => ({ ...v, order: ++max }));
      s.variables.push(...add);
      vault.save(); render();
      toast(add.length ? `Added ${add.length} default variable${add.length === 1 ? '' : 's'}.` : 'All defaults are already here.');
    }
  };
}

function varDialog(v) {
  const s = S();
  const isNew = !v.id;
  const cats = [...new Set(s.variables.map((x) => x.category).filter(Boolean))];
  openModal(`<form class="dlg"><h2>${isNew ? 'New variable' : 'Edit variable'}</h2>
    <label class="field"><span>Name *</span><input name="name" value="${esc(v.name)}" required></label>
    <label class="field"><span>Category</span><input name="category" value="${esc(v.category)}" list="cats"></label>
    <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <label class="field"><span>What it measures</span><textarea name="description" rows="2">${esc(v.description)}</textarea></label>
    <label class="field"><span>Low (0 to 33) looks like</span><input name="low" value="${esc(v.low)}"></label>
    <label class="field"><span>Middle (34 to 66) looks like</span><input name="mid" value="${esc(v.mid)}"></label>
    <label class="field"><span>High (67 to 100) looks like</span><input name="high" value="${esc(v.high)}"></label>
    <label class="field"><span>Weight: ×<output name="wo">${v.weight}</output></span><input type="range" name="weight" min="1" max="5" step="1" value="${v.weight}"></label>
    <div class="dlg-actions">${isNew ? '' : '<button type="button" class="btn text danger-text" data-x="del">Delete</button>'}<span class="grow"></span>
      <button type="button" class="btn text" data-x="no">Cancel</button><button class="btn filled">Save</button></div></form>`, (m) => {
    const f = m.querySelector('form');
    f.weight.oninput = () => { f.wo.value = f.weight.value; };
    m.querySelector('[data-x=no]').onclick = closeModal;
    m.querySelector('[data-x=del]')?.addEventListener('click', async () => {
      closeModal();
      if (!(await ask(`Delete ${v.name}?`, 'All ratings and history for this variable are deleted too. Switch it off instead to keep them.', 'Delete', true))) return;
      s.variables = s.variables.filter((x) => x.id !== v.id);
      for (const pid of Object.keys(s.ratings)) delete s.ratings[pid][v.id];
      s.history = s.history.filter((h) => h.v !== v.id);
      vault.save(); render();
    });
    f.onsubmit = (e) => {
      e.preventDefault();
      const rec = {
        ...v, name: f.name.value.trim(), category: f.category.value.trim() || 'Other', description: f.description.value.trim(),
        low: f.low.value.trim(), mid: f.mid.value.trim(), high: f.high.value.trim(), weight: Number(f.weight.value)
      };
      if (isNew) {
        rec.id = crypto.randomUUID();
        rec.order = Math.max(0, ...s.variables.map((x) => x.order)) + 1;
        s.variables.push(rec);
      } else {
        s.variables[s.variables.findIndex((x) => x.id === v.id)] = rec;
      }
      vault.save(); closeModal(); render();
    };
  });
}

// ---------- settings, backup ----------
const TIMEOUTS = [[0, 'Immediately'], [30, '30 seconds'], [60, '1 minute'], [300, '5 minutes'], [900, '15 minutes']];

function backupFileName() {
  return `ledger-backup-${todayISO()}.ledger`;
}

async function backupNow() {
  const s = S();
  let pw = s.settings.backupPassword;
  if (!pw) {
    const r = await askPassword({ title: 'Backup password', message: 'You need this password to restore. It can\'t be recovered if you forget it.', confirm: true, remember: true });
    if (!r) return;
    pw = r.password;
    if (r.remember) { s.settings.backupPassword = pw; vault.save(); }
  }
  toast('Encrypting…');
  const text = await vault.exportBackup(pw);
  const file = new File([text], backupFileName(), { type: 'application/octet-stream' });
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      suppressLock = true;
      await navigator.share({ files: [file], title: 'Ledger backup' });
      shared = true;
    } catch (e) {
      suppressLock = false;
      if (e.name === 'AbortError') return toast('Backup cancelled.');
    }
  }
  if (!shared) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  s.settings.lastBackup = Date.now();
  vault.save();
  toast(shared ? 'Backup shared.' : 'Backup downloaded.');
  if (parseHash().parts[0] === 'settings' || !parseHash().parts.length) render();
}

async function restoreFromFile(file, { fresh = false } = {}) {
  const text = await file.text();
  const r = await askPassword({ title: 'Backup password', message: fresh ? 'Enter the password you used for this backup.' : 'Restoring replaces everything currently in Ledger.' });
  if (!r) return false;
  let parsed;
  try { parsed = await vault.readBackup(text, r.password); } catch (e) { toast(e.message); return false; }
  parsed.state = normalize(parsed.state);
  await vault.restore(parsed);
  applyTheme();
  toast(`Restored ${parsed.state.persons.length} ${parsed.state.persons.length === 1 ? 'entry' : 'entries'}.`);
  return true;
}

function pinDialog() {
  const has = vault.hasPin();
  openModal(`<form class="dlg"><h2>${has ? 'Change PIN' : 'Set a PIN'}</h2>
    ${has ? '<label class="field"><span>Current PIN</span><input name="cur" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" required></label>' : ''}
    <label class="field"><span>New PIN (4 to 8 digits)</span><input name="a" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="off" required></label>
    <label class="field"><span>Repeat new PIN</span><input name="b" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="off" required></label>
    <p class="muted">The PIN encrypts your data. If you forget it, the only way back in is erasing Ledger and restoring a backup.</p>
    <p class="err" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn text" data-x="no">Cancel</button><button class="btn filled">Save</button></div></form>`, (m) => {
    const f = m.querySelector('form');
    const err = f.querySelector('.err');
    m.querySelector('[data-x=no]').onclick = closeModal;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fail = (t) => { err.textContent = t; err.hidden = false; };
      if (!/^\d{4,8}$/.test(f.a.value)) return fail('Use 4 to 8 digits.');
      if (f.a.value !== f.b.value) return fail('The new PINs don\'t match.');
      f.querySelector('.btn.filled').disabled = true;
      if (has && !(await vault.verifyPin(f.cur.value))) { f.querySelector('.btn.filled').disabled = false; return fail('Current PIN is wrong.'); }
      await vault.setPin(f.a.value);
      closeModal(); render(); toast('PIN saved.');
    };
  });
}

function viewSettings() {
  const s = S();
  const st = s.settings;
  app.innerHTML = `
    ${bar('Settings', iconBtn('back', 'Back', 'back'), '')}
    <main class="page">
      <h2 class="section-h">Lock</h2>
      <div class="card col">
        <div class="row"><span class="grow">${vault.hasPin() ? 'PIN is on. Your data is encrypted with it.' : 'No PIN. Data is encrypted with a key kept by this browser.'}</span></div>
        <div class="row gap">
          <button class="btn tonal" data-act="pin">${vault.hasPin() ? 'Change PIN' : 'Set PIN'}</button>
          ${vault.hasPin() ? '<button class="btn text" data-act="nopin">Remove PIN</button><button class="btn text" data-act="lock">Lock now</button>' : ''}
        </div>
        ${vault.hasPin() ? `<label class="field"><span>Lock after leaving the app</span><select id="timeout">${TIMEOUTS.map(([v, l]) => `<option value="${v}"${v === st.lockTimeout ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      </div>

      <h2 class="section-h">Backup and sync</h2>
      <div class="card col">
        <p class="sub">Backups are encrypted with a password you choose, so they're safe to keep in Proton Drive, Google Drive, or any cloud folder. On Android, "Back up now" opens the share sheet so you can send the file straight to your Drive app.</p>
        <p>${st.lastBackup ? `Last backup ${esc(fmtDateTime(st.lastBackup))}` : 'No backup yet.'}</p>
        <div class="row gap wrap">
          <button class="btn filled" data-act="backup">Back up now</button>
          <button class="btn text" data-act="restorefile">Restore from file</button>
          <input type="file" id="rfile" accept=".ledger,application/octet-stream,application/json,*/*" hidden>
        </div>
        <label class="check"><input type="checkbox" id="rememberpw"${st.backupPassword ? ' checked' : ''}> Remember backup password on this device</label>
      </div>

      <h2 class="section-h">App</h2>
      <div class="card col">
        <p class="sub">${isInstalled() ? 'Ledger is installed and running as an app.' : 'Ledger is running in a browser tab.'}</p>
        <div class="row"><button class="btn tonal" data-install data-act="install"${isInstalled() ? ' hidden' : ''}>Install app</button></div>
      </div>

      <h2 class="section-h">Appearance</h2>
      <div class="card col"><label class="field"><span>Theme</span><select id="theme">
        ${[['system', 'Match the system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}"${v === st.theme ? ' selected' : ''}>${l}</option>`).join('')}
      </select></label></div>

      <h2 class="section-h">Data</h2>
      <div class="card col">
        <p class="sub" id="persist">Checking storage…</p>
        <div class="row"><button class="btn text danger-text" data-act="erase">Erase all data on this device</button></div>
      </div>

      <p class="meta">Ledger ${APP_VERSION} · ${s.persons.length} ${s.persons.length === 1 ? 'entry' : 'entries'} · ${s.variables.length} variables</p>
    </main>`;

  navigator.storage?.persisted?.().then((p) => {
    $('#persist').textContent = p
      ? 'Storage is marked persistent, so the browser won\'t clear it to free space.'
      : 'The browser may clear this storage if the device runs low on space. Installing Ledger to the home screen and keeping backups protects against that.';
  });
  $('#timeout')?.addEventListener('change', (e) => { st.lockTimeout = Number(e.target.value); vault.save(); });
  $('#theme').addEventListener('change', (e) => { st.theme = e.target.value; vault.save(); applyTheme(); });
  $('#rememberpw').addEventListener('change', async (e) => {
    if (!e.target.checked) { st.backupPassword = null; vault.save(); return; }
    const r = await askPassword({ title: 'Backup password', message: 'Used for every backup from now on.', confirm: true });
    if (!r) { e.target.checked = false; return; }
    st.backupPassword = r.password; vault.save();
  });
  const rfile = $('#rfile');
  rfile.addEventListener('change', async () => {
    suppressLock = false;
    const f = rfile.files[0];
    rfile.value = '';
    if (!f) return;
    if (!(await ask('Replace everything?', 'Restoring a backup replaces all entries, ratings, logs, and variables currently in Ledger.', 'Continue', true))) return;
    if (await restoreFromFile(f)) render();
  });

  handlers = {
    back: () => go('#/'),
    pin: pinDialog,
    nopin: async () => {
      if (!(await ask('Remove PIN?', 'Ledger will open without a PIN. Data stays encrypted with this browser\'s key.', 'Remove', true))) return;
      await vault.setPin(null); render(); toast('PIN removed.');
    },
    lock: () => doLock(),
    backup: () => backupNow(),
    restorefile: () => pickFile(rfile),
    erase: async () => {
      if (!(await ask('Erase everything?', 'This deletes every entry, photo, and setting on this device. Only a backup file can bring them back.', 'Erase', true))) return;
      if (!(await ask('Are you certain?', 'There is no undo.', 'Erase everything', true))) return;
      await vault.eraseEverything();
      location.hash = '';
      location.reload();
    }
  };
}

// ---------- lock screen and first run ----------
function showLock() {
  handlers = {};
  app.innerHTML = `<main class="center">
    <img class="logo" src="icons/icon.svg" alt="">
    <h1>Ledger</h1>
    <form id="lf" class="lockform">
      <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="PIN" aria-label="PIN" maxlength="8">
      <button class="btn filled" id="ub">Unlock</button>
      <p class="err" id="lerr" hidden></p>
    </form>
    <button class="btn text" data-act="forgot">Forgot PIN?</button>
  </main>`;
  const pin = $('#pin'), err = $('#lerr'), btn = $('#ub');
  const showOut = () => {
    const ms = vault.lockedOutMs();
    if (ms <= 0) { btn.disabled = false; return; }
    btn.disabled = true;
    err.hidden = false;
    err.textContent = `Too many wrong attempts. Try again in ${Math.ceil(ms / 1000)} s.`;
    setTimeout(showOut, 1000);
  };
  showOut();
  setTimeout(() => pin.focus(), 50);
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pin.value.length < 4 || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const ok = await vault.unlock(pin.value);
    btn.textContent = 'Unlock';
    btn.disabled = false;
    if (ok) return start();
    pin.value = '';
    err.hidden = false;
    err.textContent = 'Incorrect PIN.';
    showOut();
    pin.focus();
  });
  handlers.forgot = async () => {
    if (!(await ask('Forgot your PIN?', 'The PIN encrypts your data, so it can\'t be reset. You can erase Ledger on this device and restore from a backup file.', 'Erase and start over', true))) return;
    if (!(await ask('Erase everything?', 'Every entry on this device will be deleted. There is no undo.', 'Erase', true))) return;
    await vault.eraseEverything();
    location.reload();
  };
}

function showWelcome() {
  handlers = {};
  app.innerHTML = `<main class="center welcome">
    <img class="logo" src="icons/icon.svg" alt="">
    <h1>Ledger</h1>
    <p class="muted">Private notes on the people you meet. Everything stays on this device, encrypted.</p>
    <form id="wf" class="col">
      <label class="field"><span>PIN (optional, 4 to 8 digits)</span><input name="a" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="off"></label>
      <label class="field"><span>Repeat PIN</span><input name="b" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="off"></label>
      <p class="err" hidden></p>
      <button class="btn filled">Start</button>
    </form>
    <button class="btn tonal" type="button" data-install data-act="install"${isInstalled() ? ' hidden' : ''}>Install app</button>
    <button class="btn text" data-act="restore">Restore from a backup instead</button>
    <input type="file" id="wfile" accept=".ledger,application/octet-stream,application/json,*/*" hidden>
  </main>`;
  const f = $('#wf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('.err');
    const a = f.a.value, b = f.b.value;
    if (a || b) {
      if (!/^\d{4,8}$/.test(a)) { err.textContent = 'A PIN must be 4 to 8 digits.'; err.hidden = false; return; }
      if (a !== b) { err.textContent = 'The PINs don\'t match.'; err.hidden = false; return; }
    }
    f.querySelector('button').disabled = true;
    await vault.create(emptyState());
    if (a) await vault.setPin(a);
    start();
  });
  const wfile = $('#wfile');
  wfile.addEventListener('change', async () => {
    suppressLock = false;
    const file = wfile.files[0];
    wfile.value = '';
    if (!file) return;
    await vault.create(emptyState());
    if (await restoreFromFile(file, { fresh: true })) start();
    else { await vault.eraseEverything(); location.reload(); }
  });
  handlers.restore = () => pickFile(wfile);
}

function start() {
  vault.state && Object.assign(vault.state, normalize(vault.state));
  applyTheme();
  lastRoute = null;
  navigator.storage?.persist?.();
  render();
}

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let reloading = false;
  // Only reload when an update replaces a running version, not on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (w) => toast('A new version of Ledger is ready.', {
      label: 'Update', run: async () => { await vault.saveNow(); w.postMessage('skipWaiting'); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch(() => {});
}

// ---------- boot ----------
(async () => {
  try {
    const st = await vault.init();
    if (st.firstRun) showWelcome();
    else if (st.hasPin) showLock();
    else { await vault.unlock(); start(); }
  } catch (e) {
    app.innerHTML = `<main class="center"><h1>Ledger can't open</h1><p class="err">${esc(e.message || e)}</p>
      <p class="muted">Private or incognito windows, and some browser settings, block the storage Ledger needs.</p></main>`;
  }
})();
