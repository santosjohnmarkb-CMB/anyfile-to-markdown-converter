import JSZip from "jszip";

import { decodeHtmlEntities } from "@/utils/encoding";

/**
 * Converts a .pptx (base64) to Markdown, mirroring MarkItDown's conventions:
 * slides separated by `<!-- Slide number: N -->`, slide title as `# Title`,
 * body text as plain lines, tables as pipe tables, speaker notes under `### Notes:`.
 */
export async function pptxToMarkdown(
  base64: string,
): Promise<{ markdown: string; title: string | null }> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slideNames.length === 0) {
    throw new Error("Not a valid PowerPoint file (no slides found)");
  }

  let deckTitle: string | null = null;
  const sections: string[] = [];

  for (const name of slideNames) {
    const num = slideNumber(name);
    const xml = await zip.files[name].async("string");
    const { body, title } = convertSlide(xml);
    if (deckTitle === null && title) deckTitle = title;

    let section = `<!-- Slide number: ${num} -->\n\n${body}`.trim();

    const notesFile = zip.file(`ppt/notesSlides/notesSlide${num}.xml`);
    if (notesFile) {
      const notesXml = await notesFile.async("string");
      const notes = extractNotes(notesXml);
      if (notes) section += `\n\n### Notes:\n\n${notes}`;
    }
    sections.push(section);
  }

  return { markdown: sections.join("\n\n"), title: deckTitle };
}

function slideNumber(path: string): number {
  return parseInt(path.match(/slide(\d+)\.xml$/)?.[1] ?? "0", 10);
}

function convertSlide(xml: string): { body: string; title: string | null } {
  const parts: string[] = [];
  let title: string | null = null;

  // Walk shapes and graphic frames (tables) in document order.
  const blockRegex =
    /<p:sp>[\s\S]*?<\/p:sp>|<p:sp\s[^>]*>[\s\S]*?<\/p:sp>|<a:tbl>[\s\S]*?<\/a:tbl>|<a:tbl\s[^>]*>[\s\S]*?<\/a:tbl>/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(xml)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith("<a:tbl")) {
      const table = convertPptxTable(chunk);
      if (table) parts.push(table);
      continue;
    }
    const isTitle = /<p:ph[^>]*type="(?:ctrTitle|title)"/.test(chunk);
    const lines = extractParagraphLines(chunk);
    if (lines.length === 0) continue;
    if (isTitle) {
      const text = lines.join(" ").trim();
      if (title === null) title = text;
      parts.push(`# ${text}`);
    } else {
      parts.push(lines.join("\n"));
    }
  }

  return { body: parts.join("\n\n"), title };
}

/** Extracts one text line per <a:p> paragraph inside a shape. */
function extractParagraphLines(chunk: string): string[] {
  const lines: string[] = [];
  const paraRegex = /<a:p>[\s\S]*?<\/a:p>|<a:p\s[^>]*>[\s\S]*?<\/a:p>/g;
  let para: RegExpExecArray | null;
  while ((para = paraRegex.exec(chunk)) !== null) {
    const text = extractRunText(para[0]);
    if (text.trim().length > 0) lines.push(text.trim());
  }
  return lines;
}

function extractRunText(xml: string): string {
  const parts: string[] = [];
  const textRegex = /<a:t>([\s\S]*?)<\/a:t>|<a:t\s[^>]*>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(xml)) !== null) {
    parts.push(decodeHtmlEntities(match[1] ?? match[2] ?? ""));
  }
  return parts.join("");
}

function convertPptxTable(tblXml: string): string | null {
  const rows = tblXml.match(/<a:tr(?:\s[^>]*)?>[\s\S]*?<\/a:tr>/g) ?? [];
  if (rows.length === 0) return null;

  const parsed: string[][] = rows.map((row) => {
    const cells = row.match(/<a:tc(?:\s[^>]*)?>[\s\S]*?<\/a:tc>/g) ?? [];
    return cells.map((cell) =>
      extractRunText(cell).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim(),
    );
  });

  const colCount = Math.max(...parsed.map((r) => r.length), 1);
  const pad = (row: string[]) => {
    const cells = [...row];
    while (cells.length < colCount) cells.push("");
    return `| ${cells.join(" | ")} |`;
  };
  return [
    pad(parsed[0]),
    `| ${Array(colCount).fill("---").join(" | ")} |`,
    ...parsed.slice(1).map(pad),
  ].join("\n");
}

/** Pulls speaker-note text, skipping slide-number placeholders. */
function extractNotes(xml: string): string {
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>|<p:sp\s[^>]*>[\s\S]*?<\/p:sp>/g) ?? [];
  const lines: string[] = [];
  for (const shape of shapes) {
    if (/<p:ph[^>]*type="sldNum"/.test(shape)) continue;
    for (const line of extractParagraphLines(shape)) {
      if (/^\d+$/.test(line)) continue;
      lines.push(line);
    }
  }
  return lines.join("\n").trim();
}
