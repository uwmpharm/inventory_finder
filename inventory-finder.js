/* inventory-finder.js */
/* Requires @supabase/supabase-js v2 loaded before this script */

const SUPABASE_URL = 'https://iynuqsbgnshlromwkzfl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bnVxc2JnbnNobHJvbXdremZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDQ5NzcsImV4cCI6MjA5MTA4MDk3N30.SGvfrCXQbgbZk_ptt97R3sYGetFdB6KfRmJvoF1LpGI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const SITE_SYSTEM_MAP = {
  'HMC-MAIN':  'HMC-PYXIS',
  'UWMC-MAIN': 'UWMC-PYXIS',
  'NWH-MAIN':  'NWH-PYXIS',
};
const SITE_LABELS = {
  'HMC-MAIN':  'Harborview (HMC-MAIN)',
  'UWMC-MAIN': 'Montlake (UWMC-MAIN)',
  'NWH-MAIN':  'Northwest (NWH-MAIN)',
};

let currentSite      = null;
let searchTimeout    = null;
let selectedGateOption = null;

/* ─────────────────────────────────────────────
   DEBUG
───────────────────────────────────────────── */
const debugLines = [];

function debugLog(label, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  debugLines.unshift(`[${ts}] ${label}: ${String(msg).slice(0, 400)}`);
  if (debugLines.length > 80) debugLines.pop();
  const panel = document.getElementById('debug-panel');
  if (panel) panel.textContent = debugLines.join('\n');
}

function toggleDebug() {
  const wrap = document.getElementById('debug-wrap');
  if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}

/* ─────────────────────────────────────────────
   GATE
───────────────────────────────────────────── */
function selectSite(el) {
  document.querySelectorAll('.gate-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedGateOption = el;
  document.getElementById('gate-btn').disabled = false;
}

function confirmSite() {
  if (!selectedGateOption) return;
  applySite(selectedGateOption.dataset.site);
  document.getElementById('gate-overlay').style.display = 'none';
}

function applySite(site) {
  currentSite = site;
  sessionStorage.setItem('inv_site', site);
  document.getElementById('site-badge').style.display = 'inline-flex';
  document.getElementById('site-badge-text').textContent = SITE_LABELS[site];
  document.getElementById('header-site').value = site;
  const q = document.getElementById('search-input').value.trim();
  if (q.length >= 2) performSearch(q);
}

function changeSiteFromHeader(site) {
  if (!site) return;
  currentSite = site;
  sessionStorage.setItem('inv_site', site);
  document.getElementById('site-badge').style.display = 'inline-flex';
  document.getElementById('site-badge-text').textContent = SITE_LABELS[site];
  document.getElementById('gate-overlay').style.display = 'none';
  const q = document.getElementById('search-input').value.trim();
  if (q.length >= 2) performSearch(q);
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('inv_site');
  if (saved && SITE_SYSTEM_MAP[saved]) {
    const opt = document.querySelector(`.gate-option[data-site="${saved}"]`);
    if (opt) selectSite(opt);
  }
});

/* ─────────────────────────────────────────────
   SEARCH INPUT
───────────────────────────────────────────── */
function onSearchInput(val) {
  document.getElementById('search-clear').classList.toggle('visible', val.length > 0);
  clearTimeout(searchTimeout);
  if (val.trim().length < 2) { showIdle(); return; }
  searchTimeout = setTimeout(() => performSearch(val.trim()), 200);
}

function clearSearch() {
  const inp = document.getElementById('search-input');
  inp.value = '';
  document.getElementById('search-clear').classList.remove('visible');
  showIdle();
  inp.focus();
}

function showIdle() {
  document.getElementById('results-area').innerHTML = `
    <div class="idle-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--uw-purple)"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <p>Enter a drug name, item number, or Pyxis ID to find its location</p>
    </div>`;
}

/* ─────────────────────────────────────────────
   FUZZY WATERFALL SEARCH
───────────────────────────────────────────── */
async function performSearch(query) {
  if (!currentSite) return;
  const area = document.getElementById('results-area');
  area.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Searching inventory…</p></div>';
  
  debugLog('SEARCH-START', `"${query}" @ "${currentSite}" (Length: ${currentSite.length})`);

  try {
    // Fire the specialized PostgreSQL fuzzy routine
    const { data, error } = await sb.rpc('fuzzy_search_inventory', {
      search_text: query,
      site_filter: currentSite
    });

    if (error) throw new Error(`Database Error: ${error.message}`);
    
    debugLog('DB-RESPONSE-ROWS', data ? data.length : 0);
    
    const results = (data || []).map(row => ({
      source: row.location_type ? row.location_type.toLowerCase() : 'inventory',
      item: row.item,
      item_description: row.item_description,
      package_code: row.uom || '',
      location: row.location || row.actual_location,
      type_description: row.location_type || 'Inventory',
      pyxis_id: row.pyxis_id || null
    }));

    renderResults(results, query);

  } catch (err) {
    debugLog('ERROR', err.message);
    area.innerHTML = `
      <div class="error-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8"  x2="12"    y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <strong>Query failed.</strong> ${escHtml(err.message)}
          <br>
          <button class="debug-toggle-btn" onclick="toggleDebug()" style="margin-top:6px;">
            Show debug log
          </button>
        </div>
      </div>
      <div id="debug-wrap" class="debug-wrap">
        <pre id="debug-panel" class="debug-panel"></pre>
      </div>`;
    setTimeout(() => {
      const p = document.getElementById('debug-panel');
      if (p) p.textContent = debugLines.join('\n');
    }, 0);
  }
}

/* ─────────────────────────────────────────────
   RENDER WITH DEDUPLICATION & SORTING
───────────────────────────────────────────── */
function badgeFor(typeDesc, source) {
  const t = (typeDesc || '').toLowerCase();
  if (t.includes('forward pick')) return ['Forward Pick',  'badge-fp'];
  if (t.includes('first in') || t.includes('fifo')) return ['FIFO', 'badge-fifo'];
  if (t.includes('home')) return ['Home Location', 'badge-home'];
  return [typeDesc || 'Inventory', 'badge-fifo'];
}

function renderResults(results, query) {
  const area = document.getElementById('results-area');

  if (results.length === 0) {
    area.innerHTML = `
      <div class="empty-state">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--uw-purple)"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="8"  y1="11" x2="14"    y2="11"/>
        </svg>
        <h3>No results found for "${escHtml(query)}"</h3>
        <p>No inventory records match this search at ${SITE_LABELS[currentSite]}.</p>
      </div>`;
    return;
  }

  // 1. Group by unique item number and wipe out layout duplicate rows
  const groups = new Map();
  let totalLocationsCount = 0;

  for (const r of results) {
    if (!r || !r.item) continue;

    if (!groups.has(r.item)) {
      groups.set(r.item, {
        item:              r.item,
        item_description:  r.item_description,
        package_code:      r.package_code,
        pyxis_id:          r.pyxis_id,
        rows:              [],
        seenLocations:     new Set() // Isolates safety duplicates per record frame
      });
    }

    const g = groups.get(r.item);
    const locKey = (r.location || '—').trim().toUpperCase();

    // DEDUPLICATION: Process location assignment only once per item structure
    if (!g.seenLocations.has(locKey)) {
      g.seenLocations.add(locKey);
      
      if (!g.item_description && r.item_description) g.item_description = r.item_description;
      if (!g.package_code     && r.package_code)     g.package_code     = r.package_code;
      if (!g.pyxis_id         && r.pyxis_id)         g.pyxis_id         = r.pyxis_id;
      
      g.rows.push(r);
      totalLocationsCount++;
    }
  }

  // 2. Sort rows natively: Forward Pick / Home first, then alphanumeric sequence
  for (const g of groups.values()) {
    g.rows.sort((a, b) => {
      const aType = (a.type_description || '').toLowerCase();
      const bType = (b.type_description || '').toLowerCase();
      
      const aIsFP = aType.includes('forward pick') || aType.includes('home') || a.source === 'location';
      const bIsFP = bType.includes('forward pick') || bType.includes('home') || b.source === 'location';

      // Constraint 1: Float Forward Pick environments above baseline FIFO
      if (aIsFP && !bIsFP) return -1;
      if (!aIsFP && bIsFP) return 1;

      // Constraint 2: Fallback to structured natural alphabetical sorting
      const aLoc = (a.location || '—').trim();
      const bLoc = (b.location || '—').trim();
      return aLoc.localeCompare(bLoc, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  const totalItems = groups.size;

  // 3. Render Template Structure
  const cards = [...groups.values()].map(g => {
    const pyxis = g.pyxis_id      || '';
    const pkg   = g.package_code  || '';
    const desc  = g.item_description || g.item;

    const locationRows = g.rows.map(r => {
      const [badgeLabel, badgeClass] = badgeFor(r.type_description, r.source);
      return `
        <tr class="loc-row">
          <td class="loc-cell loc-cell--location">
            <span class="location-value">${escHtml(r.location || '—')}</span>
          </td>
          <td class="loc-cell loc-cell--type">
            <span class="result-type-badge ${badgeClass}">${escHtml(badgeLabel)}</span>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="result-card">
        <div class="result-card-header">
          <div class="result-title">
            <div class="result-item-desc">${escHtml(desc)}</div>
            <div class="result-item-meta">
              <span class="result-item-num">Item #: ${escHtml(g.item)}</span>
              ${pkg ? `<span class="result-item-pkg">UOM: ${escHtml(pkg)}</span>` : ''}
            </div>
          </div>
          <div class="result-pyxis-block">
            <div class="result-pyxis-label">Pyxis ID</div>
            <div class="result-pyxis-value ${pyxis ? 'has-value' : 'no-value'}">
              ${pyxis ? escHtml(pyxis) : 'Not mapped'}
            </div>
          </div>
        </div>
        <table class="loc-table">
          <thead>
            <tr>
              <th class="loc-th">Location</th>
              <th class="loc-th">Type</th>
            </tr>
          </thead>
          <tbody>
            ${locationRows}
          </tbody>
        </table>
      </div>`;
  }).join('');

  area.innerHTML = `
    <div class="results-header">
      <span class="results-count">
        <strong>${totalItems}</strong> item${totalItems !== 1 ? 's' : ''}
        &nbsp;&middot;&nbsp;
        <strong>${totalLocationsCount}</strong> unique location${totalLocationsCount !== 1 ? 's' : ''}
        &nbsp;for "${escHtml(query)}"
      </span>
      <button class="debug-toggle-btn" onclick="toggleDebug()">Debug log</button>
    </div>
    <div id="debug-wrap" class="debug-wrap">
      <pre id="debug-panel" class="debug-panel">${debugLines.join('\n')}</pre>
    </div>
    ${cards}`;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}
