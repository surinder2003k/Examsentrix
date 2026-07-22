const { createServer } = require('http');
const next = require('next');
const httpProxy = require('http-proxy');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port, dir: path.join(__dirname) });
const handle = app.getRequestHandler();

const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:3001',
  changeOrigin: true,
  ws: true,
});

proxy.on('error', (err, req, res) => {
  console.error('[Proxy] Error:', err.message);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  }
});

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = req.url.split('?')[0];

      // Proxy /socket.io/* and /api/* to backend
      if (pathname.startsWith('/socket.io') || pathname.startsWith('/api')) {
        return proxy.web(req, res);
      }

      // Everything else goes to Next.js
      await handle(req, res);
    } catch (err) {
      console.error('[Server] Error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Handle WebSocket upgrades for socket.io
  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url.split('?')[0];
    if (pathname.startsWith('/socket.io')) {
      proxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
