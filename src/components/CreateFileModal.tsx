import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface CreateFileModalProps {
  onClose: () => void;
  onCreated: (path: string) => void;
}

const templates: Record<string, { ext: string; content: string; icon: string }> = {
  'Blank': { ext: 'txt', content: '', icon: '📄' },
  'Markdown': { ext: 'md', content: '# Title\n\nYour content here.\n', icon: '📝' },
  'JSON': { ext: 'json', content: '{\n  \n}\n', icon: '🔑' },
  'JavaScript': { ext: 'js', content: '// New file\n\n', icon: '🟨' },
  'TypeScript': { ext: 'ts', content: '// New file\n\n', icon: '🏷️' },
  'Python': { ext: 'py', content: '# New file\n\n', icon: '🐍' },
  'HTML': { ext: 'html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title></title>\n</head>\n<body>\n  \n</body>\n</html>\n', icon: '🌐' },
  'CSS': { ext: 'css', content: '/* Styles */\n\n', icon: '🎨' },
};

export default function CreateFileModal({ onClose, onCreated }: CreateFileModalProps) {
  const [filename, setFilename] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('Blank');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!filename.trim()) { setError('Filename is required'); return; }
    setCreating(true); setError('');
    const tmpl = templates[selectedTemplate];
    const finalName = filename.includes('.') ? filename : `${filename}.${tmpl.ext}`;
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: finalName, content: tmpl.content }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.path || finalName);
        onClose();
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to create file');
      }
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:0.95,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.95}}
        className="bg-[#0D0D10] border border-[#1F1F23] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="px-6 py-4 border-b border-[#1A1A1D] flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-400">note_add</span>
            Create New File
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1A1A1D] border border-[#2A2A2E] flex items-center justify-center text-[#52525B] hover:text-white cursor-pointer transition-all">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </header>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] text-[#3F3F46] uppercase tracking-wider mb-2 block font-semibold">File Name</label>
            <input type="text" value={filename} onChange={e=>{setFilename(e.target.value);setError('');}}
              placeholder="e.g. notes.md" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-[#111114] text-sm text-[#E4E4E7] border border-[#1F1F23] rounded-xl px-4 py-3 focus:border-blue-500/50 outline-none font-mono placeholder-[#3F3F46] transition-colors" />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
          <div>
            <label className="text-[10px] text-[#3F3F46] uppercase tracking-wider mb-2 block font-semibold">Template</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(templates).map(([name, tmpl]) => (
                <button key={name} onClick={() => setSelectedTemplate(name)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    selectedTemplate === name 
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 shadow-lg shadow-blue-500/5' 
                      : 'bg-[#111114] border-[#1A1A1D] text-[#52525B] hover:border-[#2A2A2E] hover:text-[#71717A]'
                  }`}>
                  <span className="text-lg block mb-1">{tmpl.icon}</span>
                  <span className="text-[10px] font-medium">{name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <footer className="px-6 py-4 bg-[#0A0A0B]/50 border-t border-[#1A1A1D] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-[#1A1A1D] rounded-lg text-sm hover:bg-[#2A2A2E] transition-colors cursor-pointer">Cancel</button>
          <button onClick={handleCreate} disabled={creating}
            className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg text-sm font-semibold hover:from-emerald-500 hover:to-emerald-600 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50">
            {creating ? 'Creating...' : 'Create File'}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
