const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.m4v': 'video/x-m4v',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
};

const DEFAULT_ARTWORKS = [
  {
    id: 'art-1',
    title: 'Diorama Room',
    artist: 'Annie',
    year: '2026',
    medium: 'Interactive 3D Room',
    type: 'html',
    url: 'public/diorama-room.html',
    isDefault: true
  },
  {
    id: 'art-2',
    title: 'Night Nook',
    artist: 'Jessika',
    year: '2026',
    medium: 'Interactive Night Scene',
    type: 'html',
    url: 'public/night-nook.html',
    isDefault: true
  },
  {
    id: 'art-3',
    title: 'Night Nook 3D',
    artist: 'Jessika',
    year: '2026',
    medium: 'Interactive 3D Spatial',
    type: 'html',
    url: 'public/night-nook-3d.html',
    isDefault: true
  },
  {
    id: 'art-4',
    title: 'Composition Study',
    artist: 'Gallery Archive',
    year: '2026',
    medium: 'Digital Art on Canvas',
    type: 'image',
    url: 'public/527ea5ef-5a3c-46c7-b2d1-a542186f901e.jpg',
    isDefault: true
  }
];

const DATA_FILE = path.join(__dirname, 'gallery-data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function isLocalArtworkUrl(url) {
  return typeof url === 'string' && url.length > 0 &&
    !/^(https?:|data:|blob:)/i.test(url);
}

function artworkFileExists(art) {
  if (!art || !isLocalArtworkUrl(art.url)) return true; // remote/data URLs can't be verified; keep
  try {
    const filePath = path.join(__dirname, art.url);
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
}

// Drops registry entries whose local file no longer exists (e.g. deleted
// outside the curator) and persists the pruned list, so gallery-data.json
// can never point at missing files.
function pruneMissingArtworks(artworks) {
  const kept = artworks.filter(artworkFileExists);
  const dropped = artworks.length - kept.length;
  if (dropped > 0) {
    console.log(`Pruned ${dropped} gallery entr${dropped === 1 ? 'y' : 'ies'} with missing files from gallery-data.json`);
  }
  return kept;
}

function getStoredArtworks() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        const pruned = pruneMissingArtworks(parsed);
        if (pruned.length !== parsed.length) {
          saveStoredArtworks(pruned);
        }
        return pruned;
      }
      return parsed;
    }
  } catch (err) {
    console.error('Error reading gallery data:', err);
  }
  return DEFAULT_ARTWORKS;
}

function saveStoredArtworks(artworks) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(artworks, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing gallery data:', err);
    return false;
  }
}

function getCacheHeaders(filePath, ext) {
  const fileName = path.basename(filePath).toLowerCase();
  
  // 1. Service Worker MUST NEVER be cached by browser HTTP cache
  if (fileName === 'sw.js') {
    return {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  // 2. HTML navigation entrypoints: must revalidate to prevent stale shell
  if (ext === '.html') {
    return {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  // 3. Application Scripts, CSS, and Manifest: must revalidate with server
  if (ext === '.js' || ext === '.css' || ext === '.json' || ext === '.webmanifest') {
    return {
      'Cache-Control': 'no-cache, must-revalidate'
    };
  }

  // 4. Static media, icons, and fonts: cached with stale-while-revalidate
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'].includes(ext)) {
    return {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    };
  }

  return {
    'Cache-Control': 'no-cache, must-revalidate'
  };
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ─── API: /api/gallery ───────────────────────────────────
  if (pathname === '/api/gallery') {
    if (req.method === 'GET') {
      const artworks = getStoredArtworks();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end(JSON.stringify({ success: true, artworks }));
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 50 * 1024 * 1024) { // 50MB max upload
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
        }
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const { title, artist, year, medium, description, type, fileBase64, fileName, directUrl } = payload;

          let finalUrl = directUrl || '';

          if (fileBase64 && fileName) {
            ensureUploadsDir();
            let defaultExt = '.png';
            if (type === 'html') defaultExt = '.html';
            else if (type === 'model') defaultExt = '.glb';
            else if (type === 'video') defaultExt = '.mp4';

            const ext = path.extname(fileName).toLowerCase() || defaultExt;
            const sanitizedBase = path.basename(fileName, ext).replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
            const uniqueName = `${Date.now()}_${sanitizedBase}${ext}`;
            const targetPath = path.join(UPLOADS_DIR, uniqueName);

            // Strip data:mime/type;base64, prefix if present
            const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
            fs.writeFileSync(targetPath, Buffer.from(cleanBase64, 'base64'));
            finalUrl = `public/uploads/${uniqueName}`;
          }

          if (!finalUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'No artwork file or URL provided' }));
          }

          const currentList = getStoredArtworks();
          const cleanTitle = (title && title.trim()) ? title.trim() : 'Untitled';
          const cleanArtist = (artist && artist.trim()) ? artist.trim() : '';
          
          let resolvedType = 'image';
          if (type === 'html') resolvedType = 'html';
          else if (type === 'model') resolvedType = 'model';
          else if (type === 'video') resolvedType = 'video';

          let defaultMedium = 'Digital Artwork';
          if (resolvedType === 'html') defaultMedium = 'Interactive 3D Scene';
          else if (resolvedType === 'model') defaultMedium = '3D Model';
          else if (resolvedType === 'video') defaultMedium = 'Video Artwork';

          const newArtwork = {
            id: `art-${Date.now()}`,
            title: cleanTitle,
            artist: cleanArtist,
            year: (year || '').toString().trim(),
            medium: (medium && medium.trim()) ? medium.trim() : defaultMedium,
            description: (description || '').trim(),
            type: resolvedType,
            url: finalUrl,
            createdAt: new Date().toISOString(),
            isCustom: true
          };

          currentList.push(newArtwork);
          saveStoredArtworks(currentList);

          res.writeHead(201, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          return res.end(JSON.stringify({ success: true, artwork: newArtwork, artworks: currentList }));
        } catch (err) {
          console.error('Failed to create artwork:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Internal server error processing artwork' }));
        }
      });
      return;
    }
  }

  // ─── API: /api/gallery/:id (PUT & DELETE) ──────────────────────
  if (pathname.startsWith('/api/gallery/')) {
    const artId = pathname.replace('/api/gallery/', '').trim();

    if (req.method === 'PUT') {
      if (!artId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Artwork ID required' }));
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 50 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
        }
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const currentList = getStoredArtworks();
          const artIndex = currentList.findIndex(a => a.id === artId);

          if (artIndex === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Artwork not found' }));
          }

          const existing = currentList[artIndex];
          let updatedUrl = existing.url;

          if (payload.fileBase64 && payload.fileName) {
            ensureUploadsDir();
            let defaultExt = '.png';
            if (payload.type === 'html') defaultExt = '.html';
            else if (payload.type === 'model') defaultExt = '.glb';
            else if (payload.type === 'video') defaultExt = '.mp4';

            const ext = path.extname(payload.fileName).toLowerCase() || defaultExt;
            const sanitizedBase = path.basename(payload.fileName, ext).replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
            const uniqueName = `${Date.now()}_${sanitizedBase}${ext}`;
            const targetPath = path.join(UPLOADS_DIR, uniqueName);
            const cleanBase64 = payload.fileBase64.replace(/^data:[^;]+;base64,/, '');
            fs.writeFileSync(targetPath, Buffer.from(cleanBase64, 'base64'));
            updatedUrl = `public/uploads/${uniqueName}`;
          } else if (payload.url) {
            updatedUrl = payload.url.trim();
          }

          let updatedType = existing.type;
          if (['html', 'model', 'video', 'image'].includes(payload.type)) {
            updatedType = payload.type;
          }

          const updatedArtwork = {
            ...existing,
            title: payload.title !== undefined ? payload.title.trim() || 'Untitled' : existing.title,
            artist: payload.artist !== undefined ? payload.artist.trim() : existing.artist,
            year: payload.year !== undefined ? payload.year.toString().trim() : existing.year,
            medium: payload.medium !== undefined ? payload.medium.trim() : existing.medium,
            description: payload.description !== undefined ? payload.description.trim() : existing.description,
            type: updatedType,
            url: updatedUrl,
            updatedAt: new Date().toISOString()
          };

          currentList[artIndex] = updatedArtwork;
          saveStoredArtworks(currentList);

          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          return res.end(JSON.stringify({ success: true, artwork: updatedArtwork, artworks: currentList }));
        } catch (err) {
          console.error('Failed to update artwork:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Internal server error updating artwork' }));
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      if (!artId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Artwork ID required' }));
      }

      const currentList = getStoredArtworks();
      const targetArt = currentList.find(a => a.id === artId);

      // If uploaded file, try to clean up
      if (targetArt && targetArt.url && targetArt.url.startsWith('public/uploads/')) {
        try {
          const filePath = path.join(__dirname, targetArt.url);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.warn('Could not delete upload file:', e);
        }
      }

      const updatedList = currentList.filter(a => a.id !== artId);
      saveStoredArtworks(updatedList);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end(JSON.stringify({ success: true, artworks: updatedList }));
    }
  }

  // ─── STATIC FILE SERVING ──────────────────────────────────
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      // Fallback to index.html for SPA routes or directory root
      const indexPath = path.join(__dirname, 'index.html');
      fs.stat(indexPath, (indexStatErr, indexStats) => {
        if (indexStatErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 Not Found');
        }

        const etag = `W/"${indexStats.size}-${indexStats.mtimeMs}"`;
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { 'ETag': etag, ...getCacheHeaders(indexPath, '.html') });
          return res.end();
        }

        fs.readFile(indexPath, (readErr, indexData) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('500 Internal Server Error');
          }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'ETag': etag,
            ...getCacheHeaders(indexPath, '.html')
          });
          res.end(indexData);
        });
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const etag = `W/"${stats.size}-${stats.mtimeMs}"`;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        ...getCacheHeaders(filePath, ext)
      });
      return res.end();
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('500 Internal Server Error');
      }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'ETag': etag,
        ...getCacheHeaders(filePath, ext)
      });
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Note to Self running at http://0.0.0.0:${PORT}`);
});
