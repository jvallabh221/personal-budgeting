import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, "index.html"), path.join(dist, "index.html"));
fs.writeFileSync(
  path.join(dist, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer

/index.html
  Cache-Control: no-store

/
  Cache-Control: no-store
`
);
fs.writeFileSync(
  path.join(dist, ".assetsignore"),
  `server.mjs
serve.json
claude-proxy.js
functions
scripts
wrangler.toml
package.json
node_modules
.git
`
);

console.log("Cloudflare assets ready in dist/");
