import { proxyChat } from "../../claude-proxy.js";

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const result = await proxyChat(payload);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json(
      { ok: false, reason: "error", message: err.message || "Proxy failed." },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}
