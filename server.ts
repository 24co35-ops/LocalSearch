import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import MiniSearch from 'minisearch';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const INDEX_ROOT = path.resolve(process.cwd(), 'notes');

  // Ensure notes directory exists
  if (!fs.existsSync(INDEX_ROOT)) {
    fs.mkdirSync(INDEX_ROOT);
    // Add a welcome file
    fs.writeFileSync(path.join(INDEX_ROOT, 'welcome.md'), '# Welcome to LocalSearch\nThis is your first indexed file.\n\nYou can search for "welcome" or "LocalSearch" to test the system.');
  }

  // Multer setup for uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, INDEX_ROOT);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload = multer({ storage });

  const searchIndex = new MiniSearch({
    fields: ['path', 'content'], // fields to index for full-text search
    storeFields: ['path', 'extension', 'modified_at', 'size'], // fields to return with search results
    searchOptions: {
      boost: { path: 2 },
      fuzzy: 0.2,
      prefix: true
    }
  });

  let fileCount = 0;
  let lastIndexedAt = new Date().toLocaleTimeString();

  const indexFile = async (filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return;
      const stats = fs.statSync(filePath);
      if (stats.size > 50 * 1024 * 1024) return; // Skip files > 50MB

      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(INDEX_ROOT, filePath);
      const ext = path.extname(filePath).slice(1);

      const doc = {
        id: relativePath,
        path: relativePath,
        content: content,
        extension: ext,
        modified_at: stats.mtime.toLocaleDateString(),
        size: `${(stats.size / 1024).toFixed(1)} KB`
      };

      if (searchIndex.has(doc.id)) {
        searchIndex.remove(doc.id);
      } else {
        fileCount++;
      }
      searchIndex.add(doc);
    } catch (e) {
      console.error(`Failed to index ${filePath}`, e);
    }
  };

  const watcher = chokidar.watch(INDEX_ROOT, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
  });

  watcher
    .on('add', filePath => indexFile(filePath))
    .on('change', filePath => indexFile(filePath))
    .on('unlink', filePath => {
      const id = path.relative(INDEX_ROOT, filePath);
      if (searchIndex.has(id)) {
        searchIndex.remove(id);
        fileCount--;
      }
    });

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get('/api/status', (req, res) => {
    res.json({
      file_count: fileCount,
      index_size_mb: (fileCount * 0.01), // Simple mock growth
      last_indexed: lastIndexedAt,
    });
  });

  app.get('/api/search', (req, res) => {
    const query = req.query.q as string;
    const extFilter = req.query.ext as string;
    
    let results: any[] = [];
    
    if (query) {
      results = searchIndex.search(query);
      if (extFilter) {
        results = results.filter(res => {
          const doc = searchIndex.getStoredFields(res.id);
          return (doc as any).extension === extFilter;
        });
      }
    } else {
      // No query: return all files or filter by extension
      try {
        const files = fs.readdirSync(INDEX_ROOT);
        files.forEach(file => {
          // ignore dotfiles
          if (file.startsWith('.')) return;
          
          const ext = path.extname(file).slice(1);
          if (!extFilter || ext === extFilter) {
            results.push({ id: file, score: 1.0 });
          }
        });
        // Sort by name or date? Let's do nothing for now or simple sort
        results.sort((a, b) => a.id.localeCompare(b.id));
      } catch (e) {
        console.error("Failed to read directory for search", e);
      }
    }
    
    // Format results and generate snippets
    const formattedResults = results.slice(0, 50).map((res, i) => {
      // Find a snippet in content
      let storedDoc = searchIndex.getStoredFields(res.id);
      const filePath = path.join(INDEX_ROOT, res.id);
      let content = "";
      let stats: fs.Stats | null = null;
      
      try {
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf8');
          stats = fs.statSync(filePath);
        }
      } catch (e) {
        console.error(`Failed to read ${filePath} for snippet`, e);
      }
      
      const searchTerms = (query || "").toLowerCase().split(' ').filter(t => t.length > 1);
      
      let snippet = "";
      const lowerContent = content.toLowerCase();
      const firstMatchIndex = searchTerms.length > 0 ? lowerContent.indexOf(searchTerms[0]) : 0;
      
      if (firstMatchIndex !== -1 && searchTerms.length > 0) {
        const start = Math.max(0, firstMatchIndex - 40);
        const end = Math.min(content.length, firstMatchIndex + 100);
        snippet = "..." + content.slice(start, end) + "...";
        
        // Basic highlighting
        searchTerms.forEach(term => {
          const escaped = escapeRegExp(term);
          const reg = new RegExp(`(${escaped})`, 'gi');
          snippet = snippet.replace(reg, '<mark class="bg-blue-500/30 text-blue-100 rounded px-1">$1</mark>');
        });
      } else {
        snippet = content.slice(0, 140) + (content.length > 140 ? "..." : "");
      }

      const extension = path.extname(res.id).slice(1);
      const modifiedAt = stats ? stats.mtime.toLocaleDateString() : (storedDoc as any)?.modified_at || "Unknown";
      const size = stats ? `${(stats.size / 1024).toFixed(1)} KB` : (storedDoc as any)?.size || "Unknown";

      return {
        rank: i + 1,
        path: res.id,
        extension: extension,
        score: (res as any).score || 1.0,
        snippet: snippet,
        modified_at: modifiedAt,
        size: size,
      };
    });

    res.json({ results: formattedResults });
  });

  app.delete('/api/delete', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).send('Path required');
    
    const fullPath = path.join(INDEX_ROOT, filePath);
    if (!fullPath.startsWith(INDEX_ROOT)) return res.status(403).send('Forbidden');

    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        res.json({ message: 'File deleted' });
      } else {
        res.status(404).send('File not found');
      }
    } catch (e) {
      res.status(500).send('Error deleting file');
    }
  });

  app.post('/api/clean-duplicates', (req, res) => {
    const hashes: Record<string, string[]> = {};
    const files = fs.readdirSync(INDEX_ROOT);
    let deletedCount = 0;

    files.forEach(file => {
      const fullPath = path.join(INDEX_ROOT, file);
      if (fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath);
        const hash = crypto.createHash('md5').update(content).digest('hex');
        if (!hashes[hash]) hashes[hash] = [];
        hashes[hash].push(fullPath);
      }
    });

    Object.values(hashes).forEach(paths => {
      if (paths.length > 1) {
        // Keep the first one, delete the rest
        for (let i = 1; i < paths.length; i++) {
          try {
            fs.unlinkSync(paths[i]);
            deletedCount++;
          } catch (e) {}
        }
      }
    });

    res.json({ message: `Deleted ${deletedCount} duplicate files.` });
  });

  app.get('/api/read', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).send('Path required');
    
    const fullPath = path.join(INDEX_ROOT, filePath);
    if (!fullPath.startsWith(INDEX_ROOT)) return res.status(403).send('Forbidden');

    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ content });
      } else {
        res.status(404).send('File not found');
      }
    } catch (e) {
      res.status(500).send('Error reading file');
    }
  });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    res.json({ message: 'File uploaded successfully', path: req.file.originalname });
  });

  app.post('/api/open', (req, res) => {
    const { path: filePath } = req.body;
    console.log(`Open requested for: ${filePath}`);
    res.sendStatus(200);
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Server start error:", err);
});
