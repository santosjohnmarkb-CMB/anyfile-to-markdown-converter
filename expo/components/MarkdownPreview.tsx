import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BookOpen,
  Bug,
  CircleCheck,
  CircleHelp,
  Info,
  Lightbulb,
  ListChecks,
  Quote,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react-native";

import type { Theme } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";

interface Props {
  markdown: string;
}

type ListItem = {
  marker: string;
  text: string;
  indent: number;
  checked?: "todo" | "done" | undefined;
};

type CalloutKind =
  | "note"
  | "info"
  | "tip"
  | "success"
  | "question"
  | "warning"
  | "failure"
  | "danger"
  | "bug"
  | "example"
  | "quote"
  | "todo"
  | "abstract";

type Block =
  | { kind: "heading"; level: number; text: string; key: string }
  | { kind: "paragraph"; text: string; key: string }
  | { kind: "quote"; lines: string[]; key: string }
  | { kind: "callout"; calloutKind: CalloutKind; title: string; lines: string[]; key: string }
  | { kind: "code"; lang: string; code: string; key: string }
  | { kind: "list"; items: ListItem[]; key: string }
  | { kind: "table"; rows: string[][]; key: string }
  | { kind: "hr"; key: string }
  | { kind: "frontmatter"; entries: [string, string][]; key: string }
  | { kind: "footnotes"; entries: { id: string; text: string }[]; key: string }
  | { kind: "displaymath"; latex: string; key: string };

interface InlineSegment {
  type:
    | "text"
    | "bold"
    | "italic"
    | "bolditalic"
    | "code"
    | "link"
    | "image"
    | "strikethrough"
    | "latex"
    | "footnote"
    | "reflink"
    | "wikilink"
    | "tag"
    | "autolink";
  text: string;
  url?: string;
  ref?: string;
}

/** Parsed reference link / footnote definitions, used to resolve inline references. */
interface Refs {
  links: Map<string, string>;
  footnotes: Map<string, string>;
}

// -- Callout configuration --------------------------------------------------

const CALLOUT_CONFIG: Record<
  CalloutKind,
  { icon: LucideIcon; colorKey: "blue" | "green" | "accent" | "red" | "purple"; label: string }
> = {
  note: { icon: Info, colorKey: "blue", label: "Note" },
  info: { icon: Info, colorKey: "blue", label: "Info" },
  tip: { icon: Lightbulb, colorKey: "green", label: "Tip" },
  success: { icon: CircleCheck, colorKey: "green", label: "Success" },
  question: { icon: CircleHelp, colorKey: "blue", label: "Question" },
  warning: { icon: TriangleAlert, colorKey: "accent", label: "Warning" },
  failure: { icon: TriangleAlert, colorKey: "red", label: "Failure" },
  danger: { icon: TriangleAlert, colorKey: "red", label: "Danger" },
  bug: { icon: Bug, colorKey: "red", label: "Bug" },
  example: { icon: ListChecks, colorKey: "purple", label: "Example" },
  quote: { icon: Quote, colorKey: "accent", label: "Quote" },
  todo: { icon: CircleCheck, colorKey: "accent", label: "Todo" },
  abstract: { icon: BookOpen, colorKey: "purple", label: "Abstract" },
};

const CALLOUT_ALIASES: Record<string, CalloutKind> = {
  note: "note",
  info: "info",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  faq: "question",
  help: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  examples: "example",
  quote: "quote",
  cite: "quote",
  todo: "todo",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  flame: "danger",
  fire: "danger",
};

/**
 * Lightweight on-device markdown renderer implementing the Markdown cheat-sheet
 * spec plus Obsidian extensions: headings, paragraphs (with hard breaks),
 * bold/italic/bold-italic (asterisk + underscore), strikethrough, inline code,
 * inline LaTeX, display math ($$), links (inline + reference + autolinks),
 * images, wiki links, tags, footnotes, lists (ordered/unordered/nested/task),
 * blockquotes, Obsidian/GFM callouts, code blocks, tables, horizontal rules,
 * YAML frontmatter, and backslash escapes.
 */
export default function MarkdownPreview({ markdown }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { blocks, refs } = useMemo(() => parseBlocks(markdown), [markdown]);

  return (
    <View style={styles.container}>
      {blocks.map((block) => (
        <BlockView key={block.key} block={block} refs={refs} />
      ))}
    </View>
  );
}

const BlockView = React.memo(({ block, refs }: { block: Block; refs: Refs }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  switch (block.kind) {
    case "frontmatter":
      return (
        <View style={styles.frontmatter}>
          {block.entries.map(([k, v], i) => (
            <View key={`${k}-${i}`} style={styles.fmRow}>
              <Text style={styles.fmKey}>{k}</Text>
              <Text style={styles.fmValue} numberOfLines={2}>
                {v}
              </Text>
            </View>
          ))}
        </View>
      );
    case "heading": {
      const sizes = [26, 22, 19, 17, 16, 15];
      const size = sizes[Math.min(block.level - 1, 5)];
      return (
        <Text style={[styles.heading, { fontSize: size, marginTop: block.level <= 2 ? 18 : 12 }]}>
          <InlineText text={block.text} baseStyle={{ fontSize: size }} refs={refs} />
        </Text>
      );
    }
    case "paragraph":
      return (
        <Text style={styles.paragraph}>
          <InlineText text={block.text} refs={refs} />
        </Text>
      );
    case "quote":
      return (
        <View style={styles.quote}>
          {block.lines.map((line, i) => (
            <Text key={i} style={styles.quoteText}>
              <InlineText text={line} muted refs={refs} />
            </Text>
          ))}
        </View>
      );
    case "callout": {
      const cfg = CALLOUT_CONFIG[block.calloutKind] ?? CALLOUT_CONFIG.note;
      const Icon = cfg.icon;
      const color = theme[cfg.colorKey];
      return (
        <View style={[styles.callout, { borderLeftColor: color }]}>
          <View style={styles.calloutHeader}>
            <Icon color={color} size={15} strokeWidth={2.4} />
            <Text style={[styles.calloutTitle, { color }]}>
              {block.title || cfg.label}
            </Text>
          </View>
          {block.lines.map((line, i) => (
            <Text key={i} style={styles.calloutText}>
              <InlineText text={line} refs={refs} />
            </Text>
          ))}
        </View>
      );
    }
    case "displaymath":
      return (
        <View style={styles.displayMathBlock}>
          <Text style={styles.displayMathText}>{block.latex.trim()}</Text>
        </View>
      );
    case "code":
      return (
        <View style={styles.codeBlock}>
          {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
          <Text style={styles.codeText}>{block.code}</Text>
        </View>
      );
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={[styles.listItem, { paddingLeft: 4 + item.indent * 14 }]}>
              {item.checked !== undefined ? (
                <Text style={styles.checkbox}>
                  {item.checked === "done" ? "\u2611" : "\u2610"}
                </Text>
              ) : (
                <Text style={styles.listMarker}>{item.marker}</Text>
              )}
              <Text
                style={[
                  styles.listText,
                  item.checked === "done" && styles.listTextDone,
                ]}
              >
                <InlineText text={item.text} refs={refs} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "table": {
      const header = block.rows[0] ?? [];
      const body = block.rows.slice(1, 30);
      return (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            {header.map((cell, i) => (
              <Text key={i} style={[styles.tableCell, styles.tableHeaderCell]} numberOfLines={2}>
                {cell}
              </Text>
            ))}
          </View>
          {body.map((row, ri) => (
            <View key={ri} style={[styles.tableRow, ri % 2 === 1 && styles.tableRowAlt]}>
              {header.map((_, ci) => (
                <Text key={ci} style={styles.tableCell} numberOfLines={3}>
                  {row[ci] ?? ""}
                </Text>
              ))}
            </View>
          ))}
          {block.rows.length > 31 ? (
            <Text style={styles.tableMore}>… {block.rows.length - 31} more rows</Text>
          ) : null}
        </View>
      );
    }
    case "footnotes":
      return (
        <View style={styles.footnotes}>
          {block.entries.map((entry) => (
            <View key={entry.id} style={styles.footnoteRow}>
              <Text style={styles.footnoteRef}>{entry.id}</Text>
              <Text style={styles.footnoteText}>
                <InlineText text={entry.text} muted refs={refs} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "hr":
      return <View style={styles.hr} />;
    default:
      return null;
  }
});
BlockView.displayName = "BlockView";

const InlineText = React.memo(
  ({
    text,
    muted,
    baseStyle,
    refs,
  }: {
    text: string;
    muted?: boolean;
    baseStyle?: { fontSize: number };
    refs: Refs;
  }) => {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const segments = useMemo(() => tokenizeInline(text, refs), [text, refs]);
    return (
      <>
        {segments.map((seg, i) => {
          if (seg.type === "bold")
            return (
              <Text key={i} style={styles.bold}>
                {renderTextWithBreaks(seg.text)}
              </Text>
            );
          if (seg.type === "italic")
            return (
              <Text key={i} style={styles.italic}>
                {renderTextWithBreaks(seg.text)}
              </Text>
            );
          if (seg.type === "bolditalic")
            return (
              <Text key={i} style={[styles.bold, styles.italic]}>
                {renderTextWithBreaks(seg.text)}
              </Text>
            );
          if (seg.type === "strikethrough")
            return (
              <Text key={i} style={styles.strikethrough}>
                {renderTextWithBreaks(seg.text)}
              </Text>
            );
          if (seg.type === "code")
            return (
              <Text key={i} style={styles.inlineCode}>
                {seg.text}
              </Text>
            );
          if (seg.type === "latex")
            return (
              <Text key={i} style={styles.latex}>
                {seg.text}
              </Text>
            );
          if (seg.type === "link")
            return (
              <Text key={i} style={styles.link}>
                {renderTextWithBreaks(seg.text)}
              </Text>
            );
          if (seg.type === "autolink")
            return (
              <Text key={i} style={styles.link}>
                {seg.text}
              </Text>
            );
          if (seg.type === "reflink") {
            const url = refs.links.get(seg.ref?.toLowerCase() ?? "");
            return (
              <Text key={i} style={styles.link}>
                {renderTextWithBreaks(url ? seg.text : `${seg.text}`)}
              </Text>
            );
          }
          if (seg.type === "wikilink")
            return (
              <Text key={i} style={styles.wikiLink}>
                {seg.text}
              </Text>
            );
          if (seg.type === "tag")
            return (
              <Text key={i} style={styles.tag}>
                {seg.text}
              </Text>
            );
          if (seg.type === "image")
            return (
              <Text key={i} style={styles.imageToken}>
                🖼 {seg.text || "image"}
              </Text>
            );
          if (seg.type === "footnote")
            return (
              <Text key={i} style={styles.footnoteMarker}>
                [{seg.text}]
              </Text>
            );
          return (
            <Text key={i} style={[muted ? styles.mutedText : undefined, baseStyle]}>
              {renderTextWithBreaks(seg.text)}
            </Text>
          );
        })}
      </>
    );
  },
);
InlineText.displayName = "InlineText";

/** Splits text on \n so React Native renders hard line breaks instead of collapsing them. */
function renderTextWithBreaks(text: string): (string | React.ReactElement)[] {
  if (!text.includes("\n")) return [text];
  const parts = text.split("\n");
  const out: (string | React.ReactElement)[] = [];
  parts.forEach((part, idx) => {
    if (idx > 0) out.push(<Text key={`br${idx}`}>{"\n"}</Text>);
    out.push(part);
  });
  return out;
}

// Matches capture groups in priority order:
//  1  image inline    ![alt](url)        — group 1 = alt, group 2 = url
//  3  image wiki       ![[name]]          — group 3
//  4  display math     $$...$$            — group 4 (inline occurrence; block-level handled separately)
//  5  bold-italic      ***text***         — group 5
//  6  bold-italic      ___text___         — group 6
//  7  bold             **text**           — group 7
//  8  bold             __text__           — group 8
//  9  wiki link        [[target|label]]   — group 9
// 10  footnote         [^id]              — group 10
// 11  reflink          [text][ref]        — group 11 = text, group 12 = ref
// 13  inline link      [text](url)        — group 13 = text, group 14 = url
// 15  strikethrough    ~~text~~           — group 15
// 16  inline LaTeX     $text$             — group 16
// 17  inline code      `code`             — group 17
// 18  autolink         <url>              — group 18
// 19  tag              #tag               — group 19 = preceding ws, group 20 = tag name
const INLINE_REGEX = new RegExp(
  [
    "!\\[([^\\]]*)\\]\\(([^)]*)\\)", // image inline
    "|!\\[\\[([^\\]]+)\\]\\]", // image wiki
    "|\\$\\$([\\s\\S]+?)\\$\\$", // display math (inline occurrence)
    "|\\*\\*\\*([^*]+)\\*\\*\\*", // bold-italic ***
    "|___([^_]+)___", // bold-italic ___
    "|\\*\\*([^*]+)\\*\\*", // bold **
    "|__([^_]+)__", // bold __
    "|\\[\\[([^\\]]+?)\\]\\]", // wiki link
    "|\\[\\^([^\\]]+)\\]", // footnote marker
    "|\\[([^\\]]+)\\]\\[([^\\]]+)\\]", // reference link
    "|\\[([^\\]]+)\\]\\(([^)]*)\\)", // inline link
    "|~~([^~]+)~~", // strikethrough
    "|\\$([^$\\n]+)\\$", // inline LaTeX
    "|`([^`]+)`", // inline code
    "|<(https?://[^>]+)>", // autolink URL
    "|(^|\\s)#([a-zA-Z_][\\w/-]*)", // tag — first char must be letter or underscore (Obsidian spec)
  ].join(""),
  "g",
);

/**
 * Tokenizes a single line/paragraph into inline segments.
 * Supports: images, inline links, reference links, autolinks, wiki links,
 * tags, footnotes, bold-italic, bold (asterisk + underscore), italic,
 * strikethrough, inline LaTeX, inline code, and backslash escapes.
 *
 * Escaped characters are replaced with placeholder tokens before regex
 * matching, and restored AFTER the italic second pass so that escaped
 * asterisks/underscores are not mistaken for italic markers.
 */
function tokenizeInline(text: string, refs: Refs): InlineSegment[] {
  // First pass: process backslash escapes, protecting escaped characters
  // from being consumed by markdown syntax.
  const ESCAPED_MAP = new Map<string, string>();
  const working = text.replace(/\\([\\`*_{}\[\]()#+\-.!~<>$|])/g, (_m, ch: string) => {
    const placeholder = `\x00ESC${ESCAPED_MAP.size}\x00`;
    ESCAPED_MAP.set(placeholder, ch);
    return placeholder;
  });

  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_REGEX.lastIndex = 0;

  while ((match = INLINE_REGEX.exec(working)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: working.slice(lastIndex, match.index) });
    }

    // image inline  ![alt](url)  — group 1 = alt, group 2 = url
    if (match[1] !== undefined) {
      segments.push({ type: "image", text: match[1] });
    }
    // image wiki  ![[name]]  — group 3
    else if (match[3] !== undefined) {
      segments.push({ type: "image", text: match[3] });
    }
    // display math  $$...$$ (inline occurrence) — group 4
    else if (match[4] !== undefined) {
      segments.push({ type: "latex", text: match[4].trim() });
    }
    // bold-italic ***text*** — group 5
    else if (match[5] !== undefined) {
      segments.push({ type: "bolditalic", text: match[5] });
    }
    // bold-italic ___text___ — group 6
    else if (match[6] !== undefined) {
      segments.push({ type: "bolditalic", text: match[6] });
    }
    // bold **text** — group 7
    else if (match[7] !== undefined) {
      segments.push({ type: "bold", text: match[7] });
    }
    // bold __text__ — group 8
    else if (match[8] !== undefined) {
      segments.push({ type: "bold", text: match[8] });
    }
    // wiki link [[target|label]] or [[target]] — group 9
    else if (match[9] !== undefined) {
      const pipeIdx = match[9].indexOf("|");
      const label = pipeIdx >= 0 ? match[9].slice(pipeIdx + 1).trim() : match[9].trim();
      segments.push({ type: "wikilink", text: label });
    }
    // footnote marker [^id] — group 10
    else if (match[10] !== undefined) {
      segments.push({ type: "footnote", text: match[10] });
    }
    // reference link [text][ref] — group 11 = text, group 12 = ref
    else if (match[11] !== undefined) {
      segments.push({ type: "reflink", text: match[11], ref: match[12] });
    }
    // inline link [text](url) — group 13 = text, group 14 = url
    else if (match[13] !== undefined) {
      segments.push({ type: "link", text: match[13], url: match[14] });
    }
    // strikethrough ~~text~~ — group 15
    else if (match[15] !== undefined) {
      segments.push({ type: "strikethrough", text: match[15] });
    }
    // inline LaTeX $text$ — group 16
    else if (match[16] !== undefined) {
      segments.push({ type: "latex", text: match[16] });
    }
    // inline code `code` — group 17
    else if (match[17] !== undefined) {
      segments.push({ type: "code", text: match[17] });
    }
    // autolink <https://...> — group 18
    else if (match[18] !== undefined) {
      segments.push({ type: "autolink", text: match[18] });
    }
    // tag #tag — group 19 = preceding ws, group 20 = tag name
    else if (match[20] !== undefined) {
      if (match[19] && match[19].length > 0) {
        segments.push({ type: "text", text: match[19] });
      }
      segments.push({ type: "tag", text: `#${match[20]}` });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < working.length) {
    segments.push({ type: "text", text: working.slice(lastIndex) });
  }

  // Second pass: single-asterisk and single-underscore italic on escaped text
  // (placeholders protect escaped * and _ from being matched as italic).
  const withItalic = applyItalicPass(segments);

  // Final pass: restore all backslash escapes.
  if (ESCAPED_MAP.size === 0) return withItalic;
  return withItalic.map((seg) => ({
    ...seg,
    text: restoreEscapes(seg.text, ESCAPED_MAP),
  }));
}

/** Restores backslash-escaped characters from their placeholder tokens. */
function restoreEscapes(text: string, map: Map<string, string>): string {
  if (map.size === 0) return text;
  return text.replace(/\x00ESC(\d+)\x00/g, (_m, idx: string) => map.get(`\x00ESC${idx}\x00`) ?? "");
}

/**
 * Second pass: applies single-asterisk and single-underscore italic to
 * text segments that weren't consumed by bold/bold-italic patterns.
 */
function applyItalicPass(segments: InlineSegment[]): InlineSegment[] {
  const result: InlineSegment[] = [];
  for (const seg of segments) {
    if (seg.type !== "text") {
      result.push(seg);
      continue;
    }
    // Split on *text* and _text_ patterns.
    const italicRegex = /\*([^*\n]+)\*|_([^_\n]+)_/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = italicRegex.exec(seg.text)) !== null) {
      if (m.index > lastIdx) {
        result.push({ type: "text", text: seg.text.slice(lastIdx, m.index) });
      }
      const inner = m[1] ?? m[2] ?? "";
      result.push({ type: "italic", text: inner });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < seg.text.length) {
      result.push({ type: "text", text: seg.text.slice(lastIdx) });
    }
  }
  return result;
}

// -- Block parser -----------------------------------------------------------

const TASK_RE = /^\[([ xX])\]\s+(.*)$/;

/** Matches an Obsidian/GFM callout line: > [!type] optional title */
const CALLOUT_RE = /^>\s*\[!(\w+)\]\s*(.*)$/i;

/** Matches $$ at the start of a line (display math block). */
const DISPLAY_MATH_RE = /^\$\$/;

function parseBlocks(markdown: string): { blocks: Block[]; refs: Refs } {
  const refs: Refs = { links: new Map(), footnotes: new Map() };
  let lines = markdown.split("\n");
  let keyCounter = 0;
  const nextKey = () => `b${keyCounter++}`;

  // Frontmatter
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end > 0) {
      const entries: [string, string][] = [];
      for (const line of lines.slice(1, end)) {
        const m = line.match(/^([\w-]+):\s*(.*)$/);
        if (m && m[2].trim()) entries.push([m[1], m[2].replace(/^["']|["']$/g, "")]);
        else if (line.trim().startsWith("- ")) {
          const last = entries[entries.length - 1];
          if (last) last[1] = `${last[1]}${last[1] ? ", " : ""}${line.trim().slice(2)}`.trim();
        }
      }
      if (entries.length > 0) {
        (parseBlocks as unknown as { _fm?: [string, string][] })._fm = entries;
      }
      lines = lines.slice(end + 1);
    }
  }

  // Extract reference link definitions and footnote definitions.
  const cleaned: string[] = [];
  const footnoteEntries: { id: string; text: string }[] = [];
  for (const line of lines) {
    // Matches [ref]: url  "optional title"  — excludes [^id]: (footnote defs)
    const refMatch = line.match(/^\s*\[([^\]^][^\]]*)\]:\s*(\S+)(?:\s+"([^"]*)")?\s*$/);
    if (refMatch) {
      refs.links.set(refMatch[1].toLowerCase(), refMatch[2]);
      continue;
    }
    const fnMatch = line.match(/^\s*\[\^([^\]]+)\]:\s*(.*)$/);
    if (fnMatch) {
      refs.footnotes.set(fnMatch[1], fnMatch[2]);
      footnoteEntries.push({ id: fnMatch[1], text: fnMatch[2] });
      continue;
    }
    cleaned.push(line);
  }
  lines = cleaned;

  const blocks: Block[] = [];

  // Push frontmatter if captured
  const fm = (parseBlocks as unknown as { _fm?: [string, string][] })._fm;
  if (fm && fm.length > 0) {
    blocks.push({ kind: "frontmatter", entries: fm, key: nextKey() });
    (parseBlocks as unknown as { _fm?: [string, string][] })._fm = undefined;
  }

  let i = 0;
  const MAX_BLOCKS = 600;
  while (i < lines.length && blocks.length < MAX_BLOCKS) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      i++;
      continue;
    }

    // Display math block: $$ ... $$ (may span multiple lines)
    if (DISPLAY_MATH_RE.test(trimmed)) {
      const mathLines: string[] = [];
      // Check if the opening $$ also closes on the same line: $$E=mc^2$$
      const singleLine = trimmed.slice(2);
      if (singleLine.endsWith("$$") && singleLine.length > 2) {
        blocks.push({
          kind: "displaymath",
          latex: singleLine.slice(0, -2),
          key: nextKey(),
        });
        i++;
        continue;
      }
      // If there's content after $$ on the same line (not closing), include it.
      if (singleLine.trim().length > 0) {
        mathLines.push(singleLine);
      }
      i++;
      while (i < lines.length && !DISPLAY_MATH_RE.test(lines[i].trim())) {
        mathLines.push(lines[i]);
        i++;
      }
      // Consume the closing $$
      if (i < lines.length) i++;
      blocks.push({ kind: "displaymath", latex: mathLines.join("\n"), key: nextKey() });
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", lang, code: codeLines.join("\n"), key: nextKey() });
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ kind: "heading", level: headingMatch[1].length, text: headingMatch[2], key: nextKey() });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: "hr", key: nextKey() });
      i++;
      continue;
    }

    // Blockquote — check for callout first
    if (trimmed.startsWith(">")) {
      const calloutMatch = trimmed.match(CALLOUT_RE);
      if (calloutMatch) {
        const calloutType = (calloutMatch[1] || "").toLowerCase();
        const calloutKind = CALLOUT_ALIASES[calloutType] ?? "note";
        const calloutTitle = calloutMatch[2] || "";
        const calloutLines: string[] = [];
        i++;
        // Collect subsequent > lines (stop at a new callout definition)
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          // Check the RAW line (before stripping >) for a callout definition
          if (lines[i].trim().match(CALLOUT_RE)) break;
          const content = lines[i].trim().replace(/^>\s?/, "");
          calloutLines.push(content);
          i++;
        }
        blocks.push({
          kind: "callout",
          calloutKind,
          title: calloutTitle.trim(),
          lines: calloutLines,
          key: nextKey(),
        });
        continue;
      }
      // Regular blockquote
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: quoteLines, key: nextKey() });
      continue;
    }

    // Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.replace(/\\\|/g, "|").trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length > 0) blocks.push({ kind: "table", rows, key: nextKey() });
      continue;
    }

    // List (ordered, unordered, nested, task)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();

        // Blank line — peek ahead; if the list continues, skip blanks (loose list).
        if (t.length === 0) {
          let j = i + 1;
          while (j < lines.length && lines[j].trim().length === 0) j++;
          if (j < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[j])) {
            i = j;
            continue;
          }
          break;
        }

        const m = l.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (m) {
          const indent = Math.min(Math.floor(m[1].length / 2), 4);
          const marker = /\d/.test(m[2]) ? m[2] : "•";
          const taskMatch = m[3].match(TASK_RE);
          if (taskMatch) {
            items.push({
              marker,
              text: taskMatch[2],
              indent,
              checked: taskMatch[1].trim().toLowerCase() === "x" ? "done" : "todo",
            });
          } else {
            items.push({ marker, text: m[3], indent });
          }
          i++;
          continue;
        }

        // Indented continuation line — belongs to the current item.
        if (
          /^\s{2,}/.test(l) &&
          !t.startsWith("#") &&
          !t.startsWith(">") &&
          !t.startsWith("```") &&
          !(t.startsWith("|") && t.endsWith("|"))
        ) {
          const last = items[items.length - 1];
          if (last) last.text += "\n" + t;
          i++;
          continue;
        }

        break;
      }
      if (items.length > 0) blocks.push({ kind: "list", items, key: nextKey() });
      continue;
    }

    // Paragraph — gather consecutive non-empty plain lines.
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (
        t.length === 0 ||
        t.startsWith("#") ||
        t.startsWith(">") ||
        t.startsWith("```") ||
        (t.startsWith("|") && t.endsWith("|")) ||
        /^(\s*)([-*+]|\d+\.)\s+/.test(l) ||
        DISPLAY_MATH_RE.test(t)
      )
        break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      const text = paraLines
        .map((l) => {
          const trailing = l.length - l.replace(/\s+$/, "").length;
          if (trailing >= 2) return l.replace(/\s+$/, "\n");
          if (/\\$/.test(l)) return l.replace(/\\$/, "\n");
          return l + " ";
        })
        .join("")
        .replace(/\s+$/, "");
      blocks.push({ kind: "paragraph", text, key: nextKey() });
    } else {
      i++;
    }
  }

  // Footnotes section (rendered at the end, like the guide shows).
  if (footnoteEntries.length > 0) {
    blocks.push({ kind: "footnotes", entries: footnoteEntries, key: nextKey() });
  }

  return { blocks, refs };
}

// -- Styles -----------------------------------------------------------------

const mono = { fontFamily: "Menlo" as const };

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  container: {
    gap: 10,
  },
  frontmatter: {
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 6,
  },
  fmRow: {
    flexDirection: "row",
    gap: 10,
  },
  fmKey: {
    color: theme.accent,
    fontSize: 12,
    ...mono,
    minWidth: 82,
  },
  fmValue: {
    color: theme.textSecondary,
    fontSize: 12,
    flex: 1,
    ...mono,
  },
  heading: {
    color: theme.text,
    fontWeight: "700" as const,
    lineHeight: 32,
  },
  paragraph: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 24,
  },
  bold: {
    fontWeight: "700" as const,
    color: theme.text,
  },
  italic: {
    fontStyle: "italic" as const,
    color: theme.text,
  },
  strikethrough: {
    textDecorationLine: "line-through" as const,
    color: theme.textMuted,
  },
  inlineCode: {
    ...mono,
    fontSize: 13,
    color: theme.accent,
    backgroundColor: theme.codeBg,
  },
  latex: {
    ...mono,
    fontSize: 13.5,
    color: theme.purple,
    fontStyle: "italic" as const,
  },
  link: {
    color: theme.blue,
    textDecorationLine: "underline" as const,
  },
  wikiLink: {
    color: theme.purple,
    textDecorationLine: "underline" as const,
    fontWeight: "600" as const,
  },
  tag: {
    color: theme.accent,
    fontWeight: "600" as const,
    fontSize: 13,
  },
  imageToken: {
    color: theme.purple,
    fontSize: 13,
  },
  footnoteMarker: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "700" as const,
    ...mono,
  },
  mutedText: {
    color: theme.textSecondary,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
    paddingLeft: 12,
    paddingVertical: 4,
    gap: 4,
  },
  quoteText: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  callout: {
    borderLeftWidth: 3,
    borderRadius: 8,
    backgroundColor: theme.bgElevated,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  calloutText: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 21,
  },
  displayMathBlock: {
    backgroundColor: theme.purpleSoft,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    alignItems: "center" as const,
  },
  displayMathText: {
    ...mono,
    fontSize: 15,
    color: theme.purple,
    fontStyle: "italic" as const,
    textAlign: "center" as const,
  },
  codeBlock: {
    backgroundColor: theme.codeBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  codeLang: {
    color: theme.textMuted,
    fontSize: 11,
    ...mono,
    marginBottom: 6,
  },
  codeText: {
    color: theme.codeText,
    fontSize: 12.5,
    lineHeight: 19,
    ...mono,
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: "row",
    gap: 8,
  },
  listMarker: {
    color: theme.accent,
    fontSize: 15,
    lineHeight: 24,
  },
  checkbox: {
    color: theme.accent,
    fontSize: 17,
    lineHeight: 24,
  },
  listText: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 24,
    flex: 1,
  },
  listTextDone: {
    color: theme.textMuted,
    textDecorationLine: "line-through" as const,
  },
  table: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  tableRow: {
    flexDirection: "row",
  },
  tableRowAlt: {
    backgroundColor: theme.bgElevated,
  },
  tableHeader: {
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderStrong,
  },
  tableCell: {
    flex: 1,
    color: theme.textSecondary,
    fontSize: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    color: theme.text,
    fontWeight: "600" as const,
  },
  tableMore: {
    color: theme.textMuted,
    fontSize: 11,
    padding: 8,
    ...mono,
  },
  footnotes: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 10,
    gap: 6,
  },
  footnoteRow: {
    flexDirection: "row",
    gap: 8,
  },
  footnoteRef: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "700" as const,
    ...mono,
    minWidth: 24,
  },
  footnoteText: {
    color: theme.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    flex: 1,
  },
  hr: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 8,
  },
  });
