import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: TreeNode[];
}

interface SidebarProps {
  onPreview: (path: string) => void;
  onCreateFile: () => void;
  onUpload: () => void;
  onReindex: () => void;
  status: { file_count: number; index_size_mb: number; last_indexed: string };
}

const iconMap: Record<string,string> = { md:'📝',txt:'📄',pdf:'📕',docx:'📘',rs:'⚙️',ts:'🏷️',tsx:'⚛️',js:'🟨',csv:'📊',json:'🔑',py:'🐍',html:'🌐',css:'🎨',toml:'⚙️',yaml:'📋',yml:'📋',sh:'💻',go:'🔵',rb:'💎',java:'☕',c:'🔧',cpp:'🔧',log:'📜',env:'🔐' };
const extColors: Record<string,string> = { ts:'#3B82F6',tsx:'#3B82F6',js:'#FBBF24',py:'#34D399',rs:'#FB923C',go:'#22D3EE',md:'#A78BFA',json:'#F59E0B',html:'#FB923C',css:'#F472B6',txt:'#9CA3AF',csv:'#34D399' };

function FileNode({ node, depth, onPreview }: { node: TreeNode; depth: number; onPreview: (p:string)=>void }) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === 'directory') {
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#71717A] hover:text-[#A1A1AA] hover:bg-white/[0.03] rounded-lg transition-colors cursor-pointer group"
          style={{ paddingLeft: `${12 + depth * 14}px` }}>
          <span className={`material-symbols-outlined text-[14px] transition-transform ${expanded ? 'rotate-90' : ''}`}>chevron_right</span>
          <span className="material-symbols-outlined text-[14px] text-amber-500/70">folder</span>
          <span className="truncate font-medium">{node.name}</span>
          {node.children && <span className="ml-auto text-[10px] text-[#3F3F46] opacity-0 group-hover:opacity-100 transition-opacity">{node.children.length}</span>}
        </button>
        <AnimatePresence>
          {expanded && node.children && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.15}}>
              {node.children.map(child => <FileNode key={child.path} node={child} depth={depth+1} onPreview={onPreview} />)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button onClick={() => onPreview(node.path)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#52525B] hover:text-[#A1A1AA] hover:bg-white/[0.03] rounded-lg transition-colors cursor-pointer"
      style={{ paddingLeft: `${12 + depth * 14}px` }}>
      <span className="text-[13px] shrink-0">{iconMap[node.extension||'']||'📄'}</span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function Sidebar({ onPreview, onCreateFile, onUpload, onReindex, status }: SidebarProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [extStats, setExtStats] = useState<Record<string,number>>({});
  const [collapsed, setCollapsed] = useState(false);

  const fetchTree = async () => {
    try { const r = await fetch('/api/tree'); if(r.ok) { const d = await r.json(); setTree(d.tree || []); } } catch {}
  };
  const fetchStats = async () => {
    try { const r = await fetch('/api/stats/extensions'); if(r.ok) setExtStats(await r.json()); } catch {}
  };

  useEffect(() => { fetchTree(); fetchStats(); const i = setInterval(() => { fetchTree(); fetchStats(); }, 15000); return () => clearInterval(i); }, []);

  const totalFiles = Object.values(extStats).reduce((a,b) => a+b, 0);
  const topExts = Object.entries(extStats).sort((a,b) => b[1]-a[1]).slice(0, 6);

  if (collapsed) {
    return (
      <div className="w-12 border-r border-[#1A1A1D] bg-[#0A0A0B] flex flex-col items-center py-4 gap-3 shrink-0">
        <button onClick={() => setCollapsed(false)} className="w-8 h-8 rounded-lg bg-[#111114] border border-[#1A1A1D] flex items-center justify-center text-[#3F3F46] hover:text-blue-400 hover:border-blue-500/30 transition-all cursor-pointer">
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
        <button onClick={onCreateFile} className="w-8 h-8 rounded-lg bg-[#111114] border border-[#1A1A1D] flex items-center justify-center text-[#3F3F46] hover:text-emerald-400 hover:border-emerald-500/30 transition-all cursor-pointer" title="New File">
          <span className="material-symbols-outlined text-sm">add</span>
        </button>
        <button onClick={onUpload} className="w-8 h-8 rounded-lg bg-[#111114] border border-[#1A1A1D] flex items-center justify-center text-[#3F3F46] hover:text-blue-400 hover:border-blue-500/30 transition-all cursor-pointer" title="Upload">
          <span className="material-symbols-outlined text-sm">upload</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-[#1A1A1D] bg-[#0A0A0B]/80 flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1A1A1D] flex items-center justify-between shrink-0">
        <span className="text-[11px] uppercase tracking-[0.15em] text-[#3F3F46] font-semibold">Explorer</span>
        <div className="flex gap-1">
          <button onClick={onCreateFile} className="w-6 h-6 rounded-md flex items-center justify-center text-[#3F3F46] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer" title="New File">
            <span className="material-symbols-outlined text-sm">note_add</span>
          </button>
          <button onClick={onUpload} className="w-6 h-6 rounded-md flex items-center justify-center text-[#3F3F46] hover:text-blue-400 hover:bg-blue-500/10 transition-all cursor-pointer" title="Upload">
            <span className="material-symbols-outlined text-sm">upload</span>
          </button>
          <button onClick={onReindex} className="w-6 h-6 rounded-md flex items-center justify-center text-[#3F3F46] hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer" title="Re-index">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
          <button onClick={() => setCollapsed(true)} className="w-6 h-6 rounded-md flex items-center justify-center text-[#3F3F46] hover:text-white hover:bg-white/5 transition-all cursor-pointer" title="Collapse">
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-[#3F3F46]">No files indexed</div>
        ) : (
          tree.map(node => <FileNode key={node.path} node={node} depth={0} onPreview={onPreview} />)
        )}
      </div>

      {/* Extension Stats */}
      {topExts.length > 0 && (
        <div className="border-t border-[#1A1A1D] px-4 py-3 shrink-0">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#3F3F46] font-semibold mb-2.5">File Types</div>
          <div className="space-y-1.5">
            {topExts.map(([ext, count]) => (
              <div key={ext} className="flex items-center gap-2">
                <span className="text-[11px] font-mono w-8 text-right" style={{color: extColors[ext]||'#71717A'}}>.{ext}</span>
                <div className="flex-1 h-1.5 bg-[#1A1A1D] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{width:`${Math.max(8,(count/totalFiles)*100)}%`, background: extColors[ext]||'#71717A'}} />
                </div>
                <span className="text-[10px] text-[#3F3F46] w-4 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="border-t border-[#1A1A1D] px-4 py-2.5 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-[#3F3F46]">
          <span>{status.file_count} files</span>
          <span>{status.index_size_mb.toFixed(1)} MB</span>
        </div>
      </div>
    </div>
  );
}
