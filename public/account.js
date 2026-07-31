/* Account widget for the prompt studio.
 *
 * Lives outside <x-dc> as plain DOM so the dc runtime never re-renders it away.
 * The generator itself stays usable signed-out; signing in is what makes the
 * history durable across browsers. The dc logic class talks to this file through
 * window.AIGEN_ACCOUNT and the "aigen:auth" event. */
(() => {
  'use strict';

  const state = {
    user: null,
    config: { email: false, telegram: false, dial: '855', country: 'KH', otpLength: 6 },
    channel: 'email',
    step: 'choose', // choose → code
    identifier: '',
    busy: false,
    error: '',
    info: '',
    open: false,
  };

  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

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
      /* empty body */
    }
    if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
    return body;
  }

  /* ------------------------------------------------------------------ css */

  const CSS = `
  .aigen-acct, .aigen-acct * { box-sizing: border-box; }
  .aigen-acct {
    position: fixed; right: 20px; bottom: 20px; z-index: 40;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    max-width: min(320px, calc(100vw - 32px));
    font-family: 'Space Grotesk','Noto Sans Khmer',-apple-system,BlinkMacSystemFont,sans-serif;
  }
  .aigen-chip {
    display: flex; align-items: center; gap: 9px;
    background: #15181d; border: 1px solid #3a4150; border-radius: 999px;
    padding: 10px 18px; color: #c8f04a; font-size: 13px; font-weight: 700;
    cursor: pointer; box-shadow: 0 6px 24px rgba(0,0,0,.45);
  }
  .aigen-chip:hover { border-color: #c8f04a; }
  .aigen-chip__dot { width: 7px; height: 7px; border-radius: 50%; background: #c8f04a; }
  .aigen-chip--out { color: #e8eaed; }
  .aigen-chip--out .aigen-chip__dot { background: #5c6470; }

  .aigen-modal {
    position: fixed; inset: 0; background: rgba(0,0,0,.72); z-index: 50;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .aigen-box {
    width: min(400px, 100%); background: #15181d; border: 1px solid #3a4150;
    border-radius: 16px; padding: 26px; color: #e8eaed; max-height: 90vh; overflow: auto;
  }
  .aigen-eyebrow { font-family: 'IBM Plex Mono',ui-monospace,monospace; font-size: 10px; letter-spacing: 3px; color: #c8f04a; text-transform: uppercase; }
  .aigen-box h2 { margin: 8px 0 6px; font-size: 19px; font-weight: 700; }
  .aigen-box p.sub { margin: 0 0 18px; font-size: 13px; line-height: 1.6; color: #8b93a1; }

  .aigen-seg { display: flex; gap: 4px; background: #0d0f12; border: 1px solid #262b33; border-radius: 10px; padding: 4px; margin-bottom: 16px; }
  .aigen-seg button {
    flex: 1; border: none; background: transparent; color: #8b93a1;
    padding: 9px 10px; border-radius: 7px; font-family: inherit;
    font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .aigen-seg button[aria-pressed='true'] { background: #c8f04a; color: #0d0f12; }

  .aigen-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .aigen-field > span { font-size: 12px; font-weight: 600; color: #8b93a1; }
  .aigen-field input {
    width: 100%; background: #0d0f12; border: 1px solid #3a4150; border-radius: 9px;
    padding: 11px 13px; color: #e8eaed; font-family: inherit; font-size: 14px;
  }
  .aigen-field input:focus { outline: none; border-color: #c8f04a; }
  .aigen-field input::placeholder { color: #5c6470; }
  .aigen-code {
    text-align: center; font-family: 'IBM Plex Mono',ui-monospace,monospace !important;
    font-size: 24px !important; letter-spacing: 10px; padding: 13px 10px !important;
  }

  .aigen-btn {
    width: 100%; border: 1px solid #3a4150; background: #191d23; color: #c6ccd6;
    padding: 11px 16px; border-radius: 10px; font-family: inherit;
    font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .aigen-btn:hover:not(:disabled) { border-color: #c8f04a; color: #e8eaed; }
  .aigen-btn:disabled { opacity: .5; cursor: not-allowed; }
  .aigen-btn--primary { background: #c8f04a; border-color: #c8f04a; color: #0d0f12; }
  .aigen-btn--primary:hover:not(:disabled) { background: #d7ff5f; color: #0d0f12; }
  .aigen-btn + .aigen-btn { margin-top: 9px; }

  .aigen-note { font-size: 12.5px; line-height: 1.55; padding: 10px 12px; border-radius: 9px; margin-bottom: 14px; }
  .aigen-note--err { background: rgba(255,107,107,.12); color: #ffb1b1; border: 1px solid rgba(255,107,107,.3); }
  .aigen-note--ok { background: rgba(200,240,74,.1); color: #c8f04a; border: 1px solid rgba(200,240,74,.28); }

  .aigen-fine { margin: 16px 0 0; font-size: 11.5px; line-height: 1.6; color: #5c6470; }
  .aigen-fine a { color: #8b93a1; }

  .aigen-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .aigen-id { font-size: 14px; font-weight: 600; word-break: break-all; }
  .aigen-meta { font-size: 12px; color: #5c6470; margin-top: 2px; }
  .aigen-x { background: none; border: none; color: #5c6470; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .aigen-x:hover { color: #e8eaed; }
  .aigen-spin { display: inline-block; width: 13px; height: 13px; border: 2px solid #3a4150; border-top-color: #0d0f12; border-radius: 50%; animation: aigen-spin .7s linear infinite; }
  @keyframes aigen-spin { to { transform: rotate(360deg); } }

  /* The generator body is min-height:100vh, so a page-footer disclosure would sit
     below the fold. It rides with the account chip instead — always on screen. */
  .aigen-disclose {
    background: #15181d; border: 1px solid #262b33; border-radius: 11px;
    padding: 9px 13px; font-size: 11px; line-height: 1.65;
    color: #8b93a1; text-align: right;
  }
  .aigen-disclose em { font-style: normal; color: #5c6470; }

  @media (max-width: 640px) {
    .aigen-acct { right: 12px; bottom: 12px; }
    .aigen-disclose { display: none; }
  }
  `;

  function injectCss() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* --------------------------------------------------------------- render */

  let host, modalHost;

  /* Prompts are stored server-side whether or not you're signed in, so the notice
     sits on the page next to the chip rather than only inside the sign-in modal.
     Signed-in visitors already know — saving is the feature they opted into. */
  const DISCLOSURE = `<div class="aigen-disclose">
      Prompts you copy are saved on this site to improve the templates.<br>
      <em>ប្រអប់បញ្ជាដែលអ្នកចម្លង ត្រូវបានរក្សាទុកក្នុងគេហទំព័រនេះ។</em>
    </div>`;

  function renderChip() {
    const signedIn = Boolean(state.user);
    const label = signedIn
      ? state.user.email || state.user.phone || 'Account'
      : 'Sign in to save';
    host.innerHTML = `${signedIn ? '' : DISCLOSURE}
      <button class="aigen-chip${signedIn ? '' : ' aigen-chip--out'}" type="button">
        <span class="aigen-chip__dot"></span>${esc(label)}
      </button>`;
    host.querySelector('button').addEventListener('click', openModal);
  }

  function noteHtml() {
    if (state.error) return `<div class="aigen-note aigen-note--err">${esc(state.error)}</div>`;
    if (state.info) return `<div class="aigen-note aigen-note--ok">${esc(state.info)}</div>`;
    return '';
  }

  function accountView() {
    const u = state.user;
    return `<div class="aigen-row">
        <div>
          <div class="aigen-eyebrow">Signed in</div>
          <div class="aigen-id">${esc(u.email || u.phone)}</div>
          <div class="aigen-meta">Your copied prompts are saved to this account.</div>
        </div>
        <button class="aigen-x" data-close type="button">&times;</button>
      </div>
      ${noteHtml()}
      ${
        u.role === 'superadmin'
          ? '<a class="aigen-btn" href="/admin" style="display:block;text-align:center;text-decoration:none">Open superadmin →</a>'
          : ''
      }
      <button class="aigen-btn" data-signout type="button">Sign out</button>`;
  }

  function chooseView() {
    const both = state.config.email && state.config.telegram;
    const isEmail = state.channel === 'email';
    return `<div class="aigen-row">
        <div>
          <div class="aigen-eyebrow">Prompt Studio</div>
          <h2 style="margin:6px 0 0">Save your prompts</h2>
        </div>
        <button class="aigen-x" data-close type="button">&times;</button>
      </div>
      <p class="sub">You can keep generating without an account. Sign in and every prompt you
      copy is kept, so you can pick it up on any device.</p>
      ${noteHtml()}
      ${
        both
          ? `<div class="aigen-seg">
              <button type="button" data-channel="email" aria-pressed="${isEmail}">Email</button>
              <button type="button" data-channel="telegram" aria-pressed="${!isEmail}">Telegram</button>
            </div>`
          : ''
      }
      <form data-form="start">
        <label class="aigen-field">
          <span>${isEmail ? 'Email address' : 'Phone number on Telegram'}</span>
          <input type="${isEmail ? 'email' : 'tel'}" name="identifier" required
                 autocomplete="${isEmail ? 'email' : 'tel'}"
                 placeholder="${isEmail ? 'you@example.com' : `+${state.config.dial} 12 345 678`}"
                 value="${esc(state.identifier)}">
        </label>
        <button class="aigen-btn aigen-btn--primary" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? '<span class="aigen-spin"></span>' : 'Send code'}
        </button>
      </form>
      <p class="aigen-fine">We'll send a ${state.config.otpLength}-digit code — no password to remember.
      New here? The code creates your account.</p>`;
  }

  function codeView() {
    return `<div class="aigen-row">
        <div>
          <div class="aigen-eyebrow">Check ${state.channel === 'email' ? 'your inbox' : 'Telegram'}</div>
          <h2 style="margin:6px 0 0">Enter your code</h2>
        </div>
        <button class="aigen-x" data-close type="button">&times;</button>
      </div>
      <p class="sub">Sent to <strong>${esc(state.identifier)}</strong>.</p>
      ${noteHtml()}
      <form data-form="verify">
        <label class="aigen-field">
          <span>${state.config.otpLength}-digit code</span>
          <input class="aigen-code" type="text" name="code" inputmode="numeric"
                 autocomplete="one-time-code" maxlength="${state.config.otpLength}"
                 placeholder="${'·'.repeat(state.config.otpLength)}" required autofocus>
        </label>
        <button class="aigen-btn aigen-btn--primary" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? '<span class="aigen-spin"></span>' : 'Verify & continue'}
        </button>
      </form>
      <button class="aigen-btn" data-back type="button">Use a different ${
        state.channel === 'email' ? 'email' : 'number'
      }</button>`;
  }

  function renderModal() {
    if (!state.open) {
      modalHost.innerHTML = '';
      return;
    }
    const body = state.user ? accountView() : state.step === 'code' ? codeView() : chooseView();
    modalHost.innerHTML = `<div class="aigen-modal"><div class="aigen-box">${body}</div></div>`;

    const overlay = modalHost.querySelector('.aigen-modal');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    modalHost.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', closeModal)
    );

    const back = modalHost.querySelector('[data-back]');
    if (back) {
      back.addEventListener('click', () => {
        state.step = 'choose';
        state.error = '';
        state.info = '';
        renderModal();
      });
    }

    const signout = modalHost.querySelector('[data-signout]');
    if (signout) signout.addEventListener('click', signOut);

    modalHost.querySelectorAll('[data-channel]').forEach((b) =>
      b.addEventListener('click', () => {
        state.channel = b.dataset.channel;
        state.identifier = '';
        state.error = '';
        state.info = '';
        renderModal();
      })
    );

    const startForm = modalHost.querySelector('[data-form="start"]');
    if (startForm) startForm.addEventListener('submit', onStart);
    const verifyForm = modalHost.querySelector('[data-form="verify"]');
    if (verifyForm) verifyForm.addEventListener('submit', onVerify);

    const focusMe = modalHost.querySelector('input[autofocus], input');
    if (focusMe) focusMe.focus();
  }

  /* --------------------------------------------------------------- actions */

  function openModal() {
    state.open = true;
    state.error = '';
    state.info = '';
    renderModal();
  }

  function closeModal() {
    state.open = false;
    renderModal();
  }

  async function onStart(e) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get('identifier').toString().trim();
    if (!value) return;
    state.identifier = value;
    state.busy = true;
    state.error = '';
    state.info = '';
    renderModal();

    const path =
      state.channel === 'email' ? '/api/auth/email/start' : '/api/auth/telegram/start';
    const payload = state.channel === 'email' ? { email: value } : { phone: value };

    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      state.step = 'code';
      state.info = `Code sent to ${value}.`;
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      renderModal();
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get('code').toString().trim();
    if (!code) return;
    state.busy = true;
    state.error = '';
    state.info = '';
    renderModal();

    const path =
      state.channel === 'email' ? '/api/auth/email/verify' : '/api/auth/telegram/verify';
    const payload =
      state.channel === 'email'
        ? { email: state.identifier, code }
        : { phone: state.identifier, code };

    try {
      const out = await api(path, { method: 'POST', body: JSON.stringify(payload) });
      state.user = out.user;
      state.step = 'choose';
      state.info = out.claimedPrompts
        ? `Welcome! ${out.claimedPrompts} prompt${
            out.claimedPrompts === 1 ? '' : 's'
          } from this browser were added to your account.`
        : 'Welcome!';
      renderChip();
      broadcast();
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      renderModal();
    }
  }

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* clear locally regardless */
    }
    state.user = null;
    state.open = false;
    renderChip();
    renderModal();
    broadcast();
  }

  /** Tell the generator the signed-in identity changed so it can reload history. */
  function broadcast() {
    window.dispatchEvent(new CustomEvent('aigen:auth', { detail: { user: state.user } }));
  }

  /* ------------------------------------------------------------------ api */

  window.AIGEN_ACCOUNT = {
    get user() {
      return state.user;
    },
    open: openModal,

    /** Fire-and-forget: never let a logging failure break the copy button. */
    recordPrompt(payload) {
      try {
        fetch('/api/prompts', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    },

    async history(limit = 20) {
      if (!state.user) return null;
      try {
        const out = await api(`/api/prompts/mine?limit=${limit}`);
        return out.prompts;
      } catch {
        return null;
      }
    },
  };

  /* ----------------------------------------------------------------- boot */

  function mount() {
    injectCss();
    host = document.createElement('div');
    host.className = 'aigen-acct';
    modalHost = document.createElement('div');
    document.body.appendChild(host);
    document.body.appendChild(modalHost);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) closeModal();
    });

    renderChip();

    Promise.all([
      api('/api/auth/config').catch(() => null),
      api('/api/auth/me').catch(() => null),
    ]).then(([cfg, me]) => {
      if (cfg) Object.assign(state.config, cfg);
      // Default to whichever channel is actually configured.
      if (!state.config.email && state.config.telegram) state.channel = 'telegram';
      state.user = (me && me.user) || null;
      renderChip();
      if (state.user) broadcast();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
