/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  rank: number;
  path: string;
  extension: string;
  score: number;
  snippet: string;
  modified_at: string;
  size?: string;
}

interface IndexStatus {
  file_count: number;
  index_size_mb: number;
  last_indexed: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<IndexStatus>({ file_count: 0, index_size_mb: 0, last_indexed: '--:--:--' });
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [extensionFilter, setExtensionFilter] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [sortBy, setSortBy] = useState('relevance');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const debounceRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) setConfig(await res.json());
    } catch (e) { console.error("Failed to fetch config", e); }
  };

  const openExternal = async (path: string) => {
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
    } catch (e) { console.error("Failed to open file", e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/search-history');
      if (res.ok) { const d = await res.json(); setSearchHistory(d.history || []); }
    } catch {}
  };

  const saveFile = async (filePath: string, content: string) => {
    try {
      const res = await fetch('/api/save', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath, content }) });
      if (res.ok) { setPreviewFile({ path: filePath, content }); setIsEditing(false); setUploadStatus({ type: 'success', msg: 'File saved!' }); setTimeout(() => setUploadStatus(null), 3000); }
    } catch { setUploadStatus({ type: 'error', msg: 'Save failed' }); setTimeout(() => setUploadStatus(null), 3000); }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setIsUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) { setUploadStatus({ type: 'success', msg: `Uploaded ${files.length} file(s)` }); fetchStatus(); handleSearch(query); }
      else setUploadStatus({ type: 'error', msg: 'Upload failed' });
    } catch { setUploadStatus({ type: 'error', msg: 'Upload error' }); }
    finally { setIsUploading(false); setTimeout(() => setUploadStatus(null), 4000); }
  };

  useEffect(() => {
    fetchStatus(); fetchConfig(); fetchHistory(); handleSearch('', '');
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.error("Status check failed", e);
    }
  };

  const doSearch = async (val: string, ext: string, sort: string) => {
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(val)}&ext=${ext}&sort=${sort}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setSearchTime(data.query_time_ms ?? 0);
      }
    } catch {} finally { setIsSearching(false); }
  };

  const handleSearch = (val: string, ext: string = extensionFilter, sort: string = sortBy) => {
    setQuery(val); setExtensionFilter(ext); setSortBy(sort); setShowHistory(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, ext, sort), 150);
  };

  const previewDocument = async (path: string) => {
    try {
      const res = await fetch(`/api/read?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewFile({ path, content: data.content });
      } else {
        alert("Could not load file preview.");
      }
    } catch (e) {
      console.error("Preview failed", e);
    }
  };

  const deleteFile = async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;
    try {
      const res = await fetch(`/api/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      if (res.ok) {
        setTimeout(() => {
          handleSearch(query);
          fetchStatus();
        }, 300);
      }
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const forceReindex = async () => {
    try {
      const res = await fetch('/api/index', { method: 'POST' });
      if (res.ok) {
        alert("Indexing started in background.");
        fetchStatus();
        handleSearch(query);
      }
    } catch (e) {
      console.error("Re-index failed", e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsUploading(true); setUploadStatus(null);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) { setUploadStatus({ type: 'success', msg: `Uploaded ${files.length} file(s)` }); fetchStatus(); handleSearch(query); }
      else setUploadStatus({ type: 'error', msg: 'Upload failed' });
    } catch { setUploadStatus({ type: 'error', msg: 'Upload error' }); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; setTimeout(() => setUploadStatus(null), 4000); }
  };

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && previewFile) {
        setPreviewFile(null);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [previewFile]);

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0B] text-[#E4E4E7] font-sans selection:bg-blue-500/30"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-[100] bg-blue-600/10 backdrop-blur-sm border-4 border-dashed border-blue-500/50 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <span className="material-symbols-outlined text-6xl text-blue-400 mb-4 block">cloud_upload</span>
              <p className="text-xl font-medium text-blue-300">Drop files to upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#1F1F23] shrink-0">
        <div className="flex items-center gap-3 logo-animate">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/20">LS</div>
          <span className="text-xl font-medium tracking-tight">LocalSearch</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-[#71717A]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="font-medium">Watcher Active</span>
          </div>
          <div className="w-px h-4 bg-[#1F1F23]"></div>
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden"
              multiple
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 bg-blue-600/10 text-blue-400 rounded border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all cursor-pointer flex items-center gap-2"
              disabled={isUploading}
            >
              <span className="material-symbols-outlined text-sm">{isUploading ? 'sync' : 'upload'}</span>
              {isUploading ? 'Uploading...' : 'Upload File'}
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="px-3 py-1 bg-[#1F1F23] rounded border border-[#2D2D33] hover:border-[#3F3F46] text-white transition-colors cursor-pointer"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Upload Status Toast */}
      <AnimatePresence>
        {uploadStatus && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed top-20 right-8 z-[60] px-4 py-3 rounded-lg shadow-2xl border flex items-center gap-3 ${
              uploadStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <span className="material-symbols-outlined">{uploadStatus.type === 'success' ? 'check_circle' : 'error'}</span>
            <span className="text-sm font-medium">{uploadStatus.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-hidden flex flex-col items-center pt-12 px-8">
        <div className="w-full max-w-3xl flex flex-col h-full">
          <div className="flex flex-col gap-4 mb-8 shrink-0">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur opacity-75 group-focus-within:opacity-100 transition-opacity"></div>
              <div className="relative flex items-center bg-[#151518] border border-[#2D2D33] rounded-xl p-4 shadow-2xl focus-within:border-blue-500/60 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
                <span className="text-[#52525B] px-2 material-symbols-outlined shrink-0">search</span>
                <input 
                  ref={inputRef}
                  type="text" 
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 w-full text-lg placeholder-[#52525B] outline-none"
                  placeholder="Search local files (Ctrl+K)"
                  autoFocus
                  onFocus={() => { if (!query && searchHistory.length) setShowHistory(true); }}
                  onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                />
                <div className="flex gap-2 items-center">
                  {query && (
                    <button onClick={() => handleSearch('', '')} className="text-[#52525B] hover:text-white transition-colors">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                  <kbd className="bg-[#1F1F23] text-[#71717A] text-[10px] px-1.5 py-0.5 rounded border border-[#2D2D33] font-mono">ESC</kbd>
                </div>
              </div>
            </div>

            {/* Search History Dropdown */}
            <AnimatePresence>
              {showHistory && searchHistory.length > 0 && (
                <motion.div initial={{opacity:0,y:-5}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="absolute top-full left-0 right-0 mt-1 bg-[#151518] border border-[#2D2D33] rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-[#52525B] border-b border-[#1F1F23]">Recent Searches</div>
                  {searchHistory.slice(0,8).map((h,i) => (
                    <button key={i} onMouseDown={() => handleSearch(h)} className="w-full px-4 py-2.5 text-left text-sm text-[#A1A1AA] hover:bg-[#1F1F23] flex items-center gap-3 cursor-pointer">
                      <span className="material-symbols-outlined text-sm text-[#52525B]">history</span>{h}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Filters & Sort */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar flex-1">
                {['', 'md', 'txt', 'csv', 'pdf', 'docx', 'json', 'ts', 'tsx', 'js', 'py', 'html', 'css'].map((ext) => (
                  <button key={ext} onClick={() => handleSearch(query, ext)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all whitespace-nowrap cursor-pointer ${
                      extensionFilter === ext ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-[#1F1F23] border-[#2D2D33] text-[#71717A] hover:border-[#3F3F46]'
                    }`}>
                    {ext === '' ? 'All' : `.${ext}`}
                  </button>
                ))}
              </div>
              <select value={sortBy} onChange={(e) => handleSearch(query, extensionFilter, e.target.value)}
                className="bg-[#1F1F23] border border-[#2D2D33] text-[#A1A1AA] text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer shrink-0">
                <option value="relevance">Relevance</option>
                <option value="name">Name</option>
                <option value="date">Newest</option>
                <option value="size">Largest</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
            {results.length > 0 || query || extensionFilter ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2 text-xs font-semibold text-[#52525B] uppercase tracking-widest">
                  <span>Results</span>
                  <span>{results.length} Matches in {searchTime}ms</span>
                </div>

                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {results.map((res, i) => (
                      <motion.div
                        key={res.path}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.05, 0.3) }}
                        className={`group bg-[#151518] border ${i === 0 ? 'border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-[#1F1F23]'} rounded-lg p-4 transition-all relative overflow-hidden`}
                      >
                        <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                             onClick={(e) => { e.stopPropagation(); deleteFile(res.path); }}
                             className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>

                        <div className="flex items-start justify-between mb-2 cursor-pointer" onClick={() => previewDocument(res.path)}>
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="text-2xl shrink-0">
                              {getFileIcon(res.extension)}
                            </span>
                            <div className="truncate">
                              <h3 className={`font-medium font-mono text-sm tracking-tight truncate ${i === 0 ? 'text-blue-400' : 'text-[#A1A1AA]'} group-hover:text-blue-300`}>
                                {res.path}
                              </h3>
                              <p className="text-xs text-[#52525B] mt-0.5">
                                Modified {formatDate(res.modified_at)} • {typeof res.size === 'number' ? formatSize(res.size) : res.size || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          {i === 0 && query && (
                            <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-1 rounded shrink-0 mr-10">BEST MATCH</span>
                          )}
                        </div>
                        <p 
                          className="text-sm text-[#71717A] group-hover:text-[#A1A1AA] leading-relaxed line-clamp-2 cursor-pointer"
                          dangerouslySetInnerHTML={{ __html: res.snippet }}
                          onClick={() => previewDocument(res.path)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {!isSearching && results.length === 0 && (
                  <div className="py-20 flex flex-col items-center justify-center text-[#52525B]">
                    <span className="material-symbols-outlined text-4xl mb-4 opacity-20">search_off</span>
                    <p className="text-sm">No matches found {extensionFilter ? `for .${extensionFilter} files` : ''} {query ? `matching "${query}"` : ''}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-32 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/5 border border-blue-500/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-3xl text-blue-500/40">data_exploration</span>
                </div>
                <h2 className="text-lg font-medium text-[#A1A1AA] mb-2">Ready to search</h2>
                <p className="text-sm text-[#52525B] max-w-xs">Start typing to search your indexed files locally and privately.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#151518] border border-[#2D2D33] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <header className="px-6 py-4 border-b border-[#1F1F23] flex items-center justify-between">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined">settings</span>
                  Settings
                </h2>
                <button onClick={() => setShowSettings(false)} className="text-[#52525B] hover:text-white cursor-pointer">
                   <span className="material-symbols-outlined">close</span>
                </button>
              </header>
              <div className="p-6 space-y-6">
                <section>
                  <h3 className="text-xs uppercase tracking-widest text-[#52525B] mb-3">Configuration</h3>
                  <div className="bg-[#1F1F23] p-4 rounded-lg border border-[#2D2D33] space-y-3">
                    <div>
                      <label className="text-[10px] text-[#52525B] uppercase mb-1 block">Root Directory to Index</label>
                      <input 
                        type="text" 
                        value={config?.index?.root_dir || ''} 
                        onChange={(e) => setConfig({...config, index: {...config.index, root_dir: e.target.value}})}
                        className="w-full bg-[#151518] text-sm text-[#A1A1AA] border border-[#2D2D33] rounded px-3 py-2 focus:border-blue-500/50 outline-none"
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        await fetch('/api/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(config) });
                        alert("Configuration saved. Please force re-index.");
                      }}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                      Save Configuration
                    </button>
                  </div>
                </section>
                
                <section>
                  <h3 className="text-xs uppercase tracking-widest text-[#52525B] mb-3">Maintenance</h3>
                  <div className="space-y-3">
                    <button onClick={forceReindex}
                      className="w-full px-4 py-3 bg-[#1F1F23] text-[#A1A1AA] rounded-xl border border-[#2D2D33] hover:border-[#3F3F46] transition-all cursor-pointer flex items-center justify-between">
                      <span className="text-sm font-medium">Force Re-index</span>
                      <span className="material-symbols-outlined text-sm">refresh</span>
                    </button>
                    <button onClick={async () => { const r = await fetch('/api/clean-duplicates', {method:'POST'}); const d = await r.json(); alert(d.message); fetchStatus(); handleSearch(query); }}
                      className="w-full px-4 py-3 bg-red-500/5 text-red-400 rounded-xl border border-red-500/20 hover:bg-red-500/10 transition-all cursor-pointer flex items-center justify-between">
                      <span className="text-sm font-medium">Remove Duplicates</span>
                      <span className="material-symbols-outlined text-sm">content_copy</span>
                    </button>
                  </div>
                </section>
                
                <section>
                  <h3 className="text-xs uppercase tracking-widest text-[#52525B] mb-3">Storage Info</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#1F1F23] p-3 rounded-lg border border-[#2D2D33]">
                      <div className="text-[10px] text-[#52525B] uppercase mb-1">Index Cache</div>
                      <div className="text-sm font-mono">{status.index_size_mb.toFixed(2)} MB</div>
                    </div>
                    <div className="bg-[#1F1F23] p-3 rounded-lg border border-[#2D2D33]">
                      <div className="text-[10px] text-[#52525B] uppercase mb-1">Indexed Files</div>
                      <div className="text-sm font-mono">{status.file_count}</div>
                    </div>
                  </div>
                </section>
              </div>
              <footer className="px-6 py-4 bg-[#0A0A0B]/50 border-t border-[#1F1F23] flex justify-end">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 cursor-pointer"
                >
                  Done
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#151518] border border-[#2D2D33] rounded-2xl w-full max-w-4xl h-full flex flex-col overflow-hidden shadow-2xl"
            >
              <header className="px-6 py-4 border-b border-[#1F1F23] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                   <span className="text-xl">{getFileIcon(previewFile.path.split('.').pop() || '')}</span>
                   <h2 className="font-mono text-sm text-blue-400 truncate max-w-md">{previewFile.path}</h2>
                   <button onClick={() => openExternal(previewFile.path)}
                     className="ml-2 px-3 py-1 text-[10px] uppercase font-bold bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded border border-blue-500/20 transition-colors">Open in App</button>
                   <button onClick={() => { setIsEditing(!isEditing); setEditContent(previewFile.content); }}
                     className={`px-3 py-1 text-[10px] uppercase font-bold rounded border transition-colors ${isEditing ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600 hover:text-white'}`}>
                     {isEditing ? 'Editing' : 'Edit'}</button>
                </div>
                <button onClick={() => { setPreviewFile(null); setIsEditing(false); }}
                  className="w-8 h-8 rounded-full bg-[#1F1F23] border border-[#2D2D33] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </header>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {isEditing ? (
                  <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full bg-[#0A0A0B] text-[#A1A1AA] font-mono text-sm border border-[#2D2D33] rounded-lg p-4 outline-none focus:border-blue-500/50 resize-none leading-relaxed" />
                ) : (
                  <pre className="font-mono text-sm text-[#A1A1AA] whitespace-pre-wrap leading-relaxed">{previewFile.content}</pre>
                )}
              </div>
              <footer className="px-6 py-3 border-t border-[#1F1F23] bg-[#0A0A0B]/50 flex justify-end gap-3">
                {isEditing && (
                  <button onClick={() => saveFile(previewFile.path, editContent)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer">Save Changes</button>
                )}
                <button onClick={() => { setPreviewFile(null); setIsEditing(false); }}
                   className="px-4 py-2 bg-[#1F1F23] rounded-lg text-sm hover:bg-[#2D2D33] transition-colors cursor-pointer">Close</button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="h-12 border-t border-[#1F1F23] bg-[#0A0A0B] flex items-center justify-between px-8 text-[11px] font-medium uppercase tracking-widest text-[#52525B] shrink-0">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[#A1A1AA]">Files:</span> {status.file_count.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#A1A1AA]">Size:</span> {status.index_size_mb.toFixed(1)} MB
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#A1A1AA]">Last Index:</span> {status.last_indexed}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-blue-500/80 underline cursor-pointer hover:text-blue-400">stable build</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            Localhost:3000
          </div>
        </div>
      </footer>
    </div>
  );
}

function getFileIcon(ext: string) {
  const map: Record<string, string> = {
    'md': '📝', 'txt': '📄', 'pdf': '📕', 'docx': '📘', 'rs': '⚙️',
    'ts': '🏷️', 'tsx': '⚛️', 'js': '🟨', 'csv': '📊', 'json': '🔑',
    'py': '🐍', 'html': '🌐', 'css': '🎨', 'toml': '⚙️', 'yaml': '📋',
    'yml': '📋', 'xml': '📋', 'sql': '🗄️', 'sh': '💻', 'bat': '💻',
    'go': '🔵', 'rb': '💎', 'java': '☕', 'c': '🔧', 'cpp': '🔧',
    'h': '🔧', 'log': '📜', 'env': '🔐', 'gitignore': '🚫',
  };
  return map[ext.toLowerCase()] || '📄';
}
