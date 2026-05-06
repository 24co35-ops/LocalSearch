import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import MiniSearch from 'minisearch';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import openApp from 'open';

let appConfig = {
  index: { root_dir: path.resolve(process.cwd(), 'notes') }
};

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Language detection from extension
function detectLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', txt: 'plaintext', sql: 'sql',
    sh: 'bash', bat: 'batch', ps1: 'powershell',
    xml: 'xml', svg: 'xml', csv: 'csv',
    env: 'dotenv', gitignore: 'gitignore', dockerfile: 'dockerfile',
  };
  return map[ext.toLowerCase()] || 'plaintext';
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  let INDEX_ROOT = appConfig.index.root_dir;

  const ensureIndexRoot = () => {
    if (!fs.existsSync(INDEX_ROOT)) {
      fs.mkdirSync(INDEX_ROOT, { recursive: true });
    }
  };
  ensureIndexRoot();

  // Multer setup for uploads (supports multiple files)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, INDEX_ROOT);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload = multer({ storage });

  let searchIndex = new MiniSearch({
    fields: ['path', 'content'],
    storeFields: ['path', 'extension', 'modified_at', 'size', 'content'],
    searchOptions: {
      boost: { path: 2 },
      fuzzy: 0.2,
      prefix: true
    }
  });

  let fileCount = 0;
  let lastIndexedAt = new Date().toLocaleTimeString();
  const searchHistory: string[] = [];

  // Document cache for proper MiniSearch removal
  const docCache = new Map<string, any>();

  const indexFile = async (filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return;
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) return;
      if (stats.size > 50 * 1024 * 1024) return; // Skip files > 50MB

      // Skip binary files by checking extension
      const binaryExts = ['exe', 'dll', 'so', 'dylib', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'mp3', 'mp4', 'avi', 'mov', 'zip', 'tar', 'gz', 'rar', '7z', 'woff', 'woff2', 'ttf', 'eot', 'otf'];
      const ext = path.extname(filePath).slice(1).toLowerCase();
      if (binaryExts.includes(ext)) return;

      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch { return; } // Skip unreadable files

      const relativePath = path.relative(INDEX_ROOT, filePath).replace(/\\/g, '/');

      const doc = {
        id: relativePath,
        path: relativePath,
        content: content,
        extension: ext,
        modified_at: stats.mtime.toISOString(),
        size: stats.size,
      };

      // Remove existing doc if it exists (using discard for MiniSearch v7+)
      if (searchIndex.has(doc.id)) {
        searchIndex.discard(doc.id);
      } else {
        fileCount++;
      }
      searchIndex.add(doc);
      docCache.set(doc.id, doc);
      lastIndexedAt = new Date().toLocaleTimeString();
    } catch (e) {
      // Silently skip files that can't be indexed
    }
  };

  // Recursive directory scanning
  const scanDirectory = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name.startsWith('.')) continue;
        if (['node_modules', '.git', 'target', '__pycache__', 'dist'].includes(entry.name)) continue;
        
        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile()) {
          indexFile(fullPath);
        }
      }
    } catch (e) {
      console.error(`Failed to scan ${dir}`, e);
    }
  };

  let watcher: any = null;

  const setupWatcher = () => {
    if (watcher) watcher.close();
    watcher = chokidar.watch(INDEX_ROOT, {
      ignored: /(^|[\/\\])(\.|node_modules|\.git|target|__pycache__|dist)/,
      persistent: true,
      ignoreInitial: false,
    });
    watcher
      .on('add', (filePath: string) => indexFile(filePath))
      .on('change', (filePath: string) => indexFile(filePath))
      .on('unlink', (filePath: string) => {
        const id = path.relative(INDEX_ROOT, filePath).replace(/\\/g, '/');
        if (searchIndex.has(id)) {
          searchIndex.discard(id);
          docCache.delete(id);
          fileCount = Math.max(0, fileCount - 1);
        }
      });
  };
  setupWatcher();

  app.use(cors());
  app.use(express.json());

  // ─── API Routes ───

  app.get('/api/status', (req, res) => {
    let sizeBytes = 0;
    const countFiles = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            countFiles(fullPath);
          } else {
            sizeBytes += fs.statSync(fullPath).size;
          }
        }
      } catch {}
    };
    countFiles(INDEX_ROOT);

    res.json({
      file_count: fileCount,
      index_size_mb: sizeBytes / (1024 * 1024),
      last_indexed: lastIndexedAt,
      root_dir: INDEX_ROOT,
    });
  });

  // ─── File Tree API ───
  app.get('/api/tree', (_req, res) => {
    interface TreeNode {
      name: string;
      path: string;
      type: 'file' | 'directory';
      extension?: string;
      size?: number;
      children?: TreeNode[];
    }

    const buildTree = (dir: string, relativeTo: string): TreeNode[] => {
      const nodes: TreeNode[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          if (['node_modules', '.git', 'target', '__pycache__', 'dist'].includes(entry.name)) continue;
          
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

          if (entry.isDirectory()) {
            nodes.push({
              name: entry.name,
              path: relPath,
              type: 'directory',
              children: buildTree(fullPath, relativeTo),
            });
          } else {
            const stats = fs.statSync(fullPath);
            nodes.push({
              name: entry.name,
              path: relPath,
              type: 'file',
              extension: path.extname(entry.name).slice(1).toLowerCase(),
              size: stats.size,
            });
          }
        }
      } catch {}
      // Sort: directories first, then files alphabetically
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return nodes;
    };

    res.json({ tree: buildTree(INDEX_ROOT, INDEX_ROOT), root: INDEX_ROOT });
  });

  // ─── Create New File ───
  app.post('/api/create', (req, res) => {
    const { filename, content = '', directory = '' } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename required' });

    // Sanitize
    const safeName = filename.replace(/[<>:"|?*]/g, '');
    const targetDir = directory ? path.join(INDEX_ROOT, directory) : INDEX_ROOT;
    const fullPath = path.join(targetDir, safeName);
    
    if (!fullPath.startsWith(INDEX_ROOT)) return res.status(403).json({ error: 'Forbidden' });

    try {
      if (fs.existsSync(fullPath)) {
        return res.status(409).json({ error: 'File already exists' });
      }
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      const relPath = path.relative(INDEX_ROOT, fullPath).replace(/\\/g, '/');
      res.json({ message: 'File created', path: relPath });
    } catch (e) {
      res.status(500).json({ error: 'Error creating file' });
    }
  });

  app.get('/api/search', (req, res) => {
    const start = performance.now();
    const query = req.query.q as string;
    const extFilter = req.query.ext as string;
    const sortBy = (req.query.sort as string) || 'relevance';

    // Track search history
    if (query && query.trim().length > 1) {
      const idx = searchHistory.indexOf(query.trim());
      if (idx > -1) searchHistory.splice(idx, 1);
      searchHistory.unshift(query.trim());
      if (searchHistory.length > 20) searchHistory.pop();
    }

    let results: any[] = [];

    if (query) {
      results = searchIndex.search(query);
      if (extFilter) {
        results = results.filter(r => {
          const doc = searchIndex.getStoredFields(r.id);
          return (doc as any)?.extension === extFilter;
        });
      }
    } else {
      // No query: return all indexed files
      const allIds = Array.from(docCache.keys());
      for (const id of allIds) {
        const doc = docCache.get(id);
        if (doc) {
          const ext = doc.extension;
          if (!extFilter || ext === extFilter) {
            results.push({ id, score: 1.0 });
          }
        }
      }
      results.sort((a, b) => a.id.localeCompare(b.id));
    }

    // Format results with snippets
    const formattedResults = results.slice(0, 50).map((r, i) => {
      const doc = docCache.get(r.id);
      const filePath = path.join(INDEX_ROOT, r.id);
      let content = doc?.content || '';
      let stats: fs.Stats | null = null;

      try {
        if (fs.existsSync(filePath)) {
          stats = fs.statSync(filePath);
        }
      } catch {}

      const searchTerms = (query || '').toLowerCase().split(' ').filter(t => t.length > 1);

      let snippet = '';
      const lowerContent = content.toLowerCase();
      const firstMatchIndex = searchTerms.length > 0 ? lowerContent.indexOf(searchTerms[0]) : 0;

      if (firstMatchIndex !== -1 && searchTerms.length > 0) {
        const s = Math.max(0, firstMatchIndex - 40);
        const e = Math.min(content.length, firstMatchIndex + 120);
        snippet = (s > 0 ? '...' : '') + content.slice(s, e) + (e < content.length ? '...' : '');

        searchTerms.forEach(term => {
          const escaped = escapeRegExp(term);
          const reg = new RegExp(`(${escaped})`, 'gi');
          snippet = snippet.replace(reg, '<mark class="search-highlight">$1</mark>');
        });
      } else {
        snippet = content.slice(0, 160) + (content.length > 160 ? '...' : '');
      }

      const extension = path.extname(r.id).slice(1);
      const modifiedAt = stats ? stats.mtime.toISOString() : doc?.modified_at || '';
      const fileSize = stats ? stats.size : doc?.size || 0;

      return {
        rank: i + 1,
        path: r.id,
        extension,
        score: r.score || 1.0,
        snippet,
        modified_at: modifiedAt,
        size: fileSize,
      };
    });

    // Apply sorting
    if (sortBy === 'name') {
      formattedResults.sort((a, b) => a.path.localeCompare(b.path));
    } else if (sortBy === 'date') {
      formattedResults.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());
    } else if (sortBy === 'size') {
      formattedResults.sort((a, b) => (b.size as number) - (a.size as number));
    }

    // Re-rank after sort
    formattedResults.forEach((r, i) => r.rank = i + 1);

    res.json({
      results: formattedResults,
      total: formattedResults.length,
      query_time_ms: Math.round(performance.now() - start),
    });
  });

  app.get('/api/search-history', (_req, res) => {
    res.json({ history: searchHistory });
  });

  app.delete('/api/delete', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Path required' });

    const fullPath = path.join(INDEX_ROOT, filePath);
    if (!fullPath.startsWith(INDEX_ROOT)) return res.status(403).json({ error: 'Forbidden' });

    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        res.json({ message: 'File deleted' });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (e) {
      res.status(500).json({ error: 'Error deleting file' });
    }
  });

  app.post('/api/clean-duplicates', (req, res) => {
    const hashes: Record<string, string[]> = {};
    let deletedCount = 0;

    const scanForDupes = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanForDupes(fullPath);
          } else {
            const content = fs.readFileSync(fullPath);
            const hash = crypto.createHash('md5').update(content).digest('hex');
            if (!hashes[hash]) hashes[hash] = [];
            hashes[hash].push(fullPath);
          }
        }
      } catch {}
    };
    scanForDupes(INDEX_ROOT);

    Object.values(hashes).forEach(paths => {
      if (paths.length > 1) {
        for (let i = 1; i < paths.length; i++) {
          try {
            fs.unlinkSync(paths[i]);
            deletedCount++;
          } catch {}
        }
      }
    });

    res.json({ message: `Deleted ${deletedCount} duplicate files.` });
  });

  app.get('/api/read', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Path required' });

    const fullPath = path.join(INDEX_ROOT, filePath);
    if (!fullPath.startsWith(INDEX_ROOT)) return res.status(403).json({ error: 'Forbidden' });

    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const stats = fs.statSync(fullPath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        res.json({
          content,
          size: stats.size,
          modified_at: stats.mtime.toISOString(),
          extension: ext,
          language: detectLanguage(ext),
          line_count: content.split('\n').length,
        });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (e) {
      res.status(500).json({ error: 'Error reading file' });
    }
  });

  app.put('/api/save', (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path required' });

    const fullPath = path.join(INDEX_ROOT, filePath);
    if (!fullPath.startsWith(INDEX_ROOT)) return res.status(403).json({ error: 'Forbidden' });

    try {
      // Ensure directory exists for nested files
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      fs.writeFileSync(fullPath, content, 'utf8');
      res.json({ message: 'File saved successfully' });
    } catch (e) {
      res.status(500).json({ error: 'Error saving file' });
    }
  });

  app.post('/api/upload', upload.array('files', 20), (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    res.json({
      message: `${files.length} file(s) uploaded successfully`,
      paths: files.map(f => f.originalname),
    });
  });

  app.post('/api/open', async (req, res) => {
    const { path: filePath } = req.body;
    const fullPath = path.join(INDEX_ROOT, filePath);
    try {
      await openApp(fullPath);
      res.sendStatus(200);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error opening file' });
    }
  });

  app.get('/api/config', (_req, res) => {
    res.json(appConfig);
  });

  app.post('/api/config', (req, res) => {
    const newConfig = req.body;
    if (newConfig?.index?.root_dir) {
      appConfig = newConfig;
      INDEX_ROOT = path.resolve(appConfig.index.root_dir);
      ensureIndexRoot();
      // Reset index
      searchIndex = new MiniSearch({
        fields: ['path', 'content'],
        storeFields: ['path', 'extension', 'modified_at', 'size', 'content'],
        searchOptions: { boost: { path: 2 }, fuzzy: 0.2, prefix: true }
      });
      docCache.clear();
      fileCount = 0;
      setupWatcher();
    }
    res.json({ message: 'Config updated' });
  });

  app.post('/api/index', (_req, res) => {
    searchIndex = new MiniSearch({
      fields: ['path', 'content'],
      storeFields: ['path', 'extension', 'modified_at', 'size', 'content'],
      searchOptions: { boost: { path: 2 }, fuzzy: 0.2, prefix: true }
    });
    docCache.clear();
    fileCount = 0;
    setupWatcher();
    res.json({ message: 'Re-indexing started' });
  });

  app.get('/api/stats/extensions', (_req, res) => {
    const extCounts: Record<string, number> = {};
    for (const doc of docCache.values()) {
      const ext = doc.extension || 'other';
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
    res.json(extCounts);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ⚡ LocalSearch running at http://localhost:${PORT}`);
    console.log(`  📁 Indexing: ${INDEX_ROOT}\n`);
  });
}

startServer().catch(err => {
  console.error("Server start error:", err);
});
