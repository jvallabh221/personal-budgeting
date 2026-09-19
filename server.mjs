import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { proxyChat } from "./claude-proxy.js";
import { proxyVerse } from "./verse-proxy.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PREFERRED_PORT = Number(process.env.PORT || 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8" });
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let file = decodeURIComponent(url.pathname);
  if (file === "/") file = "/index.html";
  if (file.includes("..")) {
    send(res, 400, "Bad path");
    return;
  }
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const payload = JSON.parse(await readBody(req) || "{}");
      const result = await proxyChat(payload);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 200, { ok: false, reason: "error", message: err.message || "Proxy failed." });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/verse") {
    try {
      const payload = JSON.parse(await readBody(req) || "{}");
      const result = await proxyVerse(payload);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 200, { ok: false, reason: "error", message: err.message || "Verse lookup failed." });
    }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }
  serveStatic(req, res);
});

function listen(port) {
  const onError = (err) => {
    if (err.code === "EADDRINUSE" && port === PREFERRED_PORT) {
      server.removeListener("listening", onListening);
      listen(5180);
      return;
    }
    console.error(err);
    process.exit(1);
  };
  const onListening = () => {
    server.removeListener("error", onError);
    console.log(`Budget app at http://127.0.0.1:${port}/?v=32`);
  };
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(port, "127.0.0.1");
}

listen(PREFERRED_PORT);
