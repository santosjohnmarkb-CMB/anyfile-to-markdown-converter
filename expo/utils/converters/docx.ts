import JSZip from "jszip";

import { decodeHtmlEntities } from "@/utils/encoding";

/** Converts a .docx (base64) to Markdown by parsing word/document.xml locally. */
export async function docxToMarkdown(base64: string): Promise<string> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Not a valid Word document (missing document.xml)");
  const xml = await docFile.async("string");

  const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  const body = bodyMatch ? bodyMatch[1] : xml;

  const blocks: string[] = [];
  // Walk top-level tables and paragraphs in document order.
  const blockRegex = /<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
  let match: RegExpExecArray | null;
  let insideTableDepth = 0;
  let tableEnd = -1;

  while ((match = blockRegex.exec(body)) !== null) {
    const chunk = match[0];
    if (match.index < tableEnd) continue; // paragraph inside an already-processed table
    if (chunk.startsWith("<w:tbl")) {
      insideTableDepth = 0;
      tableEnd = match.index + chunk.length;
      const table = convertTable(chunk);
      if (table) blocks.push(table);
    } else {
      const para = convertParagraph(chunk);
      if (para !== null) blocks.push(para);
    }
  }
  void insideTableDepth;

  return blocks
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertParagraph(pXml: string): string | null {
  const style = pXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/)?.[1] ?? "";
  const isList = /<w:numPr[\s>]/.test(pXml);
  const numLevel = parseInt(pXml.match(/<w:ilvl[^>]*w:val="(\d+)"/)?.[1] ?? "0", 10);

  const text = extractRuns(pXml);
  if (text.trim().length === 0) return null;

  const headingMatch = style.match(/^Heading(\d)$/i) ?? style.match(/^berschrift(\d)$/i);
  if (headingMatch) {
    const level = Math.min(6, Math.max(1, parseInt(headingMatch[1], 10)));
    return `${"#".repeat(level)} ${text.trim()}`;
  }
  if (/^Title$/i.test(style)) return `# ${text.trim()}`;
  if (/^Subtitle$/i.test(style)) return `## ${text.trim()}`;
  if (/^(Quote|IntenseQuote)$/i.test(style)) return `> ${text.trim()}`;
  if (isList || /^ListParagraph$/i.test(style)) {
    const indent = "  ".repeat(Math.min(numLevel, 4));
    return `${indent}- ${text.trim()}`;
  }
  return text.trim();
}

function extractRuns(pXml: string): string {
  const parts: string[] = [];
  const runRegex = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>|<w:hyperlink(?:\s[^>]*)?>([\s\S]*?)<\/w:hyperlink>/g;
  let match: RegExpExecArray | null;

  while ((match = runRegex.exec(pXml)) !== null) {
    const inner = match[1] ?? match[2] ?? "";
    if (match[2] !== undefined) {
      // Hyperlink wraps its own runs — extract nested run text plainly.
      parts.push(extractRuns(inner));
      continue;
    }
    let text = "";
    const textRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let t: RegExpExecArray | null;
    while ((t = textRegex.exec(inner)) !== null) text += decodeHtmlEntities(t[1]);
    if (/<w:tab\b/.test(inner)) text = `\t${text}`;
    if (/<w:br\b/.test(inner)) text = `\n${text}`;
    if (text.length === 0) continue;

    const props = inner.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    const bold = /<w:b(?:\s*\/|\s[^>]*(?<!w:val="(?:false|0)")\/?)>/.test(props) && !/<w:b\s+w:val="(?:false|0)"/.test(props);
    const italic = /<w:i(?:\s*\/|\s[^>]*\/?)>/.test(props) && !/<w:i\s+w:val="(?:false|0)"/.test(props);

    const trimmed = text.trim();
    if (trimmed.length > 0 && bold && italic) {
      text = text.replace(trimmed, `***${trimmed}***`);
    } else if (trimmed.length > 0 && bold) {
      text = text.replace(trimmed, `**${trimmed}**`);
    } else if (trimmed.length > 0 && italic) {
      text = text.replace(trimmed, `*${trimmed}*`);
    }
    parts.push(text);
  }
  return parts.join("").replace(/\*\*\*\*/g, "").replace(/\*\* \*\*/g, " ");
}

function convertTable(tblXml: string): string | null {
  const rows = tblXml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) ?? [];
  if (rows.length === 0) return null;

  const parsed: string[][] = rows.map((row) => {
    const cells = row.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) ?? [];
    return cells.map((cell) => {
      const paragraphs = cell.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
      return paragraphs
        .map((p) => extractRuns(p))
        .filter((t) => t.trim().length > 0)
        .join(" ")
        .replace(/\|/g, "\\|")
        .replace(/\s+/g, " ")
        .trim();
    });
  });

  const colCount = Math.max(...parsed.map((r) => r.length), 1);
  const pad = (row: string[]) => {
    const cells = [...row];
    while (cells.length < colCount) cells.push("");
    return `| ${cells.join(" | ")} |`;
  };
  const lines = [pad(parsed[0]), `| ${Array(colCount).fill("---").join(" | ")} |`, ...parsed.slice(1).map(pad)];
  return lines.join("\n");
}
