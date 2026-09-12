/*
 * Local HTTPS proxy for phone access with camera.
 *
 * Browsers only allow the camera on HTTPS (or localhost). This serves the
 * Next.js dev app over https://<Mac-IP>:3443 with a self-signed certificate,
 * so a phone on the same Wi-Fi gets a secure context after accepting the
 * certificate warning once.
 *
 * Generate the certificate first (once per machine):
 *   openssl req -x509 -newkey rsa:2048 -nodes -keyout scripts/certs/key.pem \
 *     -out scripts/certs/cert.pem -days 825 -subj "/CN=<Mac-IP>" \
 *     -config <(echo "[req]"; echo "distinguished_name=dn"; echo "x509_extensions=v3"; \
 *     echo "[dn]"; echo "[v3]"; echo "subjectAltName=IP:<Mac-IP>,DNS:localhost")
 *
 * Run: node scripts/https-proxy.mjs   (app must be running on :3000)
 */

import https from "node:https";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3443;
const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 3000;

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(dir, "certs", "key.pem")),
    cert: fs.readFileSync(path.join(dir, "certs", "cert.pem")),
  },
  (req, res) => {
    const proxy = http.request(
      {
        host: TARGET_HOST,
        port: TARGET_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("App not running on port 3000");
    });
    req.pipe(proxy);
  },
);

// Pass WebSocket upgrades through (Next.js HMR), so the dev client stays quiet.
server.on("upgrade", (req, socket, head) => {
  const headerLines = Object.entries(req.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTPS proxy on https://0.0.0.0:${PORT} -> http://localhost:${TARGET_PORT}`);
});
