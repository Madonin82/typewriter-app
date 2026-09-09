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
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip'
};

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
  if (['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf'].includes(ext)) {
    return {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    };
  }

  return {
    'Cache-Control': 'no-cache, must-revalidate'
  };
}

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];
  let safePath = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, '');
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
