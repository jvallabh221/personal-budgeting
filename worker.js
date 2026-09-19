import { proxyChat } from "./claude-proxy.js";
import { proxyVerse } from "./verse-proxy.js";

const ROUTES = {
  "/api/chat": proxyChat,
  "/api/verse": proxyVerse,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (handler) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        });
      }
      if (request.method !== "POST") {
        return Response.json({ ok: false, reason: "error", message: "Use POST." }, { status: 405 });
      }
      try {
        const payload = await request.json();
        const result = await handler(payload);
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
      } catch (err) {
        return Response.json(
          { ok: false, reason: "error", message: err.message || "Proxy failed." },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }
    return env.ASSETS.fetch(request);
  },
};
