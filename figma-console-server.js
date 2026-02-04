#!/usr/bin/env node
/**
 * CodeFig console bridge server.
 * Listens on http://localhost:8765 and appends POST body to figma-console.log.
 * Run with: npm run dev (included) or npm run dev:figma-console-server (standalone)
 * GET / or GET /log returns the log. Log file is readable by the agent during dev; prepare script keeps it out of git.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const LOG_FILE = path.join(__dirname, 'figma-console.log');

const server = http.createServer((req, res) => {
  // GET / or /log: serve log file so you can curl it; agent reads terminal output (no file access needed)
  if (req.method === 'GET' && (req.url === '/' || req.url === '/log')) {
    try {
      const content = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error reading log: ' + err.message);
    }
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed\n');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    try {
      fs.appendFileSync(LOG_FILE, body, 'utf8');
    } catch (err) {
      console.error('Failed to append to', LOG_FILE, err.message);
    }
    res.writeHead(204);
    res.end();
  });
});

server.listen(PORT, () => {
  console.log('CodeFig console bridge listening on http://localhost:' + PORT);
  console.log('Log file:', LOG_FILE);
});
