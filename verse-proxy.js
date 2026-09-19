const API = "https://api.youversion.com/v1";

// YouVersion gives the day's passage id, then the text comes from a Bible version.
export const BIBLE_VERSIONS = [
  { id: 3034, label: "BSB — Berean Standard Bible" },
  { id: 206, label: "WEBUS — World English Bible" },
  { id: 12, label: "ASV — American Standard Version" },
  { id: 111, label: "NIV — New International Version" },
];

const BOOKS = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalm",
  PRO: "Proverbs", ECC: "Ecclesiastes", SNG: "Song of Songs", ISA: "Isaiah",
  JER: "Jeremiah", LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea",
  JOL: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAM: "Nahum",
  HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi",
  MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Romans",
  "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians",
  PHP: "Philippians", COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews",
  JAS: "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John",
  "3JN": "3 John", JUD: "Jude", REV: "Revelation",
};

export function referenceFromPassageId(passageId) {
  const [book, chapter, verse] = String(passageId || "").split(".");
  const name = BOOKS[book] || book || "";
  if (!name) return String(passageId || "");
  if (!chapter) return name;
  return verse ? `${name} ${chapter}:${verse}` : `${name} ${chapter}`;
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// The passages payload is not documented, so accept the shapes it might use.
export function extractText(payload) {
  const seen = new Set();
  const keys = ["content", "text", "body", "value"];
  const walk = (node, depth) => {
    if (!node || depth > 6) return "";
    if (typeof node === "string") return stripTags(node);
    if (Array.isArray(node)) {
      return node.map((item) => walk(item, depth + 1)).filter(Boolean).join(" ").trim();
    }
    if (typeof node !== "object" || seen.has(node)) return "";
    seen.add(node);
    for (const key of keys) {
      if (typeof node[key] === "string" && stripTags(node[key])) return stripTags(node[key]);
    }
    for (const key of ["data", "passage", "passages", "verses", "items"]) {
      if (node[key]) {
        const found = walk(node[key], depth + 1);
        if (found) return found;
      }
    }
    return "";
  };
  return walk(payload, 0);
}

export function dayOfYear(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86400000) + 1;
}

async function getJson(url, appKey) {
  const res = await fetch(url, {
    headers: { "x-yvp-app-key": appKey, accept: "application/json" },
  });
  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, raw };
}

function failure(status, body) {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "invalid", message: "YouVersion rejected that app key." };
  }
  if (status === 429) {
    return { ok: false, reason: "rate_limited", message: "YouVersion is rate limiting. Try later." };
  }
  const detail = body?.message || body?.error || body?.fault?.faultstring || "";
  return { ok: false, reason: "error", message: detail || `YouVersion returned ${status}.` };
}

export async function proxyVerse(payload = {}) {
  const appKey = String(payload.appKey || "").trim();
  if (!appKey) return { ok: false, reason: "invalid", message: "Missing YouVersion app key." };

  const day = Math.min(366, Math.max(1, Number(payload.day) || dayOfYear()));
  const versionId = Number(payload.versionId) || 3034;

  const votd = await getJson(`${API}/verse_of_the_days/${day}`, appKey);
  if (votd.status < 200 || votd.status >= 300) return failure(votd.status, votd.body);

  const record = votd.body?.data ?? votd.body;
  const passageId = String((Array.isArray(record) ? record[0] : record)?.passage_id || "").trim();
  if (!passageId) return { ok: false, reason: "error", message: "No verse listed for today." };

  const passage = await getJson(`${API}/bibles/${versionId}/passages/${passageId}`, appKey);
  if (passage.status < 200 || passage.status >= 300) return failure(passage.status, passage.body);

  const text = extractText(passage.body);
  if (!text) return { ok: false, reason: "error", message: "Could not read the verse text." };

  return {
    ok: true,
    day,
    passageId,
    reference: referenceFromPassageId(passageId),
    text,
    versionId,
  };
}
