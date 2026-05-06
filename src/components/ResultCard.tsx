import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface ResultCardProps {
  result: { rank: number; path: string; extension: string; score: number; snippet: string; modified_at: string; size?: number | string; };
  index: number;
  query: string;
  isSelected: boolean;
  onPreview: (path: string) => void;
  onDelete: (path: string) => void;
  onOpen: (path: string) => void;
}

function formatSize(b: number) { if(b<1024) return `${b} B`; if(b<1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`; }
function formatDate(iso: string) { try { const d=new Date(iso), now=new Date(), days=Math.floor((now.getTime()-d.getTime())/86400000); if(days===0)return'Today'; if(days===1)return'Yesterday'; if(days<7)return`${days}d ago`; if(days<30)return`${Math.floor(days/7)}w ago`; return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch{return iso;} }

const iconMap: Record<string,string> = { md:'📝',txt:'📄',pdf:'📕',docx:'📘',rs:'⚙️',ts:'🏷️',tsx:'⚛️',js:'🟨',csv:'📊',json:'🔑',py:'🐍',html:'🌐',css:'🎨',toml:'⚙️',yaml:'📋',yml:'📋',xml:'📋',sql:'🗄️',sh:'💻',bat:'💻',go:'🔵',rb:'💎',java:'☕',c:'🔧',cpp:'🔧',h:'🔧',log:'📜',env:'🔐',gitignore:'🚫' };
const extColors: Record<string,string> = { ts:'text-blue-400',tsx:'text-blue-400',js:'text-yellow-400',py:'text-green-400',rs:'text-orange-400',go:'text-cyan-400',md:'text-violet-400',json:'text-amber-400',html:'text-orange-400',css:'text-pink-400',txt:'text-gray-400',csv:'text-emerald-400' };

export default function ResultCard({ result, index, query, isSelected, onPreview, onDelete, onOpen }: ResultCardProps) {
  const isFirst = index === 0 && !!query;
  const copyPath = () => navigator.clipboard.writeText(result.path);

  return (
    <motion.div layout initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.97}} transition={{duration:0.2,delay:Math.min(index*0.04,0.25)}}
      className={`result-card group relative ${isSelected?'selected':''} ${isFirst?'best-match':''}`}>
      <div className="absolute -inset-px bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-violet-500/0 rounded-xl opacity-0 group-hover:from-blue-500/10 group-hover:via-blue-500/5 group-hover:to-violet-500/10 group-hover:opacity-100 transition-all duration-300 pointer-events-none"></div>
      <div className={`relative bg-[#111114] border rounded-xl p-4 transition-all duration-200 ${isFirst?'border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.08)]':isSelected?'border-blue-500/30 bg-blue-500/[0.03]':'border-[#1A1A1D] hover:border-[#2A2A2E]'}`}>
        <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
          <button onClick={(e)=>{e.stopPropagation();onOpen(result.path);}} className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all cursor-pointer" title="Open in app">
            <span className="material-symbols-outlined text-xs">open_in_new</span>
          </button>
          <button onClick={(e)=>{e.stopPropagation();copyPath();}} className="w-7 h-7 rounded-lg bg-[#1F1F23] border border-[#2A2A2E] text-[#71717A] flex items-center justify-center hover:bg-violet-500/20 hover:text-violet-400 hover:border-violet-500/30 transition-all cursor-pointer" title="Copy path">
            <span className="material-symbols-outlined text-xs">content_copy</span>
          </button>
          <button onClick={(e)=>{e.stopPropagation();onDelete(result.path);}} className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all cursor-pointer" title="Delete">
            <span className="material-symbols-outlined text-xs">delete</span>
          </button>
        </div>
        <div className="cursor-pointer" onClick={()=>onPreview(result.path)}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg shrink-0">{iconMap[result.extension]||'📄'}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className={`font-mono text-sm font-medium truncate ${isFirst?'text-blue-400':'text-[#C4C4C8]'} group-hover:text-blue-300 transition-colors`}>{result.path}</h3>
                {isFirst && <span className="shrink-0 text-[9px] font-bold bg-gradient-to-r from-blue-500/20 to-violet-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-500/20 uppercase tracking-wider">Best Match</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-[#3F3F46]">
                <span className={`font-mono font-medium uppercase ${extColors[result.extension]||'text-[#71717A]'}`}>.{result.extension}</span>
                <span>•</span><span>{formatDate(result.modified_at)}</span>
                <span>•</span><span>{typeof result.size==='number'?formatSize(result.size):result.size||'Unknown'}</span>
              </div>
            </div>
          </div>
          <p className="text-[13px] text-[#52525B] group-hover:text-[#71717A] leading-relaxed line-clamp-2 pl-9 transition-colors" dangerouslySetInnerHTML={{__html:result.snippet}} />
        </div>
      </div>
    </motion.div>
  );
}
