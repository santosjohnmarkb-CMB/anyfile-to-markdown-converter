import JSZip from "jszip";

import { decodeHtmlEntities } from "@/utils/encoding";
import { htmlToMarkdown } from "@/utils/markdown/htmlToMarkdown";

const MAX_TOTAL_CHARS = 300_000;

/**
 * Converts an .epub (base64) to Markdown, mirroring MarkItDown:
 * a bold-label metadata block from content.opf, then each spine chapter's
 * XHTML converted through the HTML→Markdown pipeline in reading order.
 */
export async function epubToMarkdown(
  base64: string,
): Promise<{ markdown: string; title: string | null }> {
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const opfPath = await findOpfPath(zip);
  if (!opfPath) throw new Error("Not a valid EPUB (missing content.opf)");
  const opf = await zip.files[opfPath].async("string");
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const title = matchTag(opf, "dc:title");
  const authors = matchAllTags(opf, "dc:creator");
  const language = matchTag(opf, "dc:language");
  const publisher = matchTag(opf, "dc:publisher");
  const date = matchTag(opf, "dc:date");
  const description = matchTag(opf, "dc:description");

  const metaLines: string[] = [];
  if (title) metaLines.push(`**Title:** ${title}`);
  if (authors.length > 0) metaLines.push(`**Authors:** ${authors.join(", ")}`);
  if (language) metaLines.push(`**Language:** ${language}`);
  if (publisher) metaLines.push(`**Publisher:** ${publisher}`);
  if (date) metaLines.push(`**Date:** ${date}`);
  if (description) metaLines.push(`**Description:** ${description}`);

  // Manifest: id -> href, then spine order.
  const manifest = new Map<string, string>();
  const itemRegex = /<item\s[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(opf)) !== null) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (id && href) manifest.set(id, decodeHtmlEntities(href));
  }

  const spineIds: string[] = [];
  const spineBlock = opf.match(/<spine[\s\S]*?<\/spine>/)?.[0] ?? "";
  const refRegex = /<itemref\s[^>]*\/?>/g;
  while ((m = refRegex.exec(spineBlock)) !== null) {
    const idref = m[0].match(/\bidref="([^"]+)"/)?.[1];
    if (idref) spineIds.push(idref);
  }

  const chapters: string[] = [];
  let total = 0;
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href || !/\.x?html?$/i.test(href.split("?")[0])) continue;
    const path = normalizePath(baseDir + href.split("#")[0]);
    const file = zip.files[path];
    if (!file) continue;
    const html = await file.async("string");
    const { markdown } = htmlToMarkdown(html);
    const body = markdown.trim();
    if (body.length === 0) continue;
    chapters.push(body);
    total += body.length;
    if (total > MAX_TOTAL_CHARS) {
      chapters.push("> Truncated: book content exceeds the local preview limit.");
      break;
    }
  }

  const parts: string[] = [];
  if (metaLines.length > 0) parts.push(metaLines.join("\n"));
  parts.push(...chapters);
  return { markdown: parts.join("\n\n"), title: title || null };
}

async function findOpfPath(zip: JSZip): Promise<string | null> {
  const container = zip.file("META-INF/container.xml");
  if (container) {
    const xml = await container.async("string");
    const path = xml.match(/full-path="([^"]+)"/)?.[1];
    if (path && zip.files[path]) return path;
  }
  return Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".opf")) ?? null;
}

function matchTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  const value = match ? decodeHtmlEntities(match[1]).replace(/<[^>]+>/g, "").trim() : "";
  return value.length > 0 ? value : null;
}

function matchAllTags(xml: string, tag: string): string[] {
  const out: string[] = [];
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const value = decodeHtmlEntities(m[1]).replace(/<[^>]+>/g, "").trim();
    if (value) out.push(value);
  }
  return out;
}

/** Resolves ../ segments in zip entry paths. */
function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "..") segments.pop();
    else if (seg !== "." && seg !== "") segments.push(seg);
  }
  return segments.join("/");
}
