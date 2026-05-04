/**
 * LocalSearch - Frontend Logic
 */

const API_BASE = '';
const CONFIG = {
    debounceTime: 200,
    pollInterval: 10000,
};

let state = {
    query: '',
    results: [],
    activeIndex: -1,
    isSettingsOpen: false,
    status: null,
    recent: JSON.parse(localStorage.getItem('ls_recent') || '[]'),
};

// --- DOM Elements ---
const searchInput = document.getElementById('search-input');
const resultsList = document.getElementById('results-list');
const recentList = document.getElementById('recent-list');
const initialView = document.getElementById('initial-view');
const settingsPanel = document.getElementById('settings-panel');
const settingsContent = document.getElementById('settings-content');
const settingsToggle = document.getElementById('settings-toggle');
const settingsClose = document.getElementById('settings-close');
const settingsOverlay = document.getElementById('settings-overlay');
const indexStats = document.getElementById('index-stats');
const reindexBtn = document.getElementById('reindex-btn');

// --- Initialization ---
function init() {
    renderRecent();
    pollStatus();
    setInterval(pollStatus, CONFIG.pollInterval);
    
    searchInput.addEventListener('input', debounce(handleSearchInput, CONFIG.debounceTime));
    searchInput.addEventListener('keydown', handleGlobalKeys);
    
    settingsToggle.addEventListener('click', toggleSettings);
    settingsClose.addEventListener('click', toggleSettings);
    settingsOverlay.addEventListener('click', toggleSettings);
    
    reindexBtn.addEventListener('click', triggerReindex);

    // Initial focus
    searchInput.focus();
}

async function pollStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        state.status = await res.json();
        updateStatusUI();
    } catch (e) {
        console.error("Status polling failed", e);
    }
}

function updateStatusUI() {
    if (state.status) {
        indexStats.textContent = `Index: ${state.status.file_count.toLocaleString()} files`;
    }
}

// --- Search Logic ---
async function handleSearchInput(e) {
    const q = e.target.value.trim();
    state.query = q;
    
    if (q.length === 0) {
        state.results = [];
        state.activeIndex = -1;
        renderResults();
        initialView.classList.remove('hidden');
        return;
    }
    
    initialView.classList.add('hidden');
    
    try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        state.results = data.results;
        state.activeIndex = -1;
        renderResults();
    } catch (e) {
        console.error("Search failed", e);
    }
}

function renderResults() {
    if (state.query === '') {
        resultsList.innerHTML = '';
        resultsList.appendChild(initialView);
        return;
    }

    if (state.results.length === 0) {
        resultsList.innerHTML = `
            <div class="flex flex-col items-center text-center mt-32">
                <div class="w-16 h-16 rounded-full border border-[#2e2e32] bg-surface-container flex items-center justify-center mb-6">
                    <span class="material-symbols-outlined text-[32px] text-gray-600">search_off</span>
                </div>
                <h2 class="text-[18px] font-semibold text-white mb-2">No matches found</h2>
                <p class="text-on-surface-variant max-w-sm">We couldn't find any results for "${state.query}"</p>
            </div>
        `;
        return;
    }

    resultsList.innerHTML = state.results.map((res, i) => `
        <div class="group relative flex flex-col p-3 gap-2 bg-[#1a1a1e] border ${state.activeIndex === i ? 'border-[#7c3aed] bg-[#2e2e32]' : 'border-[#2e2e32]'} border-l-2 ${state.activeIndex === i ? 'border-l-[#7c3aed]' : 'border-l-transparent'} rounded hover:bg-[#2e2e32] transition-all duration-100 cursor-pointer" data-index="${i}" onclick="openFile('${res.path}', '${state.query}')">
            <div class="flex items-center gap-2">
                <span class="text-outline-variant font-mono text-[10px] w-4">#${res.rank}</span>
                <span class="material-symbols-outlined text-[14px] text-secondary">${getIcon(res.extension)}</span>
                <span class="font-mono text-[11px] text-[#d2bbff] truncate">${res.path}</span>
            </div>
            <div class="pl-8 pr-12">
                <p class="font-mono text-[12px] text-on-surface-variant leading-relaxed">
                    ${res.snippet}
                </p>
            </div>
            <div class="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="px-2 py-1 bg-[#15121b] border border-[#2e2e32] rounded text-[11px] text-on-surface flex items-center gap-1 shadow-lg">
                    Open <span class="font-mono text-[10px] text-secondary">↵</span>
                </button>
            </div>
        </div>
    `).join('');
}

function renderRecent() {
    if (state.recent.length === 0) {
        recentList.innerHTML = `
            <div class="p-4 text-center text-xs text-outline-variant">No recent searches</div>
        `;
        return;
    }
    
    recentList.innerHTML = state.recent.map(r => `
        <button class="w-full h-8 px-3 flex items-center justify-between hover:bg-surface-container-high transition-colors group border-b border-[#2e2e32] last:border-0 text-left" onclick="runStoredQuery('${r.query}')">
            <div class="flex items-center gap-3 overflow-hidden">
                <span class="material-symbols-outlined text-[16px] text-outline-variant">history</span>
                <span class="font-mono text-[12px] text-on-surface truncate">${r.query}</span>
            </div>
        </button>
    `).join('');
}

function runStoredQuery(q) {
    searchInput.value = q;
    handleSearchInput({ target: { value: q } });
}

async function openFile(path, query) {
    // Add to recent
    if (query) {
        const existing = state.recent.findIndex(r => r.query === query);
        if (existing !== -1) state.recent.splice(existing, 1);
        state.recent.unshift({ query, timestamp: Date.now() });
        state.recent = state.recent.slice(0, 10);
        localStorage.setItem('ls_recent', JSON.stringify(state.recent));
        renderRecent();
    }

    try {
        await fetch(`${API_BASE}/api/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
    } catch (e) {
        console.error("Opening file failed", e);
    }
}

// --- Keyboard Navigation ---
function handleGlobalKeys(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.activeIndex = Math.min(state.activeIndex + 1, state.results.length - 1);
        renderResults();
        scrollToActive();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.activeIndex = Math.max(state.activeIndex - 1, 0);
        renderResults();
        scrollToActive();
    } else if (e.key === 'Enter') {
        if (state.activeIndex >= 0) {
            const res = state.results[state.activeIndex];
            openFile(res.path, state.query);
        }
    } else if (e.key === 'Escape') {
        searchInput.value = '';
        handleSearchInput({ target: { value: '' } });
        if (state.isSettingsOpen) toggleSettings();
    } else if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
    }
}

function scrollToActive() {
    const activeEl = resultsList.querySelector(`[data-index="${state.activeIndex}"]`);
    if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// --- UI Utilities ---
function toggleSettings() {
    state.isSettingsOpen = !state.isSettingsOpen;
    if (state.isSettingsOpen) {
        settingsPanel.classList.remove('hidden');
        setTimeout(() => settingsContent.classList.remove('translate-x-full'), 10);
    } else {
        settingsContent.classList.add('translate-x-full');
        setTimeout(() => settingsPanel.classList.add('hidden'), 300);
    }
}

function getIcon(ext) {
    const map = {
        'md': 'description',
        'txt': 'notes',
        'pdf': 'picture_as_pdf',
        'csv': 'table_chart',
        'docx': 'article',
        'rs': 'code_blocks'
    };
    return map[ext.toLowerCase()] || 'draft';
}

function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

async function triggerReindex() {
    reindexBtn.classList.add('animate-pulse', 'text-[#d2bbff]');
    try {
        await fetch(`${API_BASE}/api/index`, { method: 'POST' });
        pollStatus();
    } finally {
        reindexBtn.classList.remove('animate-pulse', 'text-[#d2bbff]');
    }
}

init();
