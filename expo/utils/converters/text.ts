import { capSource } from "@/utils/convert";
import { buildDocument, DEFAULT_FLAVOR } from "@/utils/flavor";
import { htmlToMarkdown } from "@/utils/markdown/htmlToMarkdown";
import type { MarkdownFlavor } from "@/utils/flavor";
import type { ConversionResult } from "@/types/conversion";

/** Converts pasted raw text into a Markdown note (detects HTML fragments). */
export function convertPastedText(
  text: string,
  flavor: MarkdownFlavor = DEFAULT_FLAVOR,
): ConversionResult {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60).trim();
  const title = firstLine || "Pasted note";

  if (/<\/(p|div|h[1-6]|table|ul|ol|a|span)>/i.test(trimmed)) {
    const { markdown, title: htmlTitle } = htmlToMarkdown(trimmed);
    const noteTitle = htmlTitle || title;
    return {
      title: noteTitle,
      sourceType: "text",
      sourceName: "Pasted text",
      flavor,
      markdown: buildDocument(flavor, {
        title: noteTitle,
        source: "clipboard",
        type: "note",
        body: markdown,
      }),
      sourceContent: capSource(trimmed),
    };
  }

  if (looksLikeJson(trimmed)) {
    return {
      title,
      sourceType: "json",
      sourceName: "Pasted JSON",
      flavor,
      markdown: buildDocument(flavor, {
        title,
        source: "clipboard",
        type: "snippet",
        body: `# ${title}\n\n\`\`\`json\n${prettyJson(trimmed)}\n\`\`\``,
      }),
      sourceContent: capSource(trimmed),
    };
  }

  return {
    title,
    sourceType: "text",
    sourceName: "Pasted text",
    flavor,
    markdown: buildDocument(flavor, {
      title,
      source: "clipboard",
      type: "note",
      body: trimmed,
    }),
    sourceContent: capSource(trimmed),
  };
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith("{") && t.endsWith("}")) && !(t.startsWith("[") && t.endsWith("]"))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
