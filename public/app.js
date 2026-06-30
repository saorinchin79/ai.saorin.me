/* ============================================================
   AI Prompt Template Generator — UI logic
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const LIB_KEY = 'apt_library_v1';
const DRAFT_KEY = 'apt_draft_v1';

let state = blankState();
let lastFocused = null; // last edited input/textarea (for token insertion)

/* ---------- path helpers ---------- */
const getPath = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o);
  t[last] = v;
}

/* ---------- token substitution ---------- */
function tokenMap() {
  const s = state;
  const map = {
    character: s.subjects.character,
    object: s.subjects.object,
    scene: s.subjects.scene,
    background: s.subjects.background,
    surface: s.subjects.surface,
    ref: s.meta.refLabel ? `@[${s.meta.refLabel}]` : '',
    grade: s.style.grade,
    fps: s.style.fps,
    brand: s.meta.brand,
    verdict: s.meta.verdict,
    duration: s.meta.duration,
  };
  // custom editable placeholder tokens (override/extend the built-ins)
  (s.fields || []).forEach((f) => {
    const k = String(f.key || '').trim();
    if (k) map[k] = f.value;
  });
  return map;
}
function applyTokens(text) {
  const map = tokenMap();
  return String(text == null ? '' : text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) =>
    k in map ? (map[k] || '') : m
  );
}

/* ---------- prompt generation ---------- */
function ensureStop(t) {
  const s = String(t).trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return /[.?!:;'"”’)\]]$/.test(s) ? s : s + '.';
}
function shotToText(shot, idx) {
  const num = String(idx + 1).padStart(2, '0');
  let header = `SHOT ${num}`;
  const title = applyTokens(shot.title).trim();
  const sub = applyTokens(shot.subtitle).trim();
  if (title) header += ` — ${title}`;
  if (sub) header += ` — ${sub}`;

  const parts = [];
  if (shot.camera && applyTokens(shot.camera).trim()) parts.push(ensureStop(applyTokens(shot.camera)));
  if (shot.lighting && applyTokens(shot.lighting).trim()) parts.push(ensureStop(applyTokens(shot.lighting)));
  if (shot.action && applyTokens(shot.action).trim()) parts.push(ensureStop(applyTokens(shot.action)));
  const dlg = applyTokens(shot.dialogue).trim();
  if (dlg) {
    const lead = applyTokens(shot.dialogueLead).trim();
    const line = dlg.replace(/^['"]+|['"]+$/g, '');
    parts.push(`${lead ? lead + ' ' : ''}'${line}'`);
  }
  if (shot.gradeTech && applyTokens(shot.gradeTech).trim()) parts.push(ensureStop(applyTokens(shot.gradeTech)));

  return `${header}\n${parts.join(' ')}`.trim();
}
function sectionToText(block) {
  const heading = applyTokens(block.title).trim();
  const body = applyTokens(block.action).replace(/[ \t]+$/gm, '').trim(); // keep internal line breaks
  if (!heading && !body) return '';
  return [heading, body].filter(Boolean).join('\n');
}
function generate() {
  const head = (applyTokens(state.meta.category).trim() || 'Prompt') + ':';
  const concept = applyTokens(state.meta.concept).trim();
  let blocks;
  if (state.meta.kind === 'sections') {
    blocks = state.shots.map((b) => sectionToText(b)).filter(Boolean).join('\n\n');
  } else {
    blocks = state.shots.map((sh, i) => shotToText(sh, i)).join('\n\n---\n\n');
  }
  return [head, concept, blocks].filter((x) => x && x.trim()).join('\n\n');
}

/* ---------- render ---------- */
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight + 2, 460) + 'px';
}
function setStaticValues() {
  $$('[data-bind]').forEach((el) => {
    el.value = getPath(state, el.dataset.bind) ?? '';
    if (el.tagName === 'TEXTAREA') autoGrow(el);
  });
}
function renderShots() {
  const wrap = $('#shots');
  wrap.innerHTML = '';
  const tpl = state.meta.kind === 'sections' ? $('#section-template') : $('#shot-template');
  state.shots.forEach((shot, idx) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = shot._id;
    node.querySelector('.shot__num').textContent = String(idx + 1).padStart(2, '0');
    node.querySelectorAll('[data-shot-field]').forEach((el) => {
      el.value = shot[el.dataset.shotField] ?? '';
      if (el.tagName === 'TEXTAREA') autoGrow(el);
    });
    wrap.appendChild(node);
  });
}
function totalSeconds() {
  return state.shots.reduce((sum, sh) => {
    const n = parseFloat(sh.seconds);
    return sum + (isFinite(n) && n > 0 ? n : 0);
  }, 0);
}
function fmtDuration(total) {
  const t = Math.round(total * 10) / 10;
  if (t <= 0) return '0s';
  if (t < 60) return `${t}s`;
  const whole = Math.round(t); // split whole seconds so the remainder can never round up to 60
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
function update() {
  const out = generate();
  $('#output').textContent = out;
  const words = (out.match(/\S+/g) || []).length;
  const n = state.shots.length;
  if (state.meta.kind === 'sections') {
    $('#stats').textContent = `${n} sections · ${words} words · ${out.length} chars`;
    $('#shot-count').textContent = `(${n})`;
  } else {
    const rt = fmtDuration(totalSeconds());
    $('#stats').textContent = `${n} shots · ~${rt} · ${words} words · ${out.length} chars`;
    $('#shot-count').textContent = `(${n} · ~${rt})`;
  }
  saveDraft();
}

/* ---------- template kind UI + custom fields ---------- */
function applyKindUI() {
  const kind = state.meta.kind === 'sections' ? 'sections' : 'shots';
  document.body.dataset.kind = kind;
  $$('[data-kind-only]').forEach((el) => { el.hidden = el.dataset.kindOnly !== kind; });
  $('#blocks-label').textContent = kind === 'sections' ? 'Sections' : 'Shots';
  $('#btn-add-shot').textContent = kind === 'sections' ? '＋ Add section' : '＋ Add shot';
}
function renderFields() {
  const wrap = $('#fields');
  wrap.innerHTML = '';
  const tpl = $('#field-template');
  (state.fields || []).forEach((f) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = f._id;
    node.querySelectorAll('[data-field-prop]').forEach((el) => {
      el.value = f[el.dataset.fieldProp] ?? '';
    });
    wrap.appendChild(node);
  });
}
function renderPresetsMenu() {
  $('#presets-menu').innerHTML = PRESETS.map(
    (p) => `<div class="lib__item"><button class="lib__load" data-preset="${p.id}" title="Load this starter prompt">${escapeHtml(p.name)}</button></div>`
  ).join('');
}

/* ---------- state load ---------- */
function normalize(s) {
  const base = blankState();
  s = s || {};
  const meta = { ...base.meta, ...(s.meta || {}) };
  meta.kind = meta.kind === 'sections' ? 'sections' : 'shots';
  return {
    meta,
    subjects: { ...base.subjects, ...(s.subjects || {}) },
    style: { ...base.style, ...(s.style || {}) },
    fields: (Array.isArray(s.fields) ? s.fields : []).map((f) =>
      newField({ ...(f && typeof f === 'object' ? f : {}), _id: undefined })
    ),
    shots: (Array.isArray(s.shots) && s.shots.length ? s.shots : base.shots).map((sh) =>
      newShot({ ...(sh && typeof sh === 'object' ? sh : {}), _id: undefined })
    ),
  };
}
function loadState(s) {
  state = normalize(s);
  applyKindUI();
  setStaticValues();
  renderFields();
  renderTokenbar();
  renderShots();
  update();
}

/* ---------- draft + library (localStorage) ---------- */
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch {}
}
function getLib() {
  try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch { return []; }
}
function setLib(l) { localStorage.setItem(LIB_KEY, JSON.stringify(l)); }

function saveToLibrary() {
  const name = prompt('Save this template as:', state.meta.category || 'Untitled');
  if (!name) return;
  const lib = getLib();
  const rec = { name: name.trim(), data: state, ts: Date.now() };
  const i = lib.findIndex((r) => r.name.toLowerCase() === rec.name.toLowerCase());
  if (i >= 0) lib[i] = rec; else lib.push(rec);
  setLib(lib);
  flash(`Saved “${rec.name}”`);
}
function renderLibMenu() {
  const menu = $('#lib-menu');
  const lib = getLib().sort((a, b) => b.ts - a.ts);
  if (!lib.length) {
    menu.innerHTML = `<div class="lib__empty">No saved templates yet.<br/>Click <b>Save</b> to add one.</div>`;
    return;
  }
  menu.innerHTML = lib
    .map(
      (r, i) => `
      <div class="lib__item">
        <button class="lib__load" data-lib-load="${i}" title="Load this template">${escapeHtml(r.name)}</button>
        <button class="lib__del" data-lib-del="${i}" title="Delete">✕</button>
      </div>`
    )
    .join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- clipboard / download ---------- */
async function copyPrompt() {
  const text = generate();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  flash('Copied to clipboard ✓');
}
function downloadPrompt() {
  const blob = new Blob([generate()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.meta.category || 'prompt').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 60) + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
/* ---------- JSON import / export (share templates as files) ---------- */
function slugify(s) {
  return String(s || 'prompt-template').replace(/[^\w]+/g, '_').toLowerCase().replace(/^_+|_+$/g, '').slice(0, 60) || 'prompt-template';
}
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slugify(state.meta.category) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  flash('Exported .json ✓');
}
function importJSONFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let obj;
    try {
      obj = JSON.parse(String(reader.result));
    } catch {
      alert('That file is not valid JSON.');
      return;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || (!obj.shots && !obj.subjects && !obj.meta)) {
      alert('That JSON does not look like a prompt template (expected meta / subjects / shots).');
      return;
    }
    try {
      loadState(obj);
    } catch (err) {
      alert('Could not load that template: ' + (err && err.message ? err.message : 'unexpected format'));
      return;
    }
    flash('Imported ✓');
  };
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
}

let flashTimer;
function flash(msg) {
  const el = $('#copy-hint');
  el.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (el.textContent = ''), 1800);
}

/* ---------- token bar + legend (built-in + custom field tokens) ---------- */
function activeTokens() {
  // cinematic built-ins only for 'shots' kind; custom fields always
  const builtins = state.meta.kind === 'sections' ? [] : TOKENS;
  const customs = (state.fields || [])
    .map((f) => ({ key: String(f.key || '').trim(), label: (f.label || '').trim() || String(f.key || '').trim() }))
    .filter((f) => f.key);
  return [...builtins, ...customs];
}
function makeChip(key, label) {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.type = 'button';
  chip.textContent = `{{${key}}}`;
  chip.title = `Insert ${label || key}`;
  chip.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep focus on the field
    insertToken(key);
  });
  return chip;
}
function renderTokenbar() {
  const bar = $('#tokenbar');
  $$('.chip, .tokenbar__none', bar).forEach((c) => c.remove());
  const toks = activeTokens();
  if (toks.length) {
    toks.forEach((t) => bar.appendChild(makeChip(t.key, t.label)));
  } else {
    const span = document.createElement('span');
    span.className = 'tokenbar__none';
    span.textContent = 'no tokens yet — add a field below';
    bar.appendChild(span);
  }
  renderLegend();
}
function renderLegend() {
  const toks = activeTokens();
  $('#legend-list').innerHTML = toks.length
    ? toks.map((t) => `<li><code>{{${escapeHtml(t.key)}}}</code><span>${escapeHtml(t.label)}</span></li>`).join('')
    : '<li><span>No tokens yet — add fields to create editable placeholders.</span></li>';
}
function insertToken(key) {
  const el = lastFocused;
  // el may be a detached node if the shots DOM was rebuilt (import / add / del / dup / move)
  if (!el || !document.contains(el)) { flash('Click into a field first, then a token'); return; }
  const t = `{{${key}}}`;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + t + el.value.slice(end);
  const pos = start + t.length;
  try { el.setSelectionRange(pos, pos); } catch {}
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------- wiring ---------- */
function wire() {
  // static field edits
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    setPath(state, el.dataset.bind, el.value);
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    update();
  });

  // track focus for token insertion (skip the numeric seconds field)
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el.matches('[data-bind], [data-shot-field], [data-field-prop="value"]') && el.type !== 'number') lastFocused = el;
  });

  // shot field edits (delegated)
  const shots = $('#shots');
  shots.addEventListener('input', (e) => {
    const el = e.target.closest('[data-shot-field]');
    if (!el) return;
    const card = el.closest('[data-shot]');
    const idx = [...shots.children].indexOf(card);
    if (idx < 0) return;
    state.shots[idx][el.dataset.shotField] = el.value;
    if (el.tagName === 'TEXTAREA') autoGrow(el);
    update();
  });

  // shot actions (delegated)
  shots.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-shot-act]');
    if (!btn) return;
    const card = btn.closest('[data-shot]');
    const idx = [...shots.children].indexOf(card);
    const act = btn.dataset.shotAct;
    if (act === 'del') {
      if (state.shots.length === 1) state.shots = [newShot()];
      else state.shots.splice(idx, 1);
    } else if (act === 'dup') {
      const copy = newShot();
      const src = state.shots[idx];
      Object.keys(copy).forEach((k) => { if (k !== '_id') copy[k] = src[k]; });
      state.shots.splice(idx + 1, 0, copy);
    } else if (act === 'up' && idx > 0) {
      [state.shots[idx - 1], state.shots[idx]] = [state.shots[idx], state.shots[idx - 1]];
    } else if (act === 'down' && idx < state.shots.length - 1) {
      [state.shots[idx + 1], state.shots[idx]] = [state.shots[idx], state.shots[idx + 1]];
    }
    renderShots();
    update();
  });

  $('#btn-add-shot').addEventListener('click', () => {
    state.shots.push(newShot());
    renderShots();
    update();
    $('#shots').lastElementChild?.querySelector('.shot__title')?.focus();
  });

  // custom field edits (delegated)
  const fields = $('#fields');
  fields.addEventListener('input', (e) => {
    const el = e.target.closest('[data-field-prop]');
    if (!el) return;
    const row = el.closest('[data-field]');
    const idx = [...fields.children].indexOf(row);
    if (idx < 0) return;
    const prop = el.dataset.fieldProp;
    if (prop === 'key') {
      const cleaned = el.value.replace(/[^\w]/g, '');
      if (cleaned !== el.value) el.value = cleaned; // tokens must be \w
    }
    state.fields[idx][prop] = el.value;
    if (prop === 'key' || prop === 'label') renderTokenbar();
    update();
  });
  fields.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-field-act="del"]');
    if (!btn) return;
    const idx = [...fields.children].indexOf(btn.closest('[data-field]'));
    if (idx < 0) return;
    state.fields.splice(idx, 1);
    renderFields();
    renderTokenbar();
    update();
  });
  $('#btn-add-field').addEventListener('click', () => {
    state.fields.push(newField());
    renderFields();
    renderTokenbar();
    update();
    $('#fields').lastElementChild?.querySelector('[data-field-prop="label"]')?.focus();
  });

  // toolbar
  $('#btn-clear').addEventListener('click', () => {
    if (confirm('Clear the form and start fresh?')) loadState(blankState());
  });
  $('#btn-save').addEventListener('click', saveToLibrary);
  $('#btn-export').addEventListener('click', exportJSON);
  const fileInput = $('#file-import');
  $('#btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    importJSONFile(e.target.files && e.target.files[0]);
    e.target.value = ''; // allow re-importing the same file
  });
  $('#btn-copy').addEventListener('click', copyPrompt);
  $('#btn-copy2').addEventListener('click', copyPrompt);
  $('#btn-download').addEventListener('click', downloadPrompt);
  $('#btn-download2').addEventListener('click', downloadPrompt);

  // presets menu (built-in starter prompts)
  const presetsMenu = $('#presets-menu');
  $('#btn-presets').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = presetsMenu.hidden;
    if (open) renderPresetsMenu();
    presetsMenu.hidden = !open;
    libMenu.hidden = true;
  });
  presetsMenu.addEventListener('click', (e) => {
    const load = e.target.closest('[data-preset]');
    if (!load) return;
    const p = PRESETS.find((x) => x.id === load.dataset.preset);
    if (p) loadState(p.build());
    presetsMenu.hidden = true;
  });

  // library menu
  const libBtn = $('#btn-library');
  const libMenu = $('#lib-menu');
  libBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = libMenu.hidden;
    if (open) renderLibMenu();
    libMenu.hidden = !open;
    presetsMenu.hidden = true;
  });
  libMenu.addEventListener('click', (e) => {
    const load = e.target.closest('[data-lib-load]');
    const del = e.target.closest('[data-lib-del]');
    const lib = getLib().sort((a, b) => b.ts - a.ts);
    if (load) {
      loadState(lib[+load.dataset.libLoad].data);
      libMenu.hidden = true;
    } else if (del) {
      const rec = lib[+del.dataset.libDel];
      const all = getLib().filter((r) => !(r.name === rec.name && r.ts === rec.ts));
      setLib(all);
      renderLibMenu();
    }
  });
  document.addEventListener('click', () => { libMenu.hidden = true; presetsMenu.hidden = true; });

  // keyboard: Ctrl/Cmd+S copies
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      copyPrompt();
    }
  });
}

/* ---------- init ---------- */
function init() {
  wire();
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch {}
  loadState(draft && draft.shots ? draft : exampleState());
}
document.addEventListener('DOMContentLoaded', init);
