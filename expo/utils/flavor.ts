/**
 * Markdown flavor system.
 *
 * A single conversion engine produces an "Obsidian-shaped" body internally
 * (wiki embeds `![[file]]`, `> [!type]` callouts). `buildDocument` then emits
 * the final note in whichever flavor the user picked before converting:
 *
 * - obsidian      YAML frontmatter + wiki embeds + callouts (vault-ready)
 * - plain         no metadata, standard image links, plain blockquotes
 * - pandoc        Pandoc YAML title block + standard links (for `pandoc` / LaTeX / PDF)
 * - multimarkdown MMD metadata block (key: value) + standard links
 */

export type MarkdownFlavor = "obsidian" | "plain" | "pandoc" | "multimarkdown";

export interface FlavorInfo {
  id: MarkdownFlavor;
  label: string;
  tagline: string;
  description: string;
}

export const FLAVORS: readonly FlavorInfo[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    tagline: "Vault-ready notes",
    description: "YAML frontmatter, [[wiki]] embeds and callouts for your Obsidian vault, or anywhere you need a Markdown.",
  },
  {
    id: "plain",
    label: "Plain Markdown",
    tagline: "Universal & portable",
    description: "Clean CommonMark with no metadata — works in any editor, GitHub or CMS.",
  },
  {
    id: "pandoc",
    label: "Pandoc",
    tagline: "For docs, PDF & LaTeX",
    description: "Pandoc title block so you can render to PDF, Word or LaTeX.",
  },
  {
    id: "multimarkdown",
    label: "MultiMarkdown",
    tagline: "MMD metadata block",
    description: "MultiMarkdown key/value metadata header for MMD toolchains.",
  },
] as const;

export const DEFAULT_FLAVOR: MarkdownFlavor = "obsidian";

export function flavorInfo(flavor: MarkdownFlavor): FlavorInfo {
  return FLAVORS.find((f) => f.id === flavor) ?? FLAVORS[0];
}

export interface DocumentFields {
  title?: string;
  source: string;
  type: string;
  description?: string;
  body: string;
}

/** Builds the final note: flavor-specific metadata header + transformed body. */
export function buildDocument(flavor: MarkdownFlavor, fields: DocumentFields): string {
  const meta = buildMetadata(flavor, fields);
  const body = transformBody(flavor, fields.body).trim();
  return `${meta}${body}`.trim();
}

function esc(value: string): string {
  return value.replace(/"/g, "'");
}

function buildMetadata(flavor: MarkdownFlavor, fields: DocumentFields): string {
  const nowIso = new Date().toISOString();
  const date = nowIso.slice(0, 10);

  switch (flavor) {
    case "plain":
      return "";

    case "pandoc": {
      const lines = ["---"];
      if (fields.title) lines.push(`title: "${esc(fields.title)}"`);
      lines.push(`date: "${date}"`);
      lines.push(`source: "${esc(fields.source)}"`);
      if (fields.description) lines.push(`abstract: "${esc(fields.description).slice(0, 300)}"`);
      lines.push("---", "", "");
      return lines.join("\n");
    }

    case "multimarkdown": {
      const lines: string[] = [];
      if (fields.title) lines.push(`Title: ${fields.title.replace(/\n/g, " ")}`);
      lines.push(`Source: ${fields.source.replace(/\n/g, " ")}`);
      lines.push(`Date: ${date}`);
      lines.push(`Type: ${fields.type}`);
      if (fields.description) {
        lines.push(`Description: ${fields.description.replace(/\n/g, " ").slice(0, 300)}`);
      }
      lines.push("", "");
      return lines.join("\n");
    }

    case "obsidian":
    default: {
      const lines = ["---"];
      if (fields.title) lines.push(`title: "${esc(fields.title)}"`);
      lines.push(`source: "${esc(fields.source)}"`);
      if (fields.description) {
        lines.push(`description: "${esc(fields.description).slice(0, 300)}"`);
      }
      lines.push(`saved: ${nowIso}`);
      lines.push(`type: ${fields.type}`);
      lines.push("tags:");
      lines.push("  - clippings");
      lines.push("---", "", "");
      return lines.join("\n");
    }
  }
}

const CALLOUT_LABELS: Record<string, string> = {
  warning: "Warning",
  info: "Info",
  note: "Note",
  tip: "Tip",
  important: "Important",
  caution: "Caution",
  danger: "Danger",
  error: "Error",
};

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Rewrites Obsidian-only syntax to portable Markdown for non-Obsidian flavors.
 * Obsidian keeps its native `![[embed]]` and `> [!callout]` syntax untouched.
 */
function transformBody(flavor: MarkdownFlavor, body: string): string {
  if (flavor === "obsidian") return body;

  let out = body;

  // Wiki embeds: ![[file.png]] -> ![file.png](file.png)
  out = out.replace(/!\[\[([^\]]+)\]\]/g, (_match, name: string) => {
    const clean = name.trim();
    return `![${clean}](${encodeURI(clean)})`;
  });

  // Remaining wiki links: [[Page]] -> Page (plain text)
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_match, name: string) => {
    const clean = name.trim();
    const display = clean.includes("|") ? clean.split("|")[1].trim() : clean;
    return display;
  });

  // Callouts: "> [!warning] Title" -> "> **Title**" (or "> **Warning**")
  out = out.replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, (_match, type: string, rest: string) => {
    const heading = rest.trim();
    if (heading.length > 0) return `> **${heading}**`;
    const key = type.toLowerCase();
    return `> **${CALLOUT_LABELS[key] ?? capitalize(type)}**`;
  });

  return out;
}
