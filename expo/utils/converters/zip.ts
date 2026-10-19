import JSZip from "jszip";

import { docxToMarkdown } from "@/utils/converters/docx";
import { ipynbToMarkdown } from "@/utils/converters/ipynb";
import { extractPdfText } from "@/utils/converters/pdf";
import { spreadsheetToMarkdown } from "@/utils/converters/sheet";
import { looksLikeJson, prettyJson } from "@/utils/converters/text";
import { htmlToMarkdown } from "@/utils/markdown/htmlToMarkdown";

const MAX_ENTRIES = 50;
const MAX_ENTRY_CHARS = 40_000;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;

const CODE_EXT = /\.(sh|py|js|ts|tsx|jsx|css|scss|yml|yaml|toml|ini|cfg|conf|env|xml|sql|rb|go|rs|java|kt|swift|c|h|cpp)$/i;
const TEXT_LIKE = /\.(txt|md|markdown|log|srt|vtt|tex)$/i;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|heic|bmp|tiff?|avif|svg|mp4|mov|mkv|webm|mp3|wav|m4a|aac|flac|ogg)$/i;

/**
 * Converts a .zip (base64) to Markdown, mirroring MarkItDown's ZIP converter:
 * a header line, then each convertible entry under `## File: path`, with
 * per-format conversion (text, html, csv, json, docx, xlsx, pdf, ipynb) and
 * media entries listed as vault embeds. Nested zips are skipped.
 */
export async function zipToMarkdown(base64: string, zipName: string): Promise<string> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const names = Object.keys(zip.files)
    .filter((n) => {
      const f = zip.files[n];
      return !f.dir && !n.startsWith("__MACOSX/") && !/(^|\/)\.[^/]*$/.test(n);
    })
    .sort();

  const parts: string[] = [`Content from the zip file \`${zipName}\`:`];
  let converted = 0;

  for (const name of names) {
    if (converted >= MAX_ENTRIES) {
      parts.push(`> Truncated: showing ${MAX_ENTRIES} of ${names.length} files.`);
      break;
    }
    const entry = zip.files[name];
    try {
      const md = await entryToMarkdown(name, entry);
      if (md !== null) {
        parts.push(`## File: ${name}\n\n${capEntry(md)}`);
        converted++;
      }
    } catch (error) {
      console.log("[zipToMarkdown] entry failed", name, error);
      parts.push(`## File: ${name}\n\n> Could not convert this file locally.`);
      converted++;
    }
  }

  if (converted === 0) parts.push("> No convertible files were found in this archive.");
  return parts.join("\n\n");
}

async function entryToMarkdown(name: string, entry: JSZip.JSZipObject): Promise<string | null> {
  if (MEDIA_EXT.test(name)) {
    const base = name.split("/").pop() ?? name;
    return `![[${base}]]\n\nExtract \`${base}\` from the archive into your vault to embed it.`;
  }

  if (/\.docx$/i.test(name)) {
    return await docxToMarkdown(await entry.async("base64"));
  }
  if (/\.(xlsx|xls)$/i.test(name)) {
    return spreadsheetToMarkdown(await entry.async("base64"), "base64");
  }
  if (/\.pdf$/i.test(name)) {
    const bytes = await entry.async("uint8array");
    if (bytes.length > MAX_ENTRY_BYTES) return "> Skipped: file too large for local conversion.";
    const { text } = extractPdfText(await entry.async("base64"));
    return text.length > 0 ? text : "> No extractable text layer in this PDF.";
  }
  if (/\.ipynb$/i.test(name)) {
    return ipynbToMarkdown(await entry.async("string")).markdown;
  }
  if (/\.(html?|xhtml)$/i.test(name)) {
    return htmlToMarkdown(await entry.async("string")).markdown;
  }
  if (/\.csv$/i.test(name)) {
    return spreadsheetToMarkdown(await entry.async("string"), "string");
  }
  if (/\.json$/i.test(name)) {
    const text = await entry.async("string");
    const body = looksLikeJson(text) ? prettyJson(text) : text;
    return `\`\`\`json\n${body.trim()}\n\`\`\``;
  }
  if (CODE_EXT.test(name)) {
    const ext = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
    const text = await entry.async("string");
    return `\`\`\`${ext}\n${text.trimEnd()}\n\`\`\``;
  }
  if (TEXT_LIKE.test(name)) {
    return (await entry.async("string")).trim();
  }
  if (/\.zip$/i.test(name)) {
    return "> Nested archive — extract and convert it separately.";
  }
  return null;
}

function capEntry(md: string): string {
  return md.length > MAX_ENTRY_CHARS
    ? `${md.slice(0, MAX_ENTRY_CHARS)}\n\n… (entry truncated)`
    : md;
}
