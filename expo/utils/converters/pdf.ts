import { inflate } from "pako";

import { base64ToUint8Array, latin1Decode } from "@/utils/encoding";

/**
 * Local PDF text extraction with structured Markdown output.
 *
 * Pipeline:
 * 1. Collect and inflate content/CMap streams.
 * 2. Build per-font ToUnicode CMaps (resolving indirect /Font references).
 * 3. Extract positioned text spans (X, Y, font, size, text) from content streams.
 * 4. Convert spans to structured Markdown (headings, tables, lists, checkboxes).
 *
 * Scanned PDFs (pure images) have no text layer and yield empty output.
 */
export function extractPdfText(base64: string): { text: string; title: string | null } {
  const bytes = base64ToUint8Array(base64);
  const raw = latin1Decode(bytes);

  const streams = collectStreams(raw, bytes);

  let searchable = raw;
  for (const s of streams) {
    if (s.isObjStm) searchable += `\n${s.content}`;
  }

  const title = extractPdfTitle(searchable);
  const fontMaps = buildFontMaps(searchable, streams);

  const allSpans: Span[] = [];
  let pageNum = 0;
  for (const stream of streams) {
    if (stream.isObjStm) continue;
    if (!/\b(Tj|TJ|BT)\b/.test(stream.content)) continue;
    const spans = extractStructuredSpans(stream.content, fontMaps, pageNum);
    allSpans.push(...spans);
    if (spans.length > 0) pageNum++;
  }

  if (allSpans.length === 0) {
    return { text: "", title };
  }

  const { text, detectedTitle } = spansToMarkdown(allSpans);
  // One line per conversion — lets runtime logs confirm which extractor build is live.
  console.log(`[pdf] extractor v3: ${allSpans.length} spans, ${pageNum} pages, ${text.length} chars`);
  return { text, title: title || detectedTitle };
}

// ===== Types =====

interface PdfStream {
  objNum: number | null;
  dict: string;
  content: string;
  isObjStm: boolean;
}

interface CMap {
  codeLen: number;
  map: Map<number, string>;
}

interface FontInfo {
  baseFont: string;
  isBold: boolean;
  isItalic: boolean;
}

interface FontMaps {
  byName: Map<string, CMap>;
  merged: CMap | null;
  fontInfo: Map<string, FontInfo>;
}

interface Span {
  page: number;
  x: number;
  y: number;
  fontName: string;
  fontSize: number;
  text: string;
  isBold: boolean;
  isItalic: boolean;
}

interface LineSpan {
  x: number;
  text: string;
  isBold: boolean;
  isItalic: boolean;
  fontSize: number;
}

interface Line {
  page: number;
  y: number;
  spans: LineSpan[];
}

// ===== Stream Collection =====

function collectStreams(raw: string, bytes: Uint8Array): PdfStream[] {
  const streams: PdfStream[] = [];
  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(raw)) !== null) {
    const dataStart = match.index + match[0].length;

    const objIndex = raw.lastIndexOf("obj", match.index);
    const dictStart = objIndex === -1 ? Math.max(0, match.index - 600) : objIndex;
    const dict = raw.slice(dictStart, match.index);

    let objNum: number | null = null;
    if (objIndex !== -1) {
      const numMatch = raw.slice(Math.max(0, objIndex - 24), objIndex).match(/(\d+)\s+\d+\s*$/);
      if (numMatch) objNum = parseInt(numMatch[1], 10);
    }

    // Parse /Length — try indirect reference first, then direct integer.
    // Critical: compressed stream data can contain "endstream" or "stream\n"
    // byte sequences, so relying on endstream/indexOf truncates streams
    // prematurely and causes inflation failures (dropping entire pages).
    let declaredLength: number | null = null;
    const indirectLen = dict.match(/\/Length\s+(\d+)\s+\d+\s+R/);
    if (indirectLen) {
      const lenObjNum = parseInt(indirectLen[1], 10);
      const lenObjMatch = raw.match(new RegExp(`\\b${lenObjNum}\\s+\\d+\\s+obj\\s+(\\d+)`));
      if (lenObjMatch) declaredLength = parseInt(lenObjMatch[1], 10);
    } else {
      const directLen = dict.match(/\/Length\s+(\d+)/);
      if (directLen) declaredLength = parseInt(directLen[1], 10);
    }

    const endstreamPos = raw.indexOf("endstream", dataStart);

    // Skip image/font streams — advance regex past their data.
    // Critical: advance past the "endstream" keyword itself. Landing on it
    // makes the regex match "stream\n" inside "endstream\n", which re-triggers
    // the skip and jumps forward a second time by the full stream length —
    // vaulting over legitimate streams that follow (e.g. ToUnicode CMaps).
    if (/\/Subtype\s*\/Image/.test(dict) || /\/FontFile/.test(dict) || /\/DCTDecode/.test(dict)) {
      if (declaredLength !== null) {
        const estEnd = raw.indexOf("endstream", dataStart + declaredLength);
        streamRegex.lastIndex = estEnd !== -1 ? estEnd + 9 : dataStart + declaredLength + 1;
      } else if (endstreamPos !== -1) {
        streamRegex.lastIndex = endstreamPos + 9;
      } else {
        streamRegex.lastIndex = dataStart + 1;
      }
      continue;
    }

    // Build candidate data end positions.
    // Length-based is authoritative when available; endstream-based is fallback.
    const candidates: number[] = [];
    if (declaredLength !== null) {
      const lengthEnd = dataStart + declaredLength;
      if (lengthEnd > dataStart && lengthEnd <= bytes.length) candidates.push(lengthEnd);
    }
    if (endstreamPos !== -1) {
      let trimmedEnd = endstreamPos;
      while (trimmedEnd > dataStart && (raw[trimmedEnd - 1] === "\n" || raw[trimmedEnd - 1] === "\r")) trimmedEnd--;
      if (trimmedEnd > dataStart && trimmedEnd !== candidates[0]) candidates.push(trimmedEnd);
    }
    if (candidates.length === 0) {
      streamRegex.lastIndex = endstreamPos !== -1 ? endstreamPos + 9 : dataStart + 1;
      continue;
    }

    const isFlate = /\/FlateDecode/.test(dict);
    const isAscii85 = /\/ASCII85Decode/.test(dict);
    const isAsciiHex = /\/ASCIIHexDecode/.test(dict);
    const hasFilter = /\/Filter/.test(dict);
    const isObjStm = /\/Type\s*\/ObjStm/.test(dict);

    let content: string | null = null;

    for (const candEnd of candidates) {
      const streamBytes = bytes.subarray(dataStart, candEnd);
      if (streamBytes.length === 0 || streamBytes.length > 8 * 1024 * 1024) continue;

      let data: Uint8Array | null = streamBytes;
      if (isAscii85 && data) data = ascii85Decode(data);
      else if (isAsciiHex && data) data = asciiHexDecode(data);

      if (isFlate) {
        if (data) {
          try {
            const inflated = inflate(data);
            if (inflated.length < 16 * 1024 * 1024) {
              content = latin1Decode(inflated);
              break;
            }
          } catch {
            // Try next candidate boundary
          }
        }
      } else if (isAscii85 || isAsciiHex) {
        if (data) { content = latin1Decode(data); break; }
      } else if (!hasFilter) {
        content = latin1Decode(streamBytes);
        break;
      }
    }

    if (content !== null) {
      streams.push({ objNum, dict, content, isObjStm });
    }

    // Advance regex past stream data to avoid false "stream" matches in compressed bytes.
    if (declaredLength !== null) {
      const estEnd = raw.indexOf("endstream", dataStart + declaredLength);
      streamRegex.lastIndex = estEnd !== -1 ? estEnd + 9 : dataStart + declaredLength + 1;
    } else if (endstreamPos !== -1) {
      streamRegex.lastIndex = endstreamPos + 9;
    } else {
      streamRegex.lastIndex = dataStart + 1;
    }
  }
  return streams;
}

// ===== Font Map Building (FIXED: resolves indirect /Font N N R) =====

function buildFontMaps(searchable: string, _streams: PdfStream[]): FontMaps {
  // 1. Parse every CMap stream keyed by object number.
  const cmapByObj = new Map<number, CMap>();
  const allCmaps: CMap[] = [];
  for (const stream of _streams) {
    if (!/begin(bfchar|bfrange)/.test(stream.content)) continue;
    const cmap = parseCMap(stream.content);
    if (cmap.map.size === 0) continue;
    allCmaps.push(cmap);
    if (stream.objNum !== null) cmapByObj.set(stream.objNum, cmap);
  }

  // 2. Font object number → ToUnicode object number + font metadata.
  const fontToCmapObj = new Map<number, number>();
  const fontInfoByObj = new Map<number, FontInfo>();
  const fontObjRegex = /(\d+)\s+\d+\s+obj\s*<<([\s\S]{0,2000}?)>>/g;
  let fm: RegExpExecArray | null;
  while ((fm = fontObjRegex.exec(searchable)) !== null) {
    const body = fm[2];
    if (!/\/Type\s*\/Font/.test(body)) continue;
    const tu = body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (tu) fontToCmapObj.set(parseInt(fm[1], 10), parseInt(tu[1], 10));

    const bf = body.match(/\/BaseFont\s*\/([^\s\/]+)/);
    if (bf) {
      const baseFont = bf[1].replace(/^[A-Z]{6}\+/, "");
      fontInfoByObj.set(parseInt(fm[1], 10), {
        baseFont,
        isBold: /Bold|Heavy|Black|Semibold/i.test(baseFont),
        isItalic: /Italic|Oblique/i.test(baseFont),
      });
    }
  }

  // 3. Resource name → CMap and FontInfo.
  //    Handle BOTH inline (/Font << /F1 5 0 R ... >>) and indirect (/Font 4139 0 R).
  const byName = new Map<string, CMap>();
  const fontInfo = new Map<string, FontInfo>();

  // 3a. Inline font dicts.
  const inlineRegex = /\/Font\s*<<([\s\S]{0,1000}?)>>/g;
  let ir: RegExpExecArray | null;
  while ((ir = inlineRegex.exec(searchable)) !== null) {
    parseFontDictEntries(ir[1], fontToCmapObj, cmapByObj, fontInfoByObj, byName, fontInfo);
  }

  // 3b. Indirect font refs: /Font 4139 0 R → resolve object 4139.
  const indirectRegex = /\/Font\s+(\d+)\s+\d+\s+R/g;
  let indir: RegExpExecArray | null;
  while ((indir = indirectRegex.exec(searchable)) !== null) {
    const objNum = parseInt(indir[1], 10);
    const objPattern = `${objNum} 0 obj`;
    const objIdx = searchable.indexOf(objPattern);
    if (objIdx < 0) continue;
    const endIdx = searchable.indexOf("endobj", objIdx);
    if (endIdx < 0) continue;
    const objBody = searchable.slice(objIdx + objPattern.length, endIdx);
    parseFontDictEntries(objBody, fontToCmapObj, cmapByObj, fontInfoByObj, byName, fontInfo);
  }

  // 4. Merged fallback.
  let merged: CMap | null = null;
  if (allCmaps.length > 0) {
    const map = new Map<number, string>();
    let codeLen = allCmaps[0].codeLen;
    for (const c of allCmaps) {
      codeLen = Math.max(codeLen, c.codeLen);
      for (const [k, v] of c.map) if (!map.has(k)) map.set(k, v);
    }
    merged = { codeLen, map };
  }

  return { byName, merged, fontInfo };
}

function parseFontDictEntries(
  body: string,
  fontToCmapObj: Map<number, number>,
  cmapByObj: Map<number, CMap>,
  fontInfoByObj: Map<number, FontInfo>,
  byName: Map<string, CMap>,
  fontInfo: Map<string, FontInfo>,
): void {
  const pairRegex = /(\/[\w.+-]+)\s+(\d+)\s+\d+\s+R/g;
  let pair: RegExpExecArray | null;
  while ((pair = pairRegex.exec(body)) !== null) {
    const resName = pair[1];
    const fontObjNum = parseInt(pair[2], 10);
    const cmapObj = fontToCmapObj.get(fontObjNum);
    if (cmapObj !== undefined) {
      const cmap = cmapByObj.get(cmapObj);
      if (cmap) byName.set(resName, cmap);
    }
    const info = fontInfoByObj.get(fontObjNum);
    if (info) fontInfo.set(resName, info);
  }
}

// ===== CMap Parsing =====

function parseCMap(content: string): CMap {
  const map = new Map<number, string>();
  let codeLen = 1;

  const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let section: RegExpExecArray | null;
  while ((section = bfcharRegex.exec(content)) !== null) {
    const pairRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(section[1])) !== null) {
      const src = pair[1];
      codeLen = Math.max(codeLen, Math.ceil(src.length / 2));
      map.set(parseInt(src, 16), utf16BEHexToString(pair[2]));
    }
  }

  const bfrangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((section = bfrangeRegex.exec(content)) !== null) {
    const body = section[1];
    const simpleRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = simpleRegex.exec(body)) !== null) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      codeLen = Math.max(codeLen, Math.ceil(m[1].length / 2));
      if (hi - lo > 65535) continue;
      const base = utf16BEHexToUnits(m[3]);
      for (let code = lo; code <= hi; code++) {
        const units = base.slice();
        units[units.length - 1] += code - lo;
        map.set(code, String.fromCharCode(...units));
      }
    }
    const arrayRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[((?:\s*<[0-9a-fA-F]+>)+)\s*\]/g;
    while ((m = arrayRegex.exec(body)) !== null) {
      const lo = parseInt(m[1], 16);
      codeLen = Math.max(codeLen, Math.ceil(m[1].length / 2));
      const dsts = m[3].match(/<([0-9a-fA-F]+)>/g) ?? [];
      dsts.forEach((d, idx) => {
        map.set(lo + idx, utf16BEHexToString(d.replace(/[<>]/g, "")));
      });
    }
  }

  return { codeLen, map };
}

// ===== Structured Span Extraction =====

function extractStructuredSpans(content: string, fonts: FontMaps, page: number): Span[] {
  const spans: Span[] = [];
  let curX = 0;
  let curY = 0;
  let curFont = "";
  let curSize = 0;
  let leading = 12;

  // Graphics state (CTM) tracking. Some generators (e.g. Google Docs) write
  // `q 0.75 0 0 -0.75 36 756 cm BT 14.66667 0 0 -14.66667 e f Tm /G1 1 Tf` —
  // the real font size is Tf × Tm.a × |CTM| and the real position is CTM × (e,f).
  let ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const ctmStack: Array<{ a: number; b: number; c: number; d: number; e: number; f: number }> = [];
  let tfSize = 0;
  let tmScale = 1;

  const ctmScaleX = (): number => Math.hypot(ctm.a, ctm.b) || 1;
  const applyCtm = (x: number, y: number): { x: number; y: number } => ({
    x: ctm.a * x + ctm.c * y + ctm.e,
    y: ctm.b * x + ctm.d * y + ctm.f,
  });

  const tokenRegex = new RegExp(
    [
      "(BT)",                                                        // 1
      "(ET)",                                                        // 2
      "([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+TL",                          // 3,4: leading
      "(\\/[\\w.+-]+)\\s+([\\d.]+)\\s+Tf",                           // 5,6: font,size
      "([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+Td",                          // 7,8: position
      "([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+TD",                          // 9,10: position+leading
      "([\\d.\\-]+)\\s+[\\d.\\-]+\\s+[\\d.\\-]+\\s+[\\d.\\-]+\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+Tm", // 11,12,13: Tm (a,e,f)
      "(T\\*)",                                                       // 14
      '\\\(((?:\\\\.|[^\\\\()])*)\\)\\s*(Tj|[\'"])',                  // 15,16: literal string
      '<([0-9a-fA-F\\s]+)>\\s*(Tj|[\'"])',                           // 17,18: hex string
      "\\[((?:\\((?:\\\\.|[^\\\\()])*\\)|<[0-9a-fA-F\\s]*>|[^\\]])*)\\]\\s*TJ", // 19: TJ array
      "([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+([\\d.\\-]+)\\s+cm", // 20-25: cm
      "(?:^|\\s)(q)(?=\\s|$)",                                        // 26: save state
      "(?:^|\\s)(Q)(?=\\s|$)",                                        // 27: restore state
    ].join("|"),
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(content)) !== null) {
    if (match[1] !== undefined) {
      // BT — text matrix resets to identity
      curX = 0; curY = 0; tmScale = 1;
      curSize = tfSize * tmScale * ctmScaleX();
    } else if (match[2] !== undefined) {
      // ET — nothing to do
    } else if (match[3] !== undefined) {
      // TL — set leading
      leading = Math.abs(parseFloat(match[4]));
    } else if (match[5] !== undefined) {
      // Tf — font selection
      curFont = match[5];
      tfSize = parseFloat(match[6]);
      curSize = tfSize * tmScale * ctmScaleX();
    } else if (match[7] !== undefined) {
      // Td — relative move (text space, scaled by text matrix + CTM)
      const scale = tmScale * ctmScaleX();
      curX += parseFloat(match[7]) * scale;
      curY += parseFloat(match[8]) * scale;
    } else if (match[9] !== undefined) {
      // TD — relative move + set leading
      const tx = parseFloat(match[9]);
      const ty = parseFloat(match[10]);
      const scale = tmScale * ctmScaleX();
      curX += tx * scale;
      curY += ty * scale;
      leading = Math.abs(ty) * scale;
    } else if (match[11] !== undefined) {
      // Tm — absolute text matrix (scale from a, position through CTM)
      const a = Math.abs(parseFloat(match[11]));
      tmScale = a > 0.001 ? a : 1;
      const pos = applyCtm(parseFloat(match[12]), parseFloat(match[13]));
      curX = pos.x;
      curY = pos.y;
      curSize = tfSize * tmScale * ctmScaleX();
    } else if (match[14] !== undefined) {
      // T* — next line
      curY -= leading;
    } else if (match[20] !== undefined) {
      // cm — concatenate matrix onto CTM
      const m = {
        a: parseFloat(match[20]), b: parseFloat(match[21]),
        c: parseFloat(match[22]), d: parseFloat(match[23]),
        e: parseFloat(match[24]), f: parseFloat(match[25]),
      };
      ctm = {
        a: m.a * ctm.a + m.b * ctm.c,
        b: m.a * ctm.b + m.b * ctm.d,
        c: m.c * ctm.a + m.d * ctm.c,
        d: m.c * ctm.b + m.d * ctm.d,
        e: m.e * ctm.a + m.f * ctm.c + ctm.e,
        f: m.e * ctm.b + m.f * ctm.d + ctm.f,
      };
    } else if (match[26] !== undefined) {
      // q — save graphics state
      ctmStack.push({ ...ctm });
    } else if (match[27] !== undefined) {
      // Q — restore graphics state
      const restored = ctmStack.pop();
      if (restored) ctm = restored;
    } else if (match[15] !== undefined) {
      // (literal) Tj / ' / "
      const cmap = fonts.byName.get(curFont) ?? fonts.merged;
      const byteChars = String.fromCharCode(...decodePdfStringBytes(match[15]));
      const text = decodeWithCmap(byteChars, cmap);
      pushSpan(spans, page, curX, curY, curFont, curSize, text, fonts);
      if (match[16] === "'" || match[16] === '"') curY -= leading;
    } else if (match[17] !== undefined) {
      // <hex> Tj
      const cmap = fonts.byName.get(curFont) ?? fonts.merged;
      const byteChars = String.fromCharCode(...hexToBytes(match[17]));
      const text = decodeWithCmap(byteChars, cmap);
      pushSpan(spans, page, curX, curY, curFont, curSize, text, fonts);
      if (match[18] === "'" || match[18] === '"') curY -= leading;
    } else if (match[19] !== undefined) {
      // [ ... ] TJ
      const cmap = fonts.byName.get(curFont) ?? fonts.merged;
      const text = extractTJText(match[19], cmap);
      pushSpan(spans, page, curX, curY, curFont, curSize, text, fonts);
    }
  }
  return spans;
}

function pushSpan(
  spans: Span[],
  page: number,
  x: number,
  y: number,
  fontName: string,
  fontSize: number,
  text: string,
  fonts: FontMaps,
): void {
  // Strip control chars but KEEP whitespace — per-glyph PDFs emit explicit
  // space glyphs that carry the word boundaries; dropping them glues words.
  const cleaned = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  if (!cleaned) return;
  const info = fonts.fontInfo.get(fontName);
  spans.push({
    page,
    x,
    y,
    fontName,
    fontSize,
    text: cleaned,
    isBold: info?.isBold ?? false,
    isItalic: info?.isItalic ?? false,
  });
}

function extractTJText(inner: string, cmap: CMap | null): string {
  const parts: string[] = [];
  const strRegex = /\(((?:\\.|[^\\()])*)\)|<([0-9a-fA-F\s]*)>|(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = strRegex.exec(inner)) !== null) {
    if (m[1] !== undefined) {
      const byteChars = String.fromCharCode(...decodePdfStringBytes(m[1]));
      parts.push(decodeWithCmap(byteChars, cmap));
    } else if (m[2] !== undefined) {
      const byteChars = String.fromCharCode(...hexToBytes(m[2]));
      parts.push(decodeWithCmap(byteChars, cmap));
    } else if (m[3] !== undefined) {
      const adjust = parseFloat(m[3]);
      if (adjust < -180) parts.push(" ");
    }
  }
  return parts.join("");
}

// ===== Span to Markdown Conversion =====

function spansToMarkdown(spans: Span[]): { text: string; detectedTitle: string | null } {
  // 1. Group spans into lines per page, then flatten.
  const lines: Line[] = [];
  const pageGroups = new Map<number, Span[]>();
  for (const s of spans) {
    if (!pageGroups.has(s.page)) pageGroups.set(s.page, []);
    pageGroups.get(s.page)!.push(s);
  }
  const sortedPages = [...pageGroups.keys()].sort((a, b) => a - b);
  for (const pg of sortedPages) {
    lines.push(...groupSpansIntoLines(pageGroups.get(pg)!, pg));
  }

  if (lines.length === 0) return { text: "", detectedTitle: null };

  // 2. Determine body font size (most common non-bold size).
  const sizeCounts = new Map<number, number>();
  for (const s of spans) {
    if (!s.isBold) {
      const key = Math.round(s.fontSize);
      sizeCounts.set(key, (sizeCounts.get(key) ?? 0) + 1);
    }
  }
  let bodySize = 9;
  let maxCount = 0;
  for (const [size, count] of sizeCounts) {
    if (count > maxCount) { maxCount = count; bodySize = size; }
  }

  // 3. Determine heading levels from bold font sizes.
  const boldSizes = new Set<number>();
  for (const s of spans) {
    if (s.isBold && s.fontSize > bodySize + 0.5) boldSizes.add(Math.round(s.fontSize));
  }
  const sortedBold = [...boldSizes].sort((a, b) => b - a);
  // Map: size → heading level (1=H1 for title, 2=##, 3=###, 4=####)
  const headingMap = new Map<number, number>();
  sortedBold.forEach((size, idx) => {
    headingMap.set(size, Math.min(idx + 1, 4));
  });

  // 4. Detect title (largest bold heading, first occurrence).
  let detectedTitle: string | null = null;
  let titleLineIdx = -1;
  if (sortedBold.length > 0) {
    const titleSize = sortedBold[0];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const firstSpan = line.spans[0];
      if (Math.round(firstSpan.fontSize) === titleSize && firstSpan.isBold) {
        detectedTitle = line.spans.map((s) => s.text).join(" ").trim();
        titleLineIdx = i;
        break;
      }
    }
  }

  // 5. Process lines into Markdown.
  const output: string[] = [];
  let paragraph: string[] = [];
  let prevY = 0;
  let prevPage = -1;
  let inBulletList = false;
  let inNumberedList = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      output.push(paragraph.join(" "));
      paragraph = [];
    }
  };

  const flushLists = () => {
    inBulletList = false;
    inNumberedList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    if (i === titleLineIdx) continue; // Skip title line

    const line = lines[i];
    const firstSpan = line.spans[0];
    const fullText = line.spans.map((s) => s.text).join(" ").trim();

    if (!fullText) continue;

    // Check for page break
    const pageBreak = line.page !== prevPage;
    const yGap = pageBreak ? 999 : Math.abs(prevY - line.y);
    prevY = line.y;
    prevPage = line.page;

    // Heading?
    const fontSizeKey = Math.round(firstSpan.fontSize);
    if (headingMap.has(fontSizeKey) && firstSpan.isBold) {
      flushParagraph();
      flushLists();
      const level = headingMap.get(fontSizeKey)!;
      if (level === 1) {
        // H1 is added by convert.ts, so use ## for level-1 headings in body
        output.push(`## ${fullText}`);
      } else if (level === 2) {
        output.push(`### ${fullText}`);
      } else if (level === 3) {
        output.push(`#### ${fullText}`);
      } else {
        output.push(`##### ${fullText}`);
      }
      continue;
    }

    // Italic non-body text (like subtitle/description)?
    if (firstSpan.isItalic && !firstSpan.isBold && firstSpan.fontSize > bodySize + 0.5) {
      flushParagraph();
      flushLists();
      output.push(`*${fullText}*`);
      continue;
    }

    // Bullet point (U+F0B7 from OpenSymbol, or ● U+25CF from CID fonts)?
    const bulletMatch = fullText.match(/^\s*[\uF0B7\u25CF]\s*(.*)$/);
    if (bulletMatch && (firstSpan.text.includes("\uF0B7") || firstSpan.text.includes("\u25CF"))) {
      flushParagraph();
      inNumberedList = false;
      inBulletList = true;
      output.push(`- ${bulletMatch[1].trim()}`);
      continue;
    }

    // Checkbox (U+2610 from FreeSerif)?
    if (firstSpan.text.includes("\u2610")) {
      flushParagraph();
      inBulletList = false;
      inNumberedList = false;
      const checkText = line.spans.slice(1).map((s) => s.text).join(" ").trim()
        || firstSpan.text.replace(/\u2610/g, "").trim();
      output.push(`- [ ] ${checkText}`);
      continue;
    }

    // Numbered list item?
    const numberedMatch = fullText.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch && firstSpan.fontSize <= bodySize + 0.5) {
      flushParagraph();
      inBulletList = false;
      inNumberedList = true;
      output.push(`${numberedMatch[1]}. ${numberedMatch[2]}`);
      continue;
    }

    // Continuation of a bullet or numbered list item?
    // (wrapped line that belongs to the previous list item, not a new item)
    // Only apply if the line is indented past the left margin (matching list text position)
    // and is close in Y to the previous line.
    if ((inBulletList || inNumberedList) && !firstSpan.isBold &&
        firstSpan.fontSize <= bodySize + 0.5 &&
        !firstSpan.text.includes("\uF0B7") && !firstSpan.text.includes("\u2610") &&
        firstSpan.x > 55 && yGap < 15 && !pageBreak && output.length > 0) {
      const lastOut = output[output.length - 1];
      const prev = lastOut;
      const isUrlContinuation = prev.includes("http") || fullText.startsWith("%20") ||
        (prev.endsWith("-") && /^%20|https?:/i.test(fullText));
      if (isUrlContinuation) {
        output[output.length - 1] = prev + fullText;
      } else if (prev.endsWith("-")) {
        output[output.length - 1] = prev.slice(0, -1) + fullText;
      } else {
        output[output.length - 1] = prev + " " + fullText;
      }
      continue;
    }

    // Table? (requires 2+ spans at distinct column X positions, both same page)
    // Table header rows may be bold — allow bold if the font size is body-size.
    // Headings (larger bold) are already handled above.
    if (line.spans.length >= 2 && hasTableColumns(line)) {
      const tableResult = tryCollectTable(lines, i, bodySize, headingMap);
      if (tableResult) {
        flushParagraph();
        flushLists();
        output.push(tableResult.markdown);
        i = tableResult.endIdx;
        continue;
      }
    }

    // Body text — join wrapped lines into paragraphs
    if (paragraph.length > 0 && yGap < 15 && !pageBreak) {
      // Continuation of previous paragraph
      const prev = paragraph[paragraph.length - 1];
      const isUrlContinuation = prev.includes("http") || fullText.startsWith("%20") ||
        (prev.endsWith("-") && /^%20|https?:/i.test(fullText));
      if (isUrlContinuation) {
        // URL continuation: join keeping the hyphen (it's part of the URL)
        paragraph[paragraph.length - 1] = prev + fullText;
      } else if (prev.endsWith("-")) {
        // Normal hyphenated word join
        paragraph[paragraph.length - 1] = prev.slice(0, -1) + fullText;
      } else {
        paragraph.push(fullText);
      }
    } else if (paragraph.length > 0 && pageBreak && line.spans[0].x < 60) {
      // Page break but same paragraph (text continues at top of next page)
      const prev = paragraph[paragraph.length - 1];
      const isUrlContinuation = prev.includes("http") || fullText.startsWith("%20") ||
        (prev.endsWith("-") && /^%20|https?:/i.test(fullText));
      if (isUrlContinuation) {
        paragraph[paragraph.length - 1] = prev + fullText;
      } else if (prev.endsWith("-")) {
        paragraph[paragraph.length - 1] = prev.slice(0, -1) + fullText;
      } else {
        paragraph.push(fullText);
      }
    } else {
      // New paragraph
      flushParagraph();
      flushLists();
      paragraph.push(fullText);
    }
  }
  flushParagraph();

  const text = output.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, detectedTitle };
}

function groupSpansIntoLines(pageSpans: Span[], page: number): Line[] {
  const sorted = [...pageSpans].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: Line[] = [];
  let currentLine: Line | null = null;

  for (const span of sorted) {
    if (currentLine && Math.abs(span.y - currentLine.y) <= 3) {
      currentLine.spans.push({
        x: span.x,
        text: span.text,
        isBold: span.isBold,
        isItalic: span.isItalic,
        fontSize: span.fontSize,
      });
    } else {
      currentLine = { page, y: span.y, spans: [] };
      lines.push(currentLine);
      currentLine.spans.push({
        x: span.x,
        text: span.text,
        isBold: span.isBold,
        isItalic: span.isItalic,
        fontSize: span.fontSize,
      });
    }
  }

  // Per-glyph PDFs (e.g. Google Docs exports) emit one Tj per character.
  // Merge those glyph runs back into words so downstream line/table logic
  // sees normal spans instead of letter soup.
  for (const line of lines) {
    line.spans = mergeGlyphSpans(line.spans);
  }

  return lines;
}

/**
 * True when a line looks like per-glyph output: many spans, nearly all
 * single characters (explicit space glyphs are also single chars).
 */
function isGlyphLine(spans: LineSpan[]): boolean {
  if (spans.length < 6) return false;
  const visible = spans.filter((s) => s.text.trim().length > 0);
  if (visible.length < 4) return false;
  let totalLen = 0;
  for (const s of visible) totalLen += s.text.trim().length;
  return totalLen / visible.length <= 1.6;
}

/**
 * Merges tightly-spaced adjacent spans into words. Only applies direct
 * concatenation on glyph-mode lines; ordinary lines keep span boundaries
 * (they are joined with spaces downstream).
 */
function mergeGlyphSpans(spans: LineSpan[]): LineSpan[] {
  if (!isGlyphLine(spans)) {
    return spans
      .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ") }))
      .filter((s) => s.text.trim().length > 0);
  }

  const merged: LineSpan[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const fs = Math.max(prev.fontSize, span.fontSize) || 10;
      const estWidth = estimateTextWidth(prev.text, prev.fontSize, prev.isBold);
      const gap = span.x - (prev.x + estWidth);
      if (gap < 0.55 * fs) {
        prev.text += span.text;
        continue;
      }
    }
    merged.push({ ...span });
  }

  return merged
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ") }))
    .filter((s) => s.text.trim().length > 0);
}

/**
 * Approximate advance widths (em units) for common Latin glyphs, based on
 * Arial/Helvetica metrics. Accurate width estimates are what keep per-glyph
 * merging from splitting words after wide letters (A, M, W, m...).
 */
const GLYPH_WIDTHS_EM: Record<string, number> = {
  " ": 0.278, "!": 0.278, "\"": 0.355, "#": 0.556, "$": 0.556, "%": 0.889,
  "&": 0.667, "'": 0.191, "(": 0.333, ")": 0.333, "*": 0.389, "+": 0.584,
  ",": 0.278, "-": 0.333, ".": 0.278, "/": 0.278, ":": 0.278, ";": 0.278,
  "<": 0.584, "=": 0.584, ">": 0.584, "?": 0.556, "@": 0.1015,
  A: 0.667, B: 0.667, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778,
  H: 0.722, I: 0.278, J: 0.5, K: 0.667, L: 0.556, M: 0.833, N: 0.722,
  O: 0.778, P: 0.667, Q: 0.778, R: 0.722, S: 0.667, T: 0.611, U: 0.722,
  V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611,
  a: 0.556, b: 0.556, c: 0.5, d: 0.556, e: 0.556, f: 0.278, g: 0.556,
  h: 0.556, i: 0.222, j: 0.222, k: 0.5, l: 0.222, m: 0.833, n: 0.556,
  o: 0.556, p: 0.556, q: 0.556, r: 0.333, s: 0.5, t: 0.278, u: 0.556,
  v: 0.5, w: 0.722, x: 0.5, y: 0.5, z: 0.5,
  "0": 0.556, "1": 0.556, "2": 0.556, "3": 0.556, "4": 0.556, "5": 0.556,
  "6": 0.556, "7": 0.556, "8": 0.556, "9": 0.556,
};

/** Sums approximate advance widths (in points) for a run of text. */
function estimateTextWidth(text: string, fontSize: number, isBold = false): number {
  // Bold faces run ~9% wider than regular.
  const boldFactor = isBold ? 1.09 : 1;
  let width = 0;
  for (const ch of text) {
    width += (GLYPH_WIDTHS_EM[ch] ?? 0.55) * boldFactor * fontSize;
  }
  return width;
}

function hasTableColumns(line: Line): boolean {
  if (line.spans.length < 2) return false;
  // Need at least 2 spans at significantly different X positions (columns)
  // and both must be body-size (not headings).
  let colCount = 0;
  for (let i = 1; i < line.spans.length; i++) {
    if (line.spans[i].x - line.spans[i - 1].x > 50) colCount++;
  }
  return colCount >= 1;
}

interface TableResult {
  markdown: string;
  endIdx: number;
}

function tryCollectTable(
  lines: Line[],
  startIdx: number,
  _bodySize: number,
  headingMap: Map<number, number>,
): TableResult | null {
  const startLine = lines[startIdx];
  const startPage = startLine.page;

  // Determine column X positions from the first line.
  const colXs: number[] = [];
  for (const s of startLine.spans) {
    if (colXs.length === 0 || s.x - colXs[colXs.length - 1] > 30) {
      colXs.push(s.x);
    }
  }
  if (colXs.length < 2) return null;

  // Check next line to confirm it's a table — MUST have 2+ spans matching columns.
  if (startIdx + 1 >= lines.length) return null;
  const next = lines[startIdx + 1];
  let nextMatches = 0;
  for (const s of next.spans) {
    for (const cx of colXs) {
      if (Math.abs(s.x - cx) < 30) { nextMatches++; break; }
    }
  }
  if (nextMatches < 2) return null;

  // Collect table rows. Stop when a line doesn't match columns,
  // is a heading, bullet, checkbox, or numbered list.
  // Tables CAN span pages — column X positions match across pages.
  const rows: string[][] = [];
  let currentRow: string[][] = colXs.map(() => []);
  let lastIdx = startIdx;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.spans.length === 0) continue;

    // Stop if this line is a heading (larger bold text).
    const firstSpan = line.spans[0];
    const fontSizeKey = Math.round(firstSpan.fontSize);
    if (headingMap.has(fontSizeKey) && firstSpan.isBold && firstSpan.fontSize > startLine.spans[0].fontSize + 0.5) break;

    // Stop if this line is a bullet or checkbox.
    if (firstSpan.text.includes("\uF0B7") || firstSpan.text.includes("\u25CF") || firstSpan.text.includes("\u2610")) break;

    // Stop if this is a numbered list item.
    const fullText = line.spans.map((s) => s.text).join(" ").trim();
    if (/^\d+\.\s+/.test(fullText)) break;

    // Check if this line has spans matching column positions.
    // EVERY span must land in a column — justified prose chunks often hit a
    // couple of columns while the rest fall between them; silently dropping
    // unmatched spans would lose text, so such lines end the table instead.
    // Tolerance 30pt: headers are often centered/offset from data cells.
    let matches = 0;
    for (const s of line.spans) {
      for (const cx of colXs) {
        if (Math.abs(s.x - cx) < 30) { matches++; break; }
      }
    }

    if (matches === 0) break;
    // A line with spans that fall between columns ends the table — the line
    // itself is then reprocessed as prose, so no text is ever dropped.
    if (matches < line.spans.length) break;

    // Check if this is a new row (has span at first column) or continuation.
    const hasFirstCol = line.spans.some((s) => Math.abs(s.x - colXs[0]) < 30);

    if (hasFirstCol && currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow.map((cell) => cell.join(" ").trim()));
      currentRow = colXs.map(() => []);
    }

    // Assign spans to columns.
    for (const s of line.spans) {
      let bestCol = -1;
      let bestDist = 30;
      for (let c = 0; c < colXs.length; c++) {
        const dist = Math.abs(s.x - colXs[c]);
        if (dist < bestDist) { bestDist = dist; bestCol = c; }
      }
      if (bestCol >= 0) {
        currentRow[bestCol].push(s.text.trim());
      }
    }

    lastIdx = i;
  }

  // Push last row.
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow.map((cell) => cell.join(" ").trim()));
  }

  if (rows.length < 2) return null;

  // Build markdown table.
  const numCols = colXs.length;
  const header = rows[0];
  const dataRows = rows.slice(1);

  while (header.length < numCols) header.push("");

  const escapePipe = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

  const tableLines: string[] = [];
  tableLines.push(`| ${header.map(escapePipe).join(" | ")} |`);
  tableLines.push(`| ${colXs.map(() => "---").join(" | ")} |`);
  for (const row of dataRows) {
    while (row.length < numCols) row.push("");
    tableLines.push(`| ${row.map(escapePipe).join(" | ")} |`);
  }

  return {
    markdown: tableLines.join("\n"),
    endIdx: lastIdx,
  };
}

// ===== Helper Functions =====

function decodeWithCmap(byteChars: string, cmap: CMap | null): string {
  if (!cmap) return byteChars;
  const bytes: number[] = [];
  for (let i = 0; i < byteChars.length; i++) bytes.push(byteChars.charCodeAt(i) & 0xff);

  const len = cmap.codeLen;
  let out = "";
  let hits = 0;
  let total = 0;
  for (let i = 0; i + len <= bytes.length; i += len) {
    let code = 0;
    for (let j = 0; j < len; j++) code = (code << 8) | bytes[i + j];
    total++;
    const mapped = cmap.map.get(code);
    if (mapped !== undefined) {
      out += mapped;
      hits++;
    }
  }
  if (total > 0 && hits / total >= 0.5) return out;
  return byteChars;
}

function decodePdfStringBytes(escaped: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < escaped.length; i++) {
    const ch = escaped[i];
    if (ch !== "\\") {
      out.push(escaped.charCodeAt(i) & 0xff);
      continue;
    }
    const next = escaped[i + 1];
    if (next === undefined) break;
    if (next === "n") { out.push(10); i++; }
    else if (next === "r") { out.push(13); i++; }
    else if (next === "t") { out.push(9); i++; }
    else if (next === "b" || next === "f") { i++; }
    else if (next === "(" || next === ")" || next === "\\") { out.push(next.charCodeAt(0)); i++; }
    else if (/[0-7]/.test(next)) {
      let octal = next;
      let j = i + 2;
      while (j < escaped.length && octal.length < 3 && /[0-7]/.test(escaped[j])) {
        octal += escaped[j]; j++;
      }
      out.push(parseInt(octal, 8) & 0xff);
      i = j - 1;
    } else { i++; }
  }
  return out;
}

function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  if (clean.length % 2 === 1) bytes.push(parseInt(clean[clean.length - 1] + "0", 16));
  return bytes;
}

function utf16BEHexToUnits(hex: string): number[] {
  const units: number[] = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    units.push(parseInt(hex.slice(i, i + 4), 16));
  }
  if (units.length === 0 && hex.length >= 2) units.push(parseInt(hex, 16));
  return units;
}

function utf16BEHexToString(hex: string): string {
  return String.fromCharCode(...utf16BEHexToUnits(hex));
}

function decodePdfUtf16OrLatin(bytes: number[]): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return String.fromCharCode(...bytes);
}

function ascii85Decode(bytes: Uint8Array): Uint8Array | null {
  const out: number[] = [];
  const tuple: number[] = [];
  let i = 0;
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x7e) i = 2;

  const flush = (count: number) => {
    let value = 0;
    for (let j = 0; j < 5; j++) value = value * 85 + (j < count ? tuple[j] : 84);
    const b = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    for (let j = 0; j < count - 1; j++) out.push(b[j]);
    tuple.length = 0;
  };

  for (; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x7e) break;
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00) continue;
    if (c === 0x7a && tuple.length === 0) { out.push(0, 0, 0, 0); continue; }
    if (c < 0x21 || c > 0x75) return null;
    tuple.push(c - 0x21);
    if (tuple.length === 5) flush(5);
  }
  if (tuple.length === 1) return null;
  if (tuple.length > 1) flush(tuple.length);
  return new Uint8Array(out);
}

function asciiHexDecode(bytes: Uint8Array): Uint8Array | null {
  const out: number[] = [];
  let hi = -1;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x3e) break;
    let v: number;
    if (c >= 0x30 && c <= 0x39) v = c - 0x30;
    else if (c >= 0x41 && c <= 0x46) v = c - 0x37;
    else if (c >= 0x61 && c <= 0x66) v = c - 0x57;
    else continue;
    if (hi === -1) hi = v;
    else { out.push((hi << 4) | v); hi = -1; }
  }
  if (hi !== -1) out.push(hi << 4);
  return new Uint8Array(out);
}

function extractPdfTitle(raw: string): string | null {
  const match = raw.match(/\/Title\s*\(((?:\\.|[^\\()])*)\)/);
  if (match) {
    const decoded = decodePdfUtf16OrLatin(decodePdfStringBytes(match[1])).trim();
    if (decoded && decoded.length <= 200 && !/[\u0000-\u0008\u000e-\u001f]/.test(decoded)) {
      return decoded;
    }
  }
  const hexMatch = raw.match(/\/Title\s*<([0-9a-fA-F\s]+)>/);
  if (hexMatch) {
    const decoded = decodePdfUtf16OrLatin(hexToBytes(hexMatch[1])).trim();
    if (decoded && decoded.length <= 200) return decoded;
  }
  return null;
}
