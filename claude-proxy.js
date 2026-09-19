export function classifyAnthropicError(status, body) {
  const err = body?.error || {};
  const text = `${err.type || ""} ${err.message || ""} ${err.details?.error_code || ""}`.toLowerCase();
  if (err.details?.error_code === "enforced_spend_limit_reached") return "exhausted";
  if (status === 401 || status === 403) return "invalid";
  if (status === 402 || /credit balance|too low|billing_error|insufficient/.test(text)) return "exhausted";
  if (status === 429 && /spend|usage limit|threshold|credit/.test(text)) return "exhausted";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "overloaded";
  return "error";
}

function apiMessages(messages) {
  return (messages || []).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: Array.isArray(row.content) ? row.content : String(row.content || ""),
  }));
}

export async function proxyChat(payload) {
  const apiKey = String(payload.apiKey || "").trim();
  if (!apiKey) return { ok: false, reason: "invalid", message: "Missing API key." };
  const model = String(payload.model || "claude-sonnet-4-6").trim();
  const messages = apiMessages(payload.messages);
  if (!messages.length) return { ok: false, reason: "error", message: "No messages." };

  const body = {
    model,
    max_tokens: Math.min(4096, Number(payload.maxTokens) || 2048),
    system: payload.system || "",
    messages,
  };
  if (Array.isArray(payload.tools) && payload.tools.length) body.tools = payload.tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  let parsed = {};
  try {
    parsed = await res.json();
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: classifyAnthropicError(res.status, parsed),
      status: res.status,
      message: parsed?.error?.message || `Claude returned ${res.status}.`,
    };
  }

  const content = parsed.content || [];
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return {
    ok: true,
    text,
    content,
    stop_reason: parsed.stop_reason || "",
    model: parsed.model || model,
  };
}
