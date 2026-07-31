/* Superadmin console. The shell is public; every byte of data behind it comes
   from /api/admin/*, which requires a superadmin session cookie. */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const el = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ api */

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* empty or non-JSON response */
    }
    if (!res.ok) {
      const err = new Error((body && body.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /* --------------------------------------------------------------- format */

  const pad = (n) => String(n).padStart(2, '0');
  function when(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (sameDay) return `Today ${time}`;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
  }

  const num = (n) => Number(n || 0).toLocaleString();

  /** Everything user-supplied goes through here before touching innerHTML. */
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  /* ---------------------------------------------------------------- login */

  const loginState = { email: '' };

  function note(msg, kind) {
    const n = el('login-note');
    if (!msg) {
      n.className = 'note hidden';
      n.textContent = '';
      return;
    }
    n.className = `note note--${kind || 'error'}`;
    n.textContent = msg;
  }

  function busy(button, on, label) {
    button.disabled = on;
    if (on) {
      button.dataset.label = button.textContent;
      button.innerHTML = '<span class="spinner"></span>';
    } else {
      button.textContent = label || button.dataset.label || button.textContent;
    }
  }

  el('login-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el('login-email').value.trim();
    if (!email) return;
    note('');
    busy(el('login-send'), true);
    try {
      await api('/api/auth/email/start', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      loginState.email = email;
      el('login-email-form').classList.add('hidden');
      el('login-code-form').classList.remove('hidden');
      note(`Code sent to ${email}. It expires in a few minutes.`, 'ok');
      el('login-code').focus();
    } catch (err) {
      note(err.message);
    } finally {
      busy(el('login-send'), false, 'Send code');
    }
  });

  el('login-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    note('');
    busy(el('login-verify'), true);
    try {
      const out = await api('/api/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ email: loginState.email, code: el('login-code').value }),
      });
      if (out.user.role !== 'superadmin') {
        note('That account is not a superadmin.');
        return;
      }
      start(out.user);
    } catch (err) {
      note(err.message);
    } finally {
      busy(el('login-verify'), false, 'Verify & sign in');
    }
  });

  el('login-back').addEventListener('click', () => {
    el('login-code-form').classList.add('hidden');
    el('login-email-form').classList.remove('hidden');
    el('login-code').value = '';
    note('');
  });

  el('logout').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* signing out locally regardless */
    }
    location.reload();
  });

  /* ----------------------------------------------------------------- tabs */

  const VIEWS = ['overview', 'prompts', 'users'];

  function showView(name, updateHash = true) {
    if (!VIEWS.includes(name)) name = 'overview';
    document.querySelectorAll('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.dataset.view === name))
    );
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    el(`view-${name}`).classList.remove('hidden');
    if (updateHash && location.hash.slice(1) !== name) {
      history.replaceState(null, '', `#${name}`);
    }
    if (name === 'users') loadUsers().catch(console.error);
    if (name === 'prompts') loadPrompts().catch(console.error);
    if (name === 'overview') loadStats().catch(console.error);
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));

  /* ------------------------------------------------------------- overview */

  function bars(target, rows, labelKey, valueKey) {
    const max = Math.max(1, ...rows.map((r) => r[valueKey]));
    target.innerHTML =
      rows
        .map(
          (r) => `<div>
            <div class="bar__top"><span>${esc(r[labelKey] || '—')}</span><span class="muted">${num(
              r[valueKey]
            )}</span></div>
            <div class="bar__track"><div class="bar__fill" style="width:${
              (r[valueKey] / max) * 100
            }%"></div></div>
          </div>`
        )
        .join('') || '<div class="faint">No data yet.</div>';
  }

  async function loadStats() {
    const s = await api('/api/admin/stats');
    const cards = [
      { label: 'Total prompts', value: s.prompts.total, sub: `${num(s.prompts.last24h)} in last 24h`, accent: true },
      { label: 'Not signed in', value: s.prompts.anonymous, sub: `${num(s.visitors.anonBrowsers)} browsers` },
      { label: 'From registered', value: s.prompts.registered, sub: `${num(s.prompts.last7d)} in last 7d` },
      { label: 'Registered users', value: s.users.total, sub: `${num(s.users.last7d)} new this week` },
      { label: 'Blocked users', value: s.users.blocked, sub: 'suspended accounts' },
    ];
    el('stat-cards').innerHTML = cards
      .map(
        (c) => `<div class="stat">
          <div class="stat__label">${esc(c.label)}</div>
          <div class="stat__value${c.accent ? ' stat__value--accent' : ''}">${num(c.value)}</div>
          <div class="stat__sub">${esc(c.sub)}</div>
        </div>`
      )
      .join('');

    bars(el('chart-models'), s.topModels, 'model', 'c');
    bars(el('chart-daily'), s.daily, 'd', 'c');

    // Populate the model filter once, from whatever has actually been used.
    const sel = el('f-model');
    if (sel.options.length <= 1) {
      for (const m of s.topModels) {
        const o = document.createElement('option');
        o.value = m.model;
        o.textContent = m.model;
        sel.appendChild(o);
      }
    }
  }

  /* -------------------------------------------------- User Prompt Modules */

  const promptState = { page: 1, pages: 1 };

  function promptQuery() {
    const p = new URLSearchParams();
    const q = el('f-q').value.trim();
    if (q) p.set('q', q);
    if (el('f-audience').value !== 'all') p.set('audience', el('f-audience').value);
    if (el('f-mode').value) p.set('mode', el('f-mode').value);
    if (el('f-model').value) p.set('model', el('f-model').value);
    p.set('page', String(promptState.page));
    return p;
  }

  async function loadPrompts() {
    const p = promptQuery();
    const data = await api(`/api/admin/prompts?${p}`);
    promptState.pages = data.pages;

    el('f-csv').href = `/api/admin/prompts.csv?audience=${el('f-audience').value}`;
    el('prompt-count').textContent = `${num(data.total)} prompts · page ${data.page} of ${data.pages}`;
    el('prompt-prev').disabled = data.page <= 1;
    el('prompt-next').disabled = data.page >= data.pages;
    el('prompt-empty').classList.toggle('hidden', data.prompts.length > 0);

    el('prompt-rows').innerHTML = data.prompts
      .map((row) => {
        const a = row.author;
        const pill =
          a.type === 'anonymous'
            ? `<span class="pill pill--anon">${esc(a.label)}</span>`
            : `<span class="pill pill--${a.role === 'superadmin' ? 'admin' : 'user'}">${esc(
                a.label
              )}</span>`;
        return `<tr>
          <td class="mono faint">${row.id}</td>
          <td class="nowrap muted">${esc(when(row.createdAt))}</td>
          <td>${pill}</td>
          <td class="muted">${esc(row.mode || '—')}</td>
          <td class="muted">${esc(row.model || '—')}</td>
          <td class="prompt-cell"><p>${esc(row.prompt)}</p></td>
          <td class="nowrap">
            <button class="btn btn--sm" data-view-prompt="${row.id}">View</button>
            <button class="btn btn--sm btn--danger" data-del-prompt="${row.id}">✕</button>
          </td>
        </tr>`;
      })
      .join('');
  }

  el('prompt-rows').addEventListener('click', async (e) => {
    const viewId = e.target.dataset.viewPrompt;
    const delId = e.target.dataset.delPrompt;
    if (viewId) return showPrompt(viewId);
    if (delId) {
      if (!confirm(`Delete prompt #${delId}? This cannot be undone.`)) return;
      await api(`/api/admin/prompts/${delId}`, { method: 'DELETE' });
      loadPrompts();
    }
  });

  async function showPrompt(id) {
    const { prompt } = await api(`/api/admin/prompts/${id}`);
    const a = prompt.author;
    const fields = prompt.fields
      ? Object.entries(prompt.fields)
          .filter(([, v]) => v && v !== 'None')
          .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
          .join('')
      : '';

    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `<div class="modal__box">
      <div class="modal__head">
        <h2>Prompt #${prompt.id}</h2>
        <button class="btn btn--sm" data-close>Close</button>
      </div>
      <dl class="kv">
        <dt>Author</dt><dd>${esc(a.label)} <span class="faint">(${esc(a.type)})</span></dd>
        <dt>Created</dt><dd>${esc(when(prompt.createdAt))}</dd>
        <dt>Mode / model</dt><dd>${esc(prompt.mode || '—')} · ${esc(prompt.model || '—')}</dd>
        <dt>Language</dt><dd>${esc(prompt.lang || '—')}</dd>
        <dt>Length</dt><dd>${num(prompt.charCount)} chars</dd>
        <dt>Origin</dt><dd class="mono">${esc(prompt.ip || '—')} ${esc(prompt.country || '')}</dd>
      </dl>
      <pre class="prompt-full">${esc(prompt.prompt)}</pre>
      ${fields ? `<h2 style="margin:20px 0 10px;font-size:14px">Form fields</h2><dl class="kv">${fields}</dl>` : ''}
    </div>`;

    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.hasAttribute('data-close')) box.remove();
    });
    document.body.appendChild(box);
  }

  el('prompt-prev').addEventListener('click', () => {
    if (promptState.page > 1) {
      promptState.page--;
      loadPrompts();
    }
  });
  el('prompt-next').addEventListener('click', () => {
    if (promptState.page < promptState.pages) {
      promptState.page++;
      loadPrompts();
    }
  });
  el('f-reset').addEventListener('click', () => {
    el('f-q').value = '';
    el('f-audience').value = 'all';
    el('f-mode').value = '';
    el('f-model').value = '';
    promptState.page = 1;
    loadPrompts();
  });

  let searchTimer;
  ['f-q', 'f-audience', 'f-mode', 'f-model'].forEach((id) => {
    el(id).addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        promptState.page = 1;
        loadPrompts();
      }, 250);
    });
  });

  /* ---------------------------------------------------------------- users */

  const userState = { page: 1, pages: 1 };

  async function loadUsers() {
    const p = new URLSearchParams();
    const q = el('u-q').value.trim();
    if (q) p.set('q', q);
    p.set('page', String(userState.page));

    const data = await api(`/api/admin/users?${p}`);
    userState.pages = data.pages;
    el('user-count').textContent = `${num(data.total)} users · page ${data.page} of ${data.pages}`;
    el('user-prev').disabled = data.page <= 1;
    el('user-next').disabled = data.page >= data.pages;
    el('user-empty').classList.toggle('hidden', data.users.length > 0);

    el('user-rows').innerHTML = data.users
      .map(
        (u) => `<tr>
          <td class="mono faint">${u.id}</td>
          <td>
            <div>${esc(u.email || u.phone || u.displayName || '—')}</div>
            ${u.email && u.phone ? `<div class="faint mono">${esc(u.phone)}</div>` : ''}
          </td>
          <td><span class="pill pill--${u.role === 'superadmin' ? 'admin' : 'user'}">${esc(
            u.role
          )}</span></td>
          <td>${
            u.status === 'blocked'
              ? '<span class="pill pill--blocked">blocked</span>'
              : '<span class="muted">active</span>'
          }</td>
          <td class="muted">${num(u.promptCount)}</td>
          <td class="nowrap muted">${esc(when(u.createdAt))}</td>
          <td class="nowrap muted">${esc(when(u.lastLoginAt))}</td>
          <td class="nowrap">
            <button class="btn btn--sm" data-prompts-of="${u.id}">Prompts</button>
            <button class="btn btn--sm" data-toggle-status="${u.id}" data-status="${esc(u.status)}">${
              u.status === 'blocked' ? 'Unblock' : 'Block'
            }</button>
          </td>
        </tr>`
      )
      .join('');
  }

  el('user-rows').addEventListener('click', async (e) => {
    const promptsOf = e.target.dataset.promptsOf;
    const toggleId = e.target.dataset.toggleStatus;

    if (promptsOf) {
      // Jump to the prompt list scoped to this user.
      document.querySelector('.tab[data-view="prompts"]').click();
      el('f-audience').value = 'registered';
      const data = await api(`/api/admin/prompts?userId=${promptsOf}`);
      promptState.pages = data.pages;
      el('prompt-count').textContent = `${num(data.total)} prompts from user #${promptsOf}`;
      el('prompt-empty').classList.toggle('hidden', data.prompts.length > 0);
      el('prompt-rows').innerHTML = data.prompts
        .map(
          (row) => `<tr>
            <td class="mono faint">${row.id}</td>
            <td class="nowrap muted">${esc(when(row.createdAt))}</td>
            <td><span class="pill pill--user">${esc(row.author.label)}</span></td>
            <td class="muted">${esc(row.mode || '—')}</td>
            <td class="muted">${esc(row.model || '—')}</td>
            <td class="prompt-cell"><p>${esc(row.prompt)}</p></td>
            <td class="nowrap"><button class="btn btn--sm" data-view-prompt="${row.id}">View</button></td>
          </tr>`
        )
        .join('');
      return;
    }

    if (toggleId) {
      const next = e.target.dataset.status === 'blocked' ? 'active' : 'blocked';
      try {
        await api(`/api/admin/users/${toggleId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: next }),
        });
        loadUsers();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  el('user-prev').addEventListener('click', () => {
    if (userState.page > 1) {
      userState.page--;
      loadUsers();
    }
  });
  el('user-next').addEventListener('click', () => {
    if (userState.page < userState.pages) {
      userState.page++;
      loadUsers();
    }
  });
  let userTimer;
  el('u-q').addEventListener('input', () => {
    clearTimeout(userTimer);
    userTimer = setTimeout(() => {
      userState.page = 1;
      loadUsers();
    }, 250);
  });

  /* ------------------------------------------------------------------ boot */

  function start(user) {
    el('boot').classList.add('hidden');
    el('login').classList.add('hidden');
    el('console').classList.remove('hidden');
    el('whoami-label').textContent = user.email || user.phone || `User #${user.id}`;
    // Stats always load: they also populate the model filter used by the prompt view.
    loadStats()
      .catch((e) => console.error(e))
      .finally(() => showView(location.hash.slice(1) || 'overview', false));
  }

  function showLogin() {
    el('boot').classList.add('hidden');
    el('console').classList.add('hidden');
    el('login').classList.remove('hidden');
    el('login-email').focus();
  }

  api('/api/auth/me')
    .then(({ user }) => {
      if (user && user.role === 'superadmin') start(user);
      else showLogin();
    })
    .catch(showLogin);
})();
