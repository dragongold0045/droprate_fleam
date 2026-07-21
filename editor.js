'use strict';

/* =========================================================
   Data — RarityId 0-17 and their florr.io colors
   ========================================================= */
const RARITIES = [
  { id: 0,  name: 'Common',      hex1: 0x7eef6d, hex2: 0x66c258 },
  { id: 1,  name: 'Unusual',     hex1: 0xffe65d, hex2: 0xcfba4b },
  { id: 2,  name: 'Rare',        hex1: 0x4d52e3, hex2: 0x3e42b8 },
  { id: 3,  name: 'Epic',        hex1: 0x861fde, hex2: 0x6d19b4 },
  { id: 4,  name: 'Legendary',   hex1: 0xde1f1f, hex2: 0xb41919 },
  { id: 5,  name: 'Mythic',      hex1: 0x1fdbde, hex2: 0x19b1b4 },
  { id: 6,  name: 'Ultra',       hex1: 0xff2b75, hex2: 0xcf235f },
  { id: 7,  name: 'Super',       hex1: 0x2bffa3, hex2: 0x23cf84 },
  { id: 8,  name: 'Unique',      hex1: 0x555555, hex2: 0x454545 },
  { id: 9,  name: 'Hyper',       hex1: 0xff9933, hex2: 0xff8000 },
  { id: 10, name: 'Omega',       hex1: 0x6000cc, hex2: 0x4c0099 },
  { id: 11, name: 'Celestial',   hex1: 0x2e4fbf, hex2: 0x1739a9 },
  { id: 12, name: 'Ascended',    hex1: 0x9ef0ff, hex2: 0x79d9ec },
  { id: 13, name: 'Cataclysmic', hex1: 0xd83dff, hex2: 0xbe2be2 },
  { id: 14, name: 'Exalted',     hex1: 0x9999ff, hex2: 0x6666ff },
  { id: 15, name: 'Ethereal',    hex1: 0x009999, hex2: 0x006666 },
  { id: 16, name: 'Eternal',     hex1: 0xffffff, hex2: 0xcccccc },
  { id: 17, name: 'Ultimate',    hex1: 0xff7777, hex2: 0xf25e5e },
];
const RARITY_BY_ID = new Map(RARITIES.map(r => [r.id, r]));

/* =========================================================
   State
   tables[sourceRarityId] = { [petalRarityId]: percent (0-100) }
   A key's mere presence means that petal field has been "created"
   for that panel — it stays visible (even at 0%) until removed.
   ========================================================= */
const state = {
  dropName: 'dropchance',
  tables: {},
};

/* =========================================================
   DOM refs
   ========================================================= */
const dom = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  dropNameInput: document.getElementById('dropNameInput'),
  newRaritySelect: document.getElementById('newRaritySelect'),
  addRarityBtn: document.getElementById('addRarityBtn'),
  importBtn: document.getElementById('importBtn'),
  importFileInput: document.getElementById('importFileInput'),
  previewBtn: document.getElementById('previewBtn'),
  exportBtn: document.getElementById('exportBtn'),
  chain: document.getElementById('rarityChain'),
  emptyState: document.getElementById('emptyState'),
  chainLabel: document.getElementById('chainLabel'),
  toastContainer: document.getElementById('toastContainer'),
  jsonPreviewDialog: document.getElementById('jsonPreviewDialog'),
  closeJsonDialogBtn: document.getElementById('closeJsonDialogBtn'),
  fieldKeyModeCheckbox: document.getElementById('fieldKeyModeCheckbox'),
  jsonPreviewCode: document.getElementById('jsonPreviewCode'),
  copyJsonBtn: document.getElementById('copyJsonBtn'),
  downloadJsonFromDialogBtn: document.getElementById('downloadJsonFromDialogBtn'),
};

/* =========================================================
   Theme (dark / light)
   ========================================================= */
const THEME_STORAGE_KEY = 'dropchance-editor-theme';

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyThemeUI(theme) {
  dom.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  dom.themeToggleBtn.setAttribute('aria-label', label);
  dom.themeToggleBtn.title = label;
}

function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (err) { /* ignore */ }
  applyThemeUI(next);
}

/* =========================================================
   Small helpers
   ========================================================= */
function toCssHex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}
function idealTextColor(hex) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#14171f' : '#ffffff';
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function formatNum(n) {
  n = round2(n);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
function usedIds() {
  return new Set(Object.keys(state.tables).map(Number));
}
function panelTotal(table) {
  return round2(Object.values(table).reduce((a, b) => a + b, 0));
}
function sanitizeFileName(name) {
  const trimmed = (name || '').trim();
  const base = trimmed ? trimmed.replace(/[^a-zA-Z0-9_\-]+/g, '_') : 'dropchance';
  return base.replace(/^_+|_+$/g, '') || 'dropchance';
}
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* =========================================================
   Toasts
   ========================================================= */
function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

/* =========================================================
   Clipboard (with a legacy fallback for non-secure contexts)
   ========================================================= */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) { /* fall through to legacy fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    return false;
  }
}

/* =========================================================
   JSON syntax highlighting (for the preview dialog)
   ========================================================= */
function syntaxHighlightJSON(jsonString) {
  const escaped = escapeHtml(jsonString);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/* =========================================================
   "New droprate" select — used rarities disappear from it
   ========================================================= */
function renderSelect() {
  const used = usedIds();
  const available = RARITIES.filter(r => !used.has(r.id));
  dom.newRaritySelect.innerHTML = '';

  if (available.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'All rarities used';
    dom.newRaritySelect.appendChild(opt);
    dom.newRaritySelect.disabled = true;
    dom.addRarityBtn.disabled = true;
    return;
  }

  dom.newRaritySelect.disabled = false;
  dom.addRarityBtn.disabled = false;
  available.forEach(r => {
    const opt = document.createElement('option');
    opt.value = String(r.id);
    opt.textContent = `${r.id} — ${r.name}`;
    dom.newRaritySelect.appendChild(opt);
  });
}

/* =========================================================
   Chain / panel rendering
   ========================================================= */
function buildDistBarHTML(table) {
  return RARITIES
    .filter(p => table[p.id] > 0)
    .map(p => `<div class="dist-seg" title="${p.name}: ${formatNum(table[p.id])}%" style="width:${table[p.id]}%;background:linear-gradient(135deg, ${toCssHex(p.hex1)}, ${toCssHex(p.hex2)})"></div>`)
    .join('');
}

function buildStatsTextHTML(table) {
  const total = panelTotal(table);
  const remaining = Math.max(0, round2(100 - total));
  const html = `<span>Total: <b class="total-val">${formatNum(total)}%</b></span><span>Remaining: <b>${formatNum(remaining)}%</b></span>`;
  return { html, total };
}

function buildPanelHeaderHTML(r, table) {
  const { html: statsHTML, total } = buildStatsTextHTML(table);
  const badgeTextColor = idealTextColor(r.hex1);
  return `
    <div class="panel-header">
      <div class="panel-title">
        <span class="panel-badge" style="color:${badgeTextColor}">ID ${r.id}</span>
        <h3>${r.name}</h3>
      </div>
      <div class="panel-stats">
        <div class="dist-bar" data-role="dist-bar">${buildDistBarHTML(table)}</div>
        <div class="stats-text${total >= 100 ? ' full' : ''}" data-role="stats-text">${statsHTML}</div>
      </div>
      <div class="panel-actions">
        <button type="button" class="icon-btn collapse-btn" data-action="collapse" aria-label="Collapse / expand" title="Collapse / expand">▾</button>
        <button type="button" class="icon-btn delete-btn" data-action="delete-panel" aria-label="Delete this droprate" title="Delete this droprate">✕</button>
      </div>
    </div>`;
}

function buildFieldRowHTML(petal, val) {
  return `
    <div class="field-row" data-petal="${petal.id}">
      <span class="field-dot" style="background:linear-gradient(135deg, ${toCssHex(petal.hex1)}, ${toCssHex(petal.hex2)})"></span>
      <span class="field-name">${petal.name}</span>
      <span class="field-input-wrap">
        <input type="number" class="field-input" min="0" max="100" step="0.01"
               placeholder="0" data-petal="${petal.id}" aria-label="${petal.name} drop chance percent"
               value="${val === 0 ? '' : val}" />
        <span class="pct-sign">%</span>
      </span>
      <button type="button" class="field-remove-btn" data-action="remove-field" data-petal="${petal.id}" aria-label="Remove ${petal.name} field" title="Remove field">×</button>
    </div>`;
}

function buildAddFieldRowHTML(sourceId) {
  const table = state.tables[sourceId] || {};
  const createdIds = new Set(Object.keys(table).map(Number));
  const available = RARITIES.filter(p => !createdIds.has(p.id));
  if (available.length === 0) {
    return `<div class="add-field-row"><span class="add-field-empty">All petal fields added</span></div>`;
  }
  const options = available.map(p => `<option value="${p.id}">${p.id} — ${p.name}</option>`).join('');
  return `
    <div class="add-field-row">
      <select class="add-field-select" aria-label="Choose a petal rarity to add">${options}</select>
      <button type="button" class="btn btn-ghost btn-small" data-action="add-field">+ Add Field</button>
    </div>`;
}

function buildFieldsGridHTML(sourceId) {
  const table = state.tables[sourceId] || {};
  const createdIds = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (createdIds.length === 0) {
    return `<p class="fields-empty">No petal fields yet — add one above.</p>`;
  }
  const rows = createdIds.map(id => buildFieldRowHTML(RARITY_BY_ID.get(id), table[id])).join('');
  return `<div class="fields-grid">${rows}</div>`;
}

function buildNodeHTML(sourceId) {
  const r = RARITY_BY_ID.get(sourceId);
  const table = state.tables[sourceId] || {};
  const c1 = toCssHex(r.hex1), c2 = toCssHex(r.hex2);
  return `
    <div class="chain-node" data-id="${r.id}" style="--c1:${c1};--c2:${c2}">
      <div class="chain-gutter"><span class="chain-dot"></span></div>
      <div class="panel" data-panel-id="${r.id}">
        ${buildPanelHeaderHTML(r, table)}
        <div class="panel-body">
          ${buildAddFieldRowHTML(sourceId)}
          ${buildFieldsGridHTML(sourceId)}
        </div>
      </div>
    </div>`;
}

function renderChain() {
  const ids = Object.keys(state.tables).map(Number).sort((a, b) => b - a); // high -> low
  const hasPanels = ids.length > 0;
  dom.emptyState.classList.toggle('hidden', hasPanels);
  dom.chainLabel.classList.toggle('hidden', !hasPanels);
  dom.chain.innerHTML = ids.map(id => buildNodeHTML(id)).join('');
  dom.exportBtn.disabled = !hasPanels;
  dom.previewBtn.disabled = !hasPanels;
}

function updatePanelVisual(sourceId) {
  const nodeEl = dom.chain.querySelector(`.chain-node[data-id="${sourceId}"]`);
  if (!nodeEl) return;
  const table = state.tables[sourceId] || {};
  nodeEl.querySelector('[data-role="dist-bar"]').innerHTML = buildDistBarHTML(table);
  const { html: statsHTML, total } = buildStatsTextHTML(table);
  const statsEl = nodeEl.querySelector('[data-role="stats-text"]');
  statsEl.innerHTML = statsHTML;
  statsEl.classList.toggle('full', total >= 100);
}

function renderPanelFields(sourceId) {
  const panelEl = dom.chain.querySelector(`.panel[data-panel-id="${sourceId}"]`);
  if (!panelEl) return;
  const body = panelEl.querySelector('.panel-body');
  body.innerHTML = buildAddFieldRowHTML(sourceId) + buildFieldsGridHTML(sourceId);
}

/* =========================================================
   Field input (percent) handling — never lets a panel exceed 100%
   ========================================================= */
function clampValue(sourceId, petalId, rawVal) {
  const table = state.tables[sourceId];
  const val = isNaN(rawVal) ? 0 : Math.max(0, rawVal);
  const currentForThis = table[petalId] || 0;
  const othersSum = round2(panelTotal(table) - currentForThis);
  const maxAllowed = Math.max(0, round2(100 - othersSum));
  return round2(Math.min(val, maxAllowed));
}

function handleFieldInput(e) {
  const input = e.target;
  if (!input.classList || !input.classList.contains('field-input')) return;
  const nodeEl = input.closest('.chain-node');
  const sourceId = Number(nodeEl.dataset.id);
  const petalId = Number(input.dataset.petal);
  const raw = input.value === '' ? 0 : parseFloat(input.value);

  const table = state.tables[sourceId];
  const clamped = clampValue(sourceId, petalId, raw);
  const wasClamped = input.value !== '' && Math.abs(clamped - raw) > 0.001;

  table[petalId] = clamped; // field stays "created" even at 0% until explicitly removed

  if (wasClamped) {
    input.value = clamped === 0 ? '' : clamped;
    flashInput(input);
  }

  updatePanelVisual(sourceId);
}

function handleFieldFocus(e) {
  const input = e.target;
  if (input.classList && input.classList.contains('field-input')) {
    input.select();
  }
}

function flashInput(input) {
  input.classList.remove('flash');
  void input.offsetWidth; // restart the animation
  input.classList.add('flash');
}

/* =========================================================
   Panel / field actions — collapse, delete panel, add/remove field
   ========================================================= */
function handleChainClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const nodeEl = btn.closest('.chain-node');
  const sourceId = Number(nodeEl.dataset.id);
  const action = btn.dataset.action;

  if (action === 'collapse') {
    nodeEl.querySelector('.panel').classList.toggle('collapsed');
  } else if (action === 'delete-panel') {
    delete state.tables[sourceId];
    renderChain();
    renderSelect();
  } else if (action === 'add-field') {
    const row = btn.closest('.add-field-row');
    const select = row ? row.querySelector('.add-field-select') : null;
    if (!select) return;
    const petalId = Number(select.value);
    if (Number.isNaN(petalId)) return;
    state.tables[sourceId][petalId] = 0;
    renderPanelFields(sourceId);
    updatePanelVisual(sourceId);
  } else if (action === 'remove-field') {
    const petalId = Number(btn.dataset.petal);
    delete state.tables[sourceId][petalId];
    renderPanelFields(sourceId);
    updatePanelVisual(sourceId);
  }
}

/* =========================================================
   Add new rarity — it then disappears from the picker
   ========================================================= */
function handleAddRarity() {
  const id = Number(dom.newRaritySelect.value);
  if (Number.isNaN(id) || state.tables[id]) return;
  state.tables[id] = {};
  renderChain();
  renderSelect();
  const nodeEl = dom.chain.querySelector(`.chain-node[data-id="${id}"]`);
  if (nodeEl && typeof nodeEl.scrollIntoView === 'function') {
    nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* =========================================================
   Export
   ========================================================= */
function buildExportObject() {
  const useNames = dom.fieldKeyModeCheckbox.checked;
  const out = {};
  Object.keys(state.tables)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach(sourceId => {
      const table = state.tables[sourceId];
      const fields = {};
      Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach(petalId => {
          const v = table[petalId];
          if (v && v > 0) {
            const p = RARITY_BY_ID.get(petalId);
            const key = useNames ? p.name : petalId;
            fields[key] = Math.round((v / 100) * 10000) / 10000;
          }
        });
      out[sourceId] = fields;
    });
  return out;
}

function downloadJSON(filename, data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleExport() {
  if (Object.keys(state.tables).length === 0) return;
  const obj = buildExportObject();
  const filename = sanitizeFileName(state.dropName) + '.json';
  downloadJSON(filename, obj);
  showToast('Downloaded ' + filename, 'success');
}

/* =========================================================
   JSON preview dialog
   ========================================================= */
function refreshJsonPreview() {
  const obj = buildExportObject();
  const json = JSON.stringify(obj, null, 2);
  dom.jsonPreviewCode.innerHTML = syntaxHighlightJSON(json);
}

function openJsonPreview() {
  if (Object.keys(state.tables).length === 0) return;
  refreshJsonPreview();
  dom.jsonPreviewDialog.showModal();
}

/* =========================================================
   Import
   ========================================================= */
function parseImportedData(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('expected a JSON object at the top level');
  }
  const nameToId = new Map(RARITIES.map(r => [r.name.toLowerCase(), r.id]));
  const tables = {};

  Object.keys(obj).forEach(sourceKey => {
    const sourceId = Number(sourceKey);
    if (!Number.isInteger(sourceId) || !RARITY_BY_ID.has(sourceId)) return;
    const fieldsObj = obj[sourceKey];
    if (!fieldsObj || typeof fieldsObj !== 'object' || Array.isArray(fieldsObj)) return;

    const table = {};
    Object.keys(fieldsObj).forEach(fieldKey => {
      let petalId = Number(fieldKey);
      if (!Number.isInteger(petalId) || !RARITY_BY_ID.has(petalId)) {
        const matched = nameToId.get(String(fieldKey).trim().toLowerCase());
        if (matched === undefined) return;
        petalId = matched;
      }
      const num = Number(fieldsObj[fieldKey]);
      if (!Number.isFinite(num) || num <= 0) return;
      table[petalId] = round2(Math.min(100, num * 100));
    });

    const sum = panelTotal(table);
    if (sum > 100) {
      const scale = 100 / sum;
      Object.keys(table).forEach(k => { table[k] = round2(table[k] * scale); });
    }
    tables[sourceId] = table;
  });

  return tables;
}

async function handleImportFile(file) {
  let text;
  try {
    text = await file.text();
  } catch (err) {
    showToast('Could not read the file.', 'error');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    showToast('Not a valid JSON file.', 'error');
    return;
  }

  let tables;
  try {
    tables = parseImportedData(parsed);
  } catch (err) {
    showToast('Unexpected JSON structure: ' + (err && err.message ? err.message : 'invalid data'), 'error');
    return;
  }

  const count = Object.keys(tables).length;
  if (count === 0) {
    showToast('No valid rarity data found in this file.', 'error');
    return;
  }

  const hasExisting = Object.keys(state.tables).length > 0;
  if (hasExisting && !window.confirm('Importing will replace your current droprates. Continue?')) {
    return;
  }

  state.tables = tables;
  const derivedName = file.name.replace(/\.json$/i, '');
  if (derivedName) {
    state.dropName = derivedName;
    dom.dropNameInput.value = derivedName;
  }
  renderChain();
  renderSelect();
  showToast('Imported ' + count + ' droprate' + (count === 1 ? '' : 's') + '.', 'success');
}

/* =========================================================
   Init
   ========================================================= */
function init() {
  applyThemeUI(getCurrentTheme());
  dom.themeToggleBtn.addEventListener('click', toggleTheme);

  renderSelect();
  renderChain();

  dom.dropNameInput.addEventListener('input', () => {
    state.dropName = dom.dropNameInput.value;
  });
  dom.addRarityBtn.addEventListener('click', handleAddRarity);

  dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
  dom.importFileInput.addEventListener('change', () => {
    const file = dom.importFileInput.files && dom.importFileInput.files[0];
    dom.importFileInput.value = '';
    if (file) handleImportFile(file);
  });

  dom.previewBtn.addEventListener('click', openJsonPreview);
  dom.closeJsonDialogBtn.addEventListener('click', () => dom.jsonPreviewDialog.close());
  dom.jsonPreviewDialog.addEventListener('click', (e) => {
    if (e.target === dom.jsonPreviewDialog) dom.jsonPreviewDialog.close();
  });
  dom.fieldKeyModeCheckbox.addEventListener('change', () => {
    if (dom.jsonPreviewDialog.open) refreshJsonPreview();
  });
  dom.copyJsonBtn.addEventListener('click', async () => {
    const obj = buildExportObject();
    const json = JSON.stringify(obj, null, 2);
    const ok = await copyToClipboard(json);
    showToast(ok ? 'Copied to clipboard!' : 'Copy failed — please copy manually.', ok ? 'success' : 'error');
  });
  dom.downloadJsonFromDialogBtn.addEventListener('click', handleExport);

  dom.exportBtn.addEventListener('click', handleExport);

  dom.chain.addEventListener('input', handleFieldInput);
  dom.chain.addEventListener('click', handleChainClick);
  dom.chain.addEventListener('focus', handleFieldFocus, true);
}

init();