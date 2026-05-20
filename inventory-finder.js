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
        <path d="M3 9l9-7 9 7
