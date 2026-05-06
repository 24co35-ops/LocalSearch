import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchBarProps {
  query: string;
  onSearch: (val: string, ext?: string) => void;
  searchHistory: string[];
  onFetchHistory: () => void;
}

export default function SearchBar({ query, onSearch, searchHistory, onFetchHistory }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, []);

  return (
    <div className="relative w-full">
      <div className={`search-bar-wrapper ${isFocused ? 'focused' : ''}`}>
        <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500/40 via-violet-500/40 to-blue-500/40 rounded-2xl blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 search-glow"></div>
        <div className={`relative flex items-center bg-[#111114] border rounded-2xl px-5 py-4 shadow-2xl transition-all duration-300 ${
          isFocused ? 'border-blue-500/50 shadow-blue-500/5' : 'border-[#1F1F23]'
        }`}>
          <div className={`mr-3 transition-all duration-300 ${isFocused ? 'text-blue-400' : 'text-[#3F3F46]'}`}>
            <span className="material-symbols-outlined text-xl">search</span>
          </div>
          <input 
            ref={inputRef}
            type="text" 
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            className="bg-transparent border-none w-full text-[15px] placeholder-[#3F3F46] outline-none text-[#E4E4E7] font-medium tracking-tight"
            placeholder="Search your files..."
            autoFocus
            onFocus={() => { 
              setIsFocused(true);
              if (!query && searchHistory.length) { onFetchHistory(); setShowHistory(true); }
            }}
            onBlur={() => { setIsFocused(false); setTimeout(() => setShowHistory(false), 200); }}
          />
          <div className="flex gap-2 items-center shrink-0 ml-3">
            {query && (
              <button onClick={() => onSearch('')} className="text-[#3F3F46] hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
            <div className="flex gap-1">
              <kbd className="bg-[#1A1A1D] text-[#52525B] text-[10px] px-2 py-1 rounded-md border border-[#2A2A2E] font-mono font-medium">Ctrl</kbd>
              <kbd className="bg-[#1A1A1D] text-[#52525B] text-[10px] px-2 py-1 rounded-md border border-[#2A2A2E] font-mono font-medium">K</kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Search History Dropdown */}
      <AnimatePresence>
        {showHistory && searchHistory.length > 0 && (
          <motion.div 
            initial={{opacity:0, y: -8, scale: 0.98}} 
            animate={{opacity:1, y: 0, scale: 1}} 
            exit={{opacity:0, y: -4}}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-[#111114]/95 backdrop-blur-2xl border border-[#1F1F23] rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-[#3F3F46] font-semibold border-b border-[#1A1A1D]">Recent Searches</div>
            {searchHistory.slice(0, 6).map((h, i) => (
              <button 
                key={i} 
                onMouseDown={() => onSearch(h)} 
                className="w-full px-4 py-3 text-left text-sm text-[#71717A] hover:bg-blue-500/5 hover:text-blue-300 flex items-center gap-3 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm text-[#3F3F46]">history</span>
                <span className="truncate">{h}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
