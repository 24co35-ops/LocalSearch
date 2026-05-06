/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import SearchBar from './components/SearchBar';
import ResultCard from './components/ResultCard';
import Sidebar from './components/Sidebar';
import PreviewModal from './components/PreviewModal';
import SettingsModal from './components/SettingsModal';
import CreateFileModal from './components/CreateFileModal';
import Toast from './components/Toast';

interface SearchResult {
  rank: number;
  path: string;
  extension: string;
  score: number;
  snippet: string;
  modified_at: string;
  size?: number | string;
}

interface IndexStatus {
  file_count: number;
  index_size_mb: number;
  last_indexed: string;
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<IndexStatus>({ file_count: 0, index_size_mb: 0, last_indexed: '--:--:--' });
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string; language?: string; line_count?: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateFile, setShowCreateFile] = useState(false);
  const [extensionFilter, setExtensionFilter] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [sortBy, setSortBy] = useState('relevance');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchConfig = async () => {
    try { const r = await fetch('/api/config'); if (r.ok) setConfig(await r.json()); } catch {}
  };
  const fetchHistory = async () => {
    try { const r = await fetch('/api/search-history'); if (r.ok) { const d = await r.json(); setSearchHistory(d.history || []); } } catch {}
  };
  const fetchStatus = async () => {
    try { const r = await fetch('/api/status'); if (r.ok) setStatus(await r.json()); } catch {}
  };

  const openExternal = async (path: string) => {
    try { await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }); } catch {}
  };

  const saveFile = async (filePath: string, content: string) => {
    try {
      const r = await fetch('/api/save', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath, content }) });
      if (r.ok) { setPreviewFile({ ...previewFile!, content }); showToast('success', 'File saved!'); }
    } catch { showToast('error', 'Save failed'); }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setIsUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: formData });
      if (r.ok) { showToast('success', `Uploaded ${files.length} file(s)`); fetchStatus(); doSearch(query, extensionFilter, sortBy); }
      else showToast('error', 'Upload failed');
    } catch { showToast('error', 'Upload error'); }
    finally { setIsUploading(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: formData });
      if (r.ok) { showToast('success', `Uploaded ${files.length} file(s)`); fetchStatus(); doSearch(query, extensionFilter, sortBy); }
      else showToast('error', 'Upload failed');
    } catch { showToast('error', 'Upload error'); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  useEffect(() => {
    fetchStatus(); fetchConfig(); fetchHistory(); doSearch('', '', 'relevance');
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const doSearch = async (val: string, ext: string, sort: string) => {
    setIsSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(val)}&ext=${ext}&sort=${sort}&limit=50`);
      if (r.ok) { const d = await r.json(); setResults(d.results || []); setSearchTime(d.query_time_ms ?? 0); }
    } catch {} finally { setIsSearching(false); setSelectedIndex(-1); }
  };

  const handleSearch = (val: string, ext?: string) => {
    const e = ext !== undefined ? ext : extensionFilter;
    setQuery(val); if (ext !== undefined) setExtensionFilter(e);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, e, sortBy), 150);
  };

  const handleSortChange = (sort: string) => {
    setSortBy(sort);
    doSearch(query, extensionFilter, sort);
  };

  const previewDocument = async (path: string) => {
    try {
      const r = await fetch(`/api/read?path=${encodeURIComponent(path)}`);
      if (r.ok) { const d = await r.json(); setPreviewFile({ path, content: d.content, language: d.language, line_count: d.line_count }); }
    } catch { showToast('error', 'Could not load file'); }
  };

  const deleteFile = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    try {
      const r = await fetch(`/api/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      if (r.ok) { showToast('info', 'File deleted'); setTimeout(() => { doSearch(query, extensionFilter, sortBy); fetchStatus(); }, 300); }
    } catch { showToast('error', 'Delete failed'); }
  };

  const forceReindex = async () => {
    try { const r = await fetch('/api/index', { method: 'POST' }); if (r.ok) { showToast('info', 'Re-indexing started'); fetchStatus(); doSearch(query, extensionFilter, sortBy); } } catch {}
  };

  const cleanDupes = async () => {
    try { const r = await fetch('/api/clean-duplicates', { method: 'POST' }); const d = await r.json(); showToast('success', d.message); fetchStatus(); doSearch(query, extensionFilter, sortBy); } catch {}
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (previewFile) setPreviewFile(null); if (showSettings) setShowSettings(false); if (showCreateFile) setShowCreateFile(false); }
      if (e.key === 'ArrowDown' && results.length > 0) { e.preventDefault(); setSelectedIndex(p => Math.min(p + 1, results.length - 1)); }
      if (e.key === 'ArrowUp' && results.length > 0) { e.preventDefault(); setSelectedIndex(p => Math.max(p - 1, 0)); }
      if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) { e.preventDefault(); previewDocument(results[selectedIndex].path); }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [previewFile, showSettings, showCreateFile, results, selectedIndex]);

  const filterExts = ['', 'md', 'txt', 'csv', 'json', 'ts', 'tsx', 'js', 'py', 'html', 'css', 'rs', 'go'];

  return (
    <div className="h-screen flex bg-[#0A0A0B] text-[#E4E4E7] font-sans selection:bg-blue-500/30"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Toast */}
      <AnimatePresence>{toast && <Toast type={toast.type} message={toast.msg} />}</AnimatePresence>

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <div className="fixed inset-0 z-[200] bg-blue-600/5 backdrop-blur-sm border-2 border-dashed border-blue-500/30 flex items-center justify-center pointer-events-none rounded-3xl m-4">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-blue-400 mb-3 block">cloud_upload</span>
              <p className="text-lg font-medium text-blue-300">Drop files to upload</p>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />

      {/* Sidebar */}
      <Sidebar
        onPreview={previewDocument}
        onCreateFile={() => setShowCreateFile(true)}
        onUpload={() => fileInputRef.current?.click()}
        onReindex={forceReindex}
        status={status}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 border-b border-[#1A1A1D] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-lg logo-glow">LS</div>
            <div>
              <span className="text-base font-semibold tracking-tight">LocalSearch</span>
              <span className="text-[10px] text-[#3F3F46] ml-2 font-mono">v2.0</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2 text-[#3F3F46]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              <span className="text-[11px] font-medium">Watching</span>
            </div>
            <div className="w-px h-4 bg-[#1A1A1D]"></div>
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all cursor-pointer flex items-center gap-2 text-xs font-medium"
              disabled={isUploading}>
              <span className="material-symbols-outlined text-sm">{isUploading ? 'sync' : 'upload'}</span>
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
            <button onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-lg bg-[#111114] border border-[#1A1A1D] flex items-center justify-center text-[#52525B] hover:text-white hover:border-[#2A2A2E] transition-all cursor-pointer">
              <span className="material-symbols-outlined text-base">settings</span>
            </button>
          </div>
        </header>

        {/* Search Area */}
        <main className="flex-1 overflow-hidden flex flex-col items-center pt-8 px-8 mesh-bg">
          <div className="w-full max-w-3xl flex flex-col h-full relative z-10">
            {/* Search Bar */}
            <div className="mb-6 shrink-0">
              <SearchBar query={query} onSearch={handleSearch} searchHistory={searchHistory} onFetchHistory={fetchHistory} />
            </div>

            {/* Filters & Sort */}
            <div className="flex items-center justify-between gap-4 mb-5 shrink-0">
              <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar flex-1">
                {filterExts.map((ext) => (
                  <button key={ext} onClick={() => handleSearch(query, ext)}
                    className={`px-3 py-1.5 text-[11px] rounded-lg border transition-all whitespace-nowrap cursor-pointer font-medium ${
                      extensionFilter === ext
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-500/50 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-[#111114] border-[#1A1A1D] text-[#3F3F46] hover:border-[#2A2A2E] hover:text-[#71717A]'
                    }`}>
                    {ext === '' ? 'All' : `.${ext}`}
                  </button>
                ))}
              </div>
              <select value={sortBy} onChange={(e) => handleSortChange(e.target.value)}
                className="bg-[#111114] border border-[#1A1A1D] text-[#71717A] text-[11px] rounded-lg px-3 py-1.5 outline-none cursor-pointer shrink-0 font-medium">
                <option value="relevance">Relevance</option>
                <option value="name">Name</option>
                <option value="date">Newest</option>
                <option value="size">Largest</option>
              </select>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto pb-8 custom-scrollbar">
              {results.length > 0 || query || extensionFilter ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1 text-[10px] font-semibold text-[#3F3F46] uppercase tracking-[0.15em]">
                    <span>Results</span>
                    <span className="font-mono">{results.length} matches • {searchTime}ms</span>
                  </div>

                  <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                      {results.map((res, i) => (
                        <ResultCard
                          key={res.path}
                          result={res}
                          index={i}
                          query={query}
                          isSelected={selectedIndex === i}
                          onPreview={previewDocument}
                          onDelete={deleteFile}
                          onOpen={openExternal}
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {!isSearching && results.length === 0 && (
                    <div className="py-16 flex flex-col items-center justify-center text-[#3F3F46]">
                      <span className="material-symbols-outlined text-4xl mb-3 opacity-30">search_off</span>
                      <p className="text-sm">No matches found {extensionFilter ? `for .${extensionFilter}` : ''} {query ? `matching "${query}"` : ''}</p>
                    </div>
                  )}

                  {/* Loading shimmer */}
                  {isSearching && results.length === 0 && (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-[#111114] border border-[#1A1A1D] rounded-xl p-4">
                          <div className="shimmer h-4 w-48 mb-3"></div>
                          <div className="shimmer h-3 w-full mb-2"></div>
                          <div className="shimmer h-3 w-3/4"></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/10 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-3xl text-blue-500/40">data_exploration</span>
                  </div>
                  <h2 className="text-lg font-semibold text-[#71717A] mb-2">Ready to search</h2>
                  <p className="text-sm text-[#3F3F46] max-w-xs leading-relaxed">Start typing to search your indexed files locally and privately.</p>
                  <div className="flex gap-2 mt-6">
                    <kbd className="bg-[#111114] text-[#3F3F46] text-[10px] px-2.5 py-1 rounded-md border border-[#1A1A1D] font-mono">Ctrl+K</kbd>
                    <span className="text-[11px] text-[#3F3F46]">to focus search</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Status Bar */}
        <footer className="h-9 border-t border-[#1A1A1D] bg-[#0A0A0B] flex items-center justify-between px-6 text-[10px] font-medium uppercase tracking-[0.12em] text-[#3F3F46] shrink-0">
          <div className="flex gap-5">
            <div className="flex items-center gap-1.5">
              <span className="text-blue-400 font-mono">{status.file_count}</span> files indexed
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-violet-400 font-mono">{status.index_size_mb.toFixed(1)}</span> MB
            </div>
            <div className="flex items-center gap-1.5">
              Last index: <span className="font-mono">{status.last_indexed}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            localhost:3000
          </div>
        </footer>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal config={config} setConfig={setConfig} status={status}
            onClose={() => setShowSettings(false)} onReindex={forceReindex} onCleanDupes={cleanDupes} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showCreateFile && (
          <CreateFileModal onClose={() => setShowCreateFile(false)}
            onCreated={(p) => { showToast('success', `Created ${p}`); fetchStatus(); doSearch(query, extensionFilter, sortBy); }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {previewFile && (
          <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onSave={saveFile} onOpen={openExternal} />
        )}
      </AnimatePresence>
    </div>
  );
}
