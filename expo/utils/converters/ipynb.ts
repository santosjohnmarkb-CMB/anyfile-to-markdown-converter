interface NotebookCell {
  cell_type?: string;
  source?: string | string[];
}

interface NotebookJson {
  cells?: NotebookCell[];
  metadata?: {
    title?: string;
    language_info?: { name?: string };
    kernelspec?: { language?: string; name?: string };
  };
}

/**
 * Converts a Jupyter notebook (.ipynb JSON) to Markdown, mirroring MarkItDown:
 * markdown cells verbatim, code cells fenced with the notebook language,
 * raw cells in plain fences; title from the first `# ` heading, else metadata.
 */
export function ipynbToMarkdown(json: string): { markdown: string; title: string | null } {
  const nb = JSON.parse(json) as NotebookJson;
  if (!Array.isArray(nb.cells)) throw new Error("Not a valid Jupyter notebook (no cells)");

  const lang =
    nb.metadata?.language_info?.name ?? nb.metadata?.kernelspec?.language ?? "python";

  let title: string | null = null;
  const parts: string[] = [];

  for (const cell of nb.cells) {
    const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
    if (source.trim().length === 0) continue;

    if (cell.cell_type === "markdown") {
      if (title === null) {
        const heading = source.match(/^#\s+(.+)$/m);
        if (heading) title = heading[1].trim();
      }
      parts.push(source.trim());
    } else if (cell.cell_type === "code") {
      parts.push(`\`\`\`${lang}\n${source.trimEnd()}\n\`\`\``);
    } else {
      parts.push(`\`\`\`\n${source.trimEnd()}\n\`\`\``);
    }
  }

  if (title === null && nb.metadata?.title) title = nb.metadata.title;
  return { markdown: parts.join("\n\n"), title };
}
