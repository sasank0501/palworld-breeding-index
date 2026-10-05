// Static server for the spike: serves the published bundle with the right MIME
// types (browsers refuse .wasm served as anything but application/wasm).
//   node serve.mjs bin/Release/net10.0/publish/wwwroot 5190
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2], port = +process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.dat': 'application/octet-stream' };
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] ?? 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    res.end(data);
  });
}).listen(port, () => console.log('serving', root, 'on', port));
