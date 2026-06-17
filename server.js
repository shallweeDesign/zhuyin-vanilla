#!/usr/bin/env node
// Simple static file server for local development.
// Handles: symlinks, NFC URL normalization (for ê/ü filenames on macOS),
// correct MIME types for audio/svg, CORS headers for LAN access.

const http = require("http");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav":  "audio/wav",
  ".mp3":  "audio/mpeg",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

function localIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

const server = http.createServer((req, res) => {
  try {
    // Decode URL, normalise to NFC (needed for ê/ü on macOS)
    const urlPath = decodeURIComponent(req.url.split("?")[0]).normalize("NFC");
    const filePath = urlPath === "/" ? "/index.html" : urlPath;
    const full = path.join(ROOT, filePath);

    // Resolve symlinks (so ../zhuyin-app/public/… paths work)
    let real;
    try { real = fs.realpathSync(full); }
    catch { res.writeHead(404); res.end("Not found"); return; }

    const stat = fs.statSync(real);
    if (stat.isDirectory()) {
      const idx = path.join(real, "index.html");
      if (fs.existsSync(idx)) { real = idx; }
      else { res.writeHead(403); res.end("Directory listing disabled"); return; }
    }

    const ext  = path.extname(real).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";

    res.writeHead(200, {
      "Content-Type":                mime,
      "Content-Length":              stat.size,
      "Cache-Control":               "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(real).pipe(res);

  } catch (err) {
    res.writeHead(500);
    res.end(err.message);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const ip = localIP();
  console.log(`\n注音小天使 開發伺服器\n`);
  console.log(`  本機: http://localhost:${PORT}`);
  console.log(`  iPad: http://${ip}:${PORT}\n`);
});
