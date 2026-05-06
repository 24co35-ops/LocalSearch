import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface PreviewModalProps {
  file: { path: string; content: string; language?: string; line_count?: number } | null;
  onClose: () => void;
  onSave: (path: string, content: string) => void;
  onOpen: (path: string) => void;
}

const iconMap: Record<string,string> = { md:'📝',txt:'📄',pdf:'📕',docx:'📘',rs:'⚙️',ts:'🏷️',tsx:'⚛️',js:'🟨',csv:'📊',json:'🔑',py:'🐍',html:'🌐',css:'🎨',toml:'⚙️',yaml:'📋',yml:'📋',sh:'💻',go:'🔵',rb:'💎',java:'☕',c:'🔧',cpp:'🔧',log:'📜',env:'🔐' };

// Lightweight syntax highlighter
function highlightCode(code: string, lang: string): string {
  let html = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Strings
  html = html.replace(/(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g, '<span class="syn-str">$&</span>');
  // Comments
  html = html.replace(/(\/\/.*$)/gm, '<span class="syn-cmt">$&</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="syn-cmt">$&</span>');
  html = html.replace(/(#.*$)/gm, (match, _, offset, str) => {
    if (['python','bash','yaml','toml','dotenv','gitignore','csv'].includes(lang)) return `<span class="syn-cmt">${match}</span>`;
    return match;
  });
  // Keywords
  const kw = 'import|export|from|const|let|var|function|return|if|else|for|while|class|extends|interface|type|async|await|try|catch|throw|new|default|switch|case|break|continue|typeof|instanceof|void|null|undefined|true|false|this|super|static|readonly|enum|implements|abstract|public|private|protected|yield|delete|in|of|def|self|None|True|False|fn|use|mod|pub|mut|impl|struct|trait|match|loop|where|crate|extern|ref|as|is|not|and|or|elif|pass|raise|with|lambda|global|nonlocal';
  html = html.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span class="syn-kw">$&</span>');
  // Numbers
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-num">$&</span>');
  // Types (capitalized words)
  html = html.replace(/\b([A-Z][a-zA-Z0-9_]+)\b/g, '<span class="syn-type">$&</span>');
  return html;
}

// Simple markdown renderer
function renderMarkdown(md: string): string {
  let html = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="md-italic">$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const content = match.slice(3, -3).replace(/^[a-z]*\n/, '');
    return `<pre class="md-pre">${content}</pre>`;
  });
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank">$1</a>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/(<li class="md-li">[\s\S]*?<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-oli">$1</li>');
  html = html.replace(/(<li class="md-oli">[\s\S]*?<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>');
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="md-hr" />');
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="md-p">');
  html = `<p class="md-p">${html}</p>`;
  return html;
}

export default function PreviewModal({ file, onClose, onSave, onOpen }: PreviewModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const ext = file.path.split('.').pop()?.toLowerCase() || '';
  const isMarkdown = ext === 'md';
  const isCode = !isMarkdown && !['txt','csv','log'].includes(ext);
  const lang = file.language || ext;

  const lineNumbers = file.content.split('\n');

  const handleCopy = () => { navigator.clipboard.writeText(file.content); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:0.92,y:20}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.92,y:20}} transition={{type:'spring',damping:25,stiffness:300}}
        className="bg-[#0D0D10] border border-[#1F1F23] rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-black/50" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <header className="px-6 py-3.5 border-b border-[#1A1A1D] flex items-center justify-between shrink-0 bg-[#0D0D10]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">{iconMap[ext]||'📄'}</span>
            <h2 className="font-mono text-sm text-blue-400 truncate">{file.path}</h2>
            {file.line_count && <span className="text-[10px] text-[#3F3F46] shrink-0">{file.line_count} lines</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleCopy} className={`px-3 py-1.5 text-[10px] uppercase font-bold rounded-lg border transition-all cursor-pointer ${copied?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-[#1A1A1D] text-[#52525B] border-[#2A2A2E] hover:text-white hover:border-[#3F3F46]'}`}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={()=>onOpen(file.path)} className="px-3 py-1.5 text-[10px] uppercase font-bold bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg border border-blue-500/20 transition-all cursor-pointer">Open</button>
            <button onClick={()=>{setIsEditing(!isEditing);setEditContent(file.content);}} className={`px-3 py-1.5 text-[10px] uppercase font-bold rounded-lg border transition-all cursor-pointer ${isEditing?'bg-emerald-600 text-white border-emerald-500':'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600 hover:text-white'}`}>
              {isEditing?'Editing':'Edit'}
            </button>
            <button onClick={()=>{onClose();setIsEditing(false);}} className="w-8 h-8 rounded-lg bg-[#1A1A1D] border border-[#2A2A2E] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </header>
        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isEditing ? (
            <textarea value={editContent} onChange={e=>setEditContent(e.target.value)}
              className="w-full h-full bg-[#0A0A0B] text-[#A1A1AA] font-mono text-sm border-none p-6 outline-none resize-none leading-relaxed" />
          ) : isMarkdown ? (
            <div className="p-8 markdown-body" dangerouslySetInnerHTML={{__html:renderMarkdown(file.content)}} />
          ) : isCode ? (
            <div className="flex text-sm font-mono leading-[1.7]">
              <div className="py-4 pl-4 pr-3 text-right text-[#2A2A2E] select-none shrink-0 border-r border-[#1A1A1D]">
                {lineNumbers.map((_,i) => <div key={i} className="hover:text-[#3F3F46]">{i+1}</div>)}
              </div>
              <pre className="py-4 px-5 flex-1 overflow-x-auto"><code dangerouslySetInnerHTML={{__html:highlightCode(file.content, lang)}} /></pre>
            </div>
          ) : (
            <pre className="font-mono text-sm text-[#A1A1AA] whitespace-pre-wrap leading-relaxed p-6">{file.content}</pre>
          )}
        </div>
        {/* Footer */}
        {isEditing && (
          <footer className="px-6 py-3 border-t border-[#1A1A1D] bg-[#0A0A0B]/80 flex justify-end gap-3 shrink-0">
            <button onClick={()=>setIsEditing(false)} className="px-4 py-2 bg-[#1A1A1D] rounded-lg text-sm hover:bg-[#2A2A2E] transition-colors cursor-pointer">Cancel</button>
            <button onClick={()=>onSave(file.path, editContent)} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer">Save Changes</button>
          </footer>
        )}
      </motion.div>
    </div>
  );
}
