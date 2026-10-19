/** Pure-JS binary/text helpers that work on Hermes and web. */

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const len = clean.length;
  let padding = 0;
  if (len >= 1 && clean[len - 1] === "=") padding++;
  if (len >= 2 && clean[len - 2] === "=") padding++;
  const byteLen = (len / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLen);
  let byteIndex = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_CHARS.indexOf(clean[i]);
    const b = B64_CHARS.indexOf(clean[i + 1]);
    const c = clean[i + 2] === "=" ? 0 : B64_CHARS.indexOf(clean[i + 2]);
    const d = clean[i + 3] === "=" ? 0 : B64_CHARS.indexOf(clean[i + 3]);
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (byteIndex < byteLen) bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (byteIndex < byteLen) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (byteIndex < byteLen) bytes[byteIndex++] = chunk & 0xff;
  }
  return bytes;
}

/** Decode a Uint8Array as UTF-8, tolerating invalid sequences. */
export function utf8Decode(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out.push(String.fromCharCode(b0));
      i += 1;
    } else if (b0 >= 0xc2 && b0 <= 0xdf && i + 1 < n) {
      out.push(String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f)));
      i += 2;
    } else if (b0 >= 0xe0 && b0 <= 0xef && i + 2 < n) {
      out.push(
        String.fromCharCode(((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)),
      );
      i += 3;
    } else if (b0 >= 0xf0 && b0 <= 0xf4 && i + 3 < n) {
      let cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      cp -= 0x10000;
      out.push(String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)));
      i += 4;
    } else {
      i += 1;
    }
  }
  return out.join("");
}

/** Interpret bytes as latin-1 (one char per byte) — used for scanning PDF structure. */
export function latin1Decode(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join("");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  middot: "\u00b7",
  bull: "\u2022",
  laquo: "\u00ab",
  raquo: "\u00bb",
  times: "\u00d7",
  eacute: "\u00e9",
  egrave: "\u00e8",
  agrave: "\u00e0",
  ccedil: "\u00e7",
  uuml: "\u00fc",
  ouml: "\u00f6",
  auml: "\u00e4",
  szlig: "\u00df",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  sect: "\u00a7",
  para: "\u00b6",
  plusmn: "\u00b1",
  frac12: "\u00bd",
  rarr: "\u2192",
  larr: "\u2190",
  darr: "\u2193",
  uarr: "\u2191",
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 ? safeFromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 ? safeFromCodePoint(cp) : "";
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, (match, name: string) => {
      const lower = name.toLowerCase();
      return NAMED_ENTITIES[lower] ?? match;
    });
}

function safeFromCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function slugifyFilename(title: string): string {
  const slug = title
    .trim()
    .replace(/[\\/:*?"<>|#^[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return slug.length > 0 ? slug : "untitled";
}

export function formatBytes(size: number | null): string {
  if (size == null || !Number.isFinite(size)) return "unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
