import { docxToMarkdown } from "@/utils/converters/docx";
import { epubToMarkdown } from "@/utils/converters/epub";
import { feedToMarkdown, isFeed } from "@/utils/converters/feed";
import { ipynbToMarkdown } from "@/utils/converters/ipynb";
import { buildMediaNote } from "@/utils/converters/media";
import { extractPdfText } from "@/utils/converters/pdf";
import { pptxToMarkdown } from "@/utils/converters/pptx";
import { spreadsheetToMarkdown } from "@/utils/converters/sheet";
import { looksLikeJson, prettyJson } from "@/utils/converters/text";
import { zipToMarkdown } from "@/utils/converters/zip";
import { htmlToMarkdown } from "@/utils/markdown/htmlToMarkdown";
import { guardFunction, verifyIntegrity } from "@/utils/security/codeGuard";
import { buildDocument, DEFAULT_FLAVOR } from "@/utils/flavor";
import type { MarkdownFlavor } from "@/utils/flavor";
import type { ConversionResult, PickedSource, SourceType } from "@/types/conversion";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|avif|svg)$/i;
const VIDEO_EXT = /\.(mp4|mov|mkv|avi|webm|m4v|3gp)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff)$/i;
const TEXT_EXT = /\.(txt|md|markdown|log|ini|cfg|conf|yml|yaml|toml|tex|srt|vtt|env|sh|py|js|ts|tsx|jsx|css|scss|xml|rtf)$/i;

/** Extensions with a dedicated converter. Used for the upfront supported-file check. */
const SUPPORTED_EXT = /\.(pdf|docx|pptx|xlsx?|csv|html?|xhtml|json|md|markdown|ipynb|epub|zip|xml|rss|atom|png|jpe?g|gif|webp|heic|heif|bmp|tiff?|avif|svg|mp4|mov|mkv|avi|webm|m4v|3gp|mp3|wav|m4a|aac|flac|ogg|opus|aiff|txt|log|ini|cfg|conf|yml|yaml|toml|tex|srt|vtt|env|sh|py|js|ts|tsx|jsx|css|scss|rtf)$/i;
/** MIME prefixes/matches considered supported. */
const SUPPORTED_MIME = /^(application\/pdf|application\/epub\+zip|application\/zip|application\/json|application\/xml|application\/rss\+xml|application\/atom\+xml|text\/|image\/|video\/|audio\/|application\/vnd\.openxmlformats-officedocument|application\/vnd\.ms-excel)/i;

/** Friendly list of supported formats, grouped for the error message. */
const SUPPORTED_GROUPS = [
  "Documents: PDF, DOCX, PPTX, EPUB, RTF, TXT, MD",
  "Sheets: XLSX, XLS, CSV",
  "Web: HTML, JSON, XML, RSS, ATOM",
  "Notebooks: IPYNB",
  "Archives: ZIP",
  "Images: PNG, JPG, GIF, WEBP, HEIC, BMP, TIFF, AVIF, SVG",
  "Media: MP4, MOV, MP3, WAV, M4A, FLAC",
  "Code: JS, TS, PY, SH, CSS, YAML, TOML",
];

/**
 * Throws a user-friendly error if the file type is not supported.
 * Checks both the file extension and the MIME type.
 */
function assertSupported(source: PickedSource): void {
  const name = source.name || "";
  const mime = (source.mimeType ?? "").toLowerCase();
  const extMatch = name.match(/\.([^.]+)$/);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";

  const extOk = SUPPORTED_EXT.test(name);
  const mimeOk = mime.length > 0 && SUPPORTED_MIME.test(mime);

  if (extOk || mimeOk) return;

  const displayed = ext || (mime ? ` (${mime})` : "");
  throw new Error(
    `Unsupported file type${displayed ? `: ${displayed}` : ""}.\n\nanything.md can convert:\n${SUPPORTED_GROUPS.map((g) => `• ${g}`).join("\n")}`,
  );
}

const SOURCE_PREVIEW_CAP = 30_000;

// Register the conversion engine's critical functions in the integrity
// registry at module load so runtime hooking/monkey-patching is detectable.
const GUARDED = {
  extractPdfText,
  docxToMarkdown,
  spreadsheetToMarkdown,
  htmlToMarkdown,
} as const;
for (const [guardName, guardFn] of Object.entries(GUARDED)) {
  guardFunction(guardName, guardFn as (...args: never[]) => unknown);
}

/** Caps raw source content so the review pane stays fast. */
export function capSource(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > SOURCE_PREVIEW_CAP
    ? `${trimmed.slice(0, SOURCE_PREVIEW_CAP)}\n\n… (source truncated for preview)`
    : trimmed;
}

function binaryInfo(source: PickedSource, kindLabel: string): string {
  const lines = [
    `${kindLabel}`,
    `Name: ${source.name}`,
    `Type: ${source.mimeType ?? "unknown"}`,
  ];
  if (source.size != null) lines.push(`Size: ${(source.size / 1024).toFixed(1)} KB`);
  lines.push("", "Binary file — the pane below shows the converted Markdown.");
  return lines.join("\n");
}

/** Routes a picked/dropped file to the right local converter based on extension + mime. */
export async function convertFile(
  source: PickedSource,
  flavor: MarkdownFlavor = DEFAULT_FLAVOR,
): Promise<ConversionResult> {
  // Core-level guard: refuse to convert if the engine was patched at runtime.
  const tampered = verifyIntegrity(GUARDED as unknown as Record<string, (...args: never[]) => unknown>);
  if (tampered.length > 0) {
    throw new Error("Conversion blocked: runtime integrity check failed.");
  }

  // Upfront supported-file check — fail fast with a clear message.
  assertSupported(source);

  const name = source.name || "file";
  const mime = (source.mimeType ?? "").toLowerCase();
  const baseTitle = name.replace(/\.[^.]+$/, "");

  if (/\.pdf$/i.test(name) || mime === "application/pdf") {
    return convertPdf(source, name, baseTitle, flavor);
  }
  if (/\.docx$/i.test(name) || mime.includes("officedocument.wordprocessingml")) {
    const markdown = await docxToMarkdown(await source.readBase64());
    return wrap(
      baseTitle,
      "docx",
      name,
      markdown || emptyExtraction(name, "Word document"),
      flavor,
      binaryInfo(source, "Word document (.docx)"),
    );
  }
  if (/\.pptx$/i.test(name) || mime.includes("officedocument.presentationml")) {
    const { markdown, title } = await pptxToMarkdown(await source.readBase64());
    const noteTitle = title || baseTitle;
    return wrap(
      noteTitle,
      "slides",
      name,
      markdown || emptyExtraction(name, "presentation"),
      flavor,
      binaryInfo(source, "PowerPoint presentation (.pptx)"),
    );
  }
  if (/\.(xlsx|xls)$/i.test(name) || mime.includes("spreadsheetml") || mime.includes("ms-excel")) {
    const markdown = spreadsheetToMarkdown(await source.readBase64(), "base64");
    return wrap(baseTitle, "sheet", name, `# ${baseTitle}\n\n${markdown}`, flavor, binaryInfo(source, "Spreadsheet"));
  }
  if (/\.csv$/i.test(name) || mime === "text/csv") {
    const csv = await source.readText();
    const markdown = spreadsheetToMarkdown(csv, "string");
    return wrap(baseTitle, "sheet", name, `# ${baseTitle}\n\n${markdown}`, flavor, capSource(csv));
  }
  if (/\.(html?|xhtml)$/i.test(name) || mime === "text/html") {
    const html = await source.readText();
    const { title, markdown } = htmlToMarkdown(html);
    const noteTitle = title || baseTitle;
    return wrap(noteTitle, "html", name, `# ${noteTitle}\n\n${markdown}`, flavor, capSource(html));
  }
  if (/\.json$/i.test(name) || mime === "application/json") {
    const text = await source.readText();
    const body = looksLikeJson(text) ? prettyJson(text) : text;
    return wrap(baseTitle, "json", name, `# ${baseTitle}\n\n\`\`\`json\n${body.trim()}\n\`\`\``, flavor, capSource(text));
  }
  if (/\.(md|markdown)$/i.test(name) || mime === "text/markdown") {
    const text = await source.readText();
    return wrap(baseTitle, "text", name, text.trim(), flavor, capSource(text));
  }
  if (/\.ipynb$/i.test(name)) {
    const text = await source.readText();
    const { markdown, title } = ipynbToMarkdown(text);
    const noteTitle = title || baseTitle;
    return wrap(noteTitle, "notebook", name, markdown, flavor, capSource(text));
  }
  if (/\.epub$/i.test(name) || mime === "application/epub+zip") {
    const { markdown, title } = await epubToMarkdown(await source.readBase64());
    const noteTitle = title || baseTitle;
    return wrap(noteTitle, "epub", name, markdown, flavor, binaryInfo(source, "EPUB e-book"));
  }
  if (/\.zip$/i.test(name) || mime === "application/zip") {
    const markdown = await zipToMarkdown(await source.readBase64(), name);
    return wrap(baseTitle, "archive", name, markdown, flavor, binaryInfo(source, "ZIP archive"));
  }
  if (/\.(xml|rss|atom)$/i.test(name) || mime === "text/xml" || mime === "application/xml" || mime === "application/rss+xml" || mime === "application/atom+xml") {
    const text = await source.readText();
    if (isFeed(text)) {
      const { markdown, title } = feedToMarkdown(text);
      const noteTitle = title || baseTitle;
      return wrap(noteTitle, "feed", name, markdown, flavor, capSource(text));
    }
    return wrap(baseTitle, "text", name, `# ${baseTitle}\n\n\`\`\`xml\n${text.trim()}\n\`\`\``, flavor, capSource(text));
  }
  if (IMAGE_EXT.test(name) || mime.startsWith("image/")) {
    return mediaResult(source, name, baseTitle, "image", flavor);
  }
  if (VIDEO_EXT.test(name) || mime.startsWith("video/")) {
    return mediaResult(source, name, baseTitle, "video", flavor);
  }
  if (AUDIO_EXT.test(name) || mime.startsWith("audio/")) {
    return mediaResult(source, name, baseTitle, "audio", flavor);
  }
  if (TEXT_EXT.test(name) || mime.startsWith("text/")) {
    const text = await source.readText();
    const ext = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
    const codeLike = /^(sh|py|js|ts|tsx|jsx|css|scss|xml|yml|yaml|toml|ini|cfg|conf|env)$/.test(ext);
    const body = codeLike ? `\`\`\`${ext}\n${text.trim()}\n\`\`\`` : text.trim();
    return wrap(baseTitle, "text", name, `# ${baseTitle}\n\n${body}`, flavor, capSource(text));
  }

  // No converter matched — supported check should have caught this, but guard anyway.
  throw new Error(
    `Unsupported file type: ${name.match(/\.[^.]+$/)?.[0] ?? "unknown"}.\n\nanything.md can convert:\n${SUPPORTED_GROUPS.map((g) => `• ${g}`).join("\n")}`,
  );
}


async function convertPdf(
  source: PickedSource,
  name: string,
  baseTitle: string,
  flavor: MarkdownFlavor,
): Promise<ConversionResult> {
  const base64 = await source.readBase64();
  const { text, title } = extractPdfText(base64);
  const noteTitle = title || baseTitle;
  if (text.length < 40) {
    const body =
      `# ${noteTitle}\n\n` +
      `> [!warning] No extractable text layer\n` +
      `> This PDF appears to be scanned or uses complex encoding, so no text could be extracted locally.\n\n` +
      `![[${name}]]\n\n` +
      `Copy \`${name}\` into your vault to embed the original document.`;
    return wrap(noteTitle, "pdf", name, body, flavor, binaryInfo(source, "PDF document"));
  }
  return wrap(noteTitle, "pdf", name, `# ${noteTitle}\n\n${text}`, flavor, capSource(text));
}

function mediaResult(
  source: PickedSource,
  name: string,
  baseTitle: string,
  kind: "image" | "video" | "audio" | "other",
  flavor: MarkdownFlavor,
): ConversionResult {
  const markdown = buildMediaNote({ name, mimeType: source.mimeType, size: source.size, kind });
  const sourceType: SourceType = kind === "other" ? "other" : kind;
  return wrap(baseTitle, sourceType, name, markdown, flavor, binaryInfo(source, kindLabelFor(kind)));
}

function kindLabelFor(kind: "image" | "video" | "audio" | "other"): string {
  switch (kind) {
    case "image":
      return "Image file";
    case "video":
      return "Video file";
    case "audio":
      return "Audio file";
    default:
      return "Binary file";
  }
}

function wrap(
  title: string,
  sourceType: SourceType,
  sourceName: string,
  body: string,
  flavor: MarkdownFlavor,
  sourceContent?: string,
): ConversionResult {
  const markdown = buildDocument(flavor, {
    title,
    source: sourceName,
    type: typeLabel(sourceType),
    body,
  });
  return { title, sourceType, sourceName, markdown, flavor, sourceContent };
}

function typeLabel(type: SourceType): string {
  switch (type) {
    case "pdf":
      return "pdf-extract";
    case "docx":
      return "doc-extract";
    case "sheet":
      return "spreadsheet";
    case "url":
      return "web-clip";
    case "slides":
      return "slide-deck";
    case "notebook":
      return "notebook";
    case "epub":
      return "ebook";
    case "archive":
      return "archive";
    case "feed":
      return "feed";
    case "image":
    case "video":
    case "audio":
      return "attachment";
    default:
      return "note";
  }
}

function emptyExtraction(name: string, kind: string): string {
  return `> [!warning] Nothing extracted\n> No readable text was found in this ${kind} (\`${name}\`).`;
}
