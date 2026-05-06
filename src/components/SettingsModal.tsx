import React from 'react';
import { motion } from 'framer-motion';

interface SettingsModalProps {
  config: any;
  setConfig: (c: any) => void;
  status: { file_count: number; index_size_mb: number; last_indexed: string };
  onClose: () => void;
  onReindex: () => void;
  onCleanDupes: () => void;
}

export default function SettingsModal({ config, setConfig, status, onClose, onReindex, onCleanDupes }: SettingsModalProps) {
  const saveConfig = async () => {
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config) });
    onReindex();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:0.95,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.95}}
        className="bg-[#0D0D10] border border-[#1F1F23] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="px-6 py-4 border-b border-[#1A1A1D] flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2.5">
            <span className="material-symbols-outlined text-blue-400">settings</span>
            Settings
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1A1A1D] border border-[#2A2A2E] flex items-center justify-center text-[#52525B] hover:text-white hover:bg-white/5 cursor-pointer transition-all">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </header>
        <div className="p-6 space-y-6">
          {/* Config */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#3F3F46] font-semibold mb-3">Index Configuration</h3>
            <div className="bg-[#111114] p-4 rounded-xl border border-[#1A1A1D] space-y-3">
              <div>
                <label className="text-[10px] text-[#3F3F46] uppercase mb-1.5 block font-medium">Root Directory</label>
                <input type="text" value={config?.index?.root_dir||''} onChange={e=>setConfig({...config,index:{...config?.index,root_dir:e.target.value}})}
                  className="w-full bg-[#0A0A0B] text-sm text-[#A1A1AA] border border-[#1F1F23] rounded-lg px-3 py-2.5 focus:border-blue-500/50 outline-none font-mono transition-colors" />
              </div>
              <button onClick={saveConfig}
                className="w-full px-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-xs font-semibold hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg shadow-blue-600/20 cursor-pointer">
                Save & Re-index
              </button>
            </div>
          </section>

          {/* Maintenance */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#3F3F46] font-semibold mb-3">Maintenance</h3>
            <div className="space-y-2">
              <button onClick={()=>{onReindex();onClose();}}
                className="w-full px-4 py-3 bg-[#111114] text-[#A1A1AA] rounded-xl border border-[#1A1A1D] hover:border-[#2A2A2E] hover:bg-[#151518] transition-all cursor-pointer flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-base text-amber-500/60 group-hover:text-amber-400 transition-colors">refresh</span>
                  <span className="text-sm font-medium">Force Re-index</span>
                </div>
                <span className="material-symbols-outlined text-sm text-[#3F3F46]">arrow_forward</span>
              </button>
              <button onClick={()=>{onCleanDupes();onClose();}}
                className="w-full px-4 py-3 bg-red-500/[0.03] text-red-400/80 rounded-xl border border-red-500/10 hover:bg-red-500/[0.06] hover:border-red-500/20 transition-all cursor-pointer flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-base">content_copy</span>
                  <span className="text-sm font-medium">Remove Duplicates</span>
                </div>
                <span className="material-symbols-outlined text-sm text-[#3F3F46]">arrow_forward</span>
              </button>
            </div>
          </section>

          {/* Storage */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.15em] text-[#3F3F46] font-semibold mb-3">Storage Info</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#111114] p-3 rounded-xl border border-[#1A1A1D] text-center">
                <div className="text-[10px] text-[#3F3F46] uppercase mb-1">Files</div>
                <div className="text-base font-mono font-semibold text-blue-400">{status.file_count}</div>
              </div>
              <div className="bg-[#111114] p-3 rounded-xl border border-[#1A1A1D] text-center">
                <div className="text-[10px] text-[#3F3F46] uppercase mb-1">Size</div>
                <div className="text-base font-mono font-semibold text-violet-400">{status.index_size_mb.toFixed(1)}MB</div>
              </div>
              <div className="bg-[#111114] p-3 rounded-xl border border-[#1A1A1D] text-center">
                <div className="text-[10px] text-[#3F3F46] uppercase mb-1">Updated</div>
                <div className="text-[11px] font-mono text-emerald-400 mt-0.5">{status.last_indexed}</div>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="text-center pt-2">
            <p className="text-[11px] text-[#3F3F46]">LocalSearch v2.0 — Private local file search engine</p>
          </section>
        </div>
        <footer className="px-6 py-4 bg-[#0A0A0B]/50 border-t border-[#1A1A1D] flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-[#1A1A1D] text-sm rounded-lg hover:bg-[#2A2A2E] transition-colors cursor-pointer">Done</button>
        </footer>
      </motion.div>
    </div>
  );
}
