export type SourceType =
  | "url"
  | "text"
  | "pdf"
  | "docx"
  | "sheet"
  | "html"
  | "json"
  | "slides"
  | "notebook"
  | "epub"
  | "archive"
  | "feed"
  | "image"
  | "video"
  | "audio"
  | "other";

export interface ConversionRecord {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceName: string;
  markdown: string;
  createdAt: number;
  wordCount: number;
  charCount: number;
  /** Markdown flavor this note was generated in (obsidian | plain | pandoc | multimarkdown). */
  flavor?: string;
}

export interface ConversionResult {
  title: string;
  sourceType: SourceType;
  sourceName: string;
  markdown: string;
  /** Markdown flavor this note was generated in. */
  flavor?: string;
  /** Raw source content (original text/HTML/extracted text) shown in the review split view. */
  sourceContent?: string;
}

/** Abstraction over a picked/dropped file so native, web picker and web drag-drop share one path. */
export interface PickedSource {
  name: string;
  mimeType: string | null;
  size: number | null;
  readBase64: () => Promise<string>;
  readText: () => Promise<string>;
}
