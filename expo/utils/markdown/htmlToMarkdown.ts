import { decodeHtmlEntities } from "@/utils/encoding";

export interface HtmlConversion {
  title: string;
  description: string;
  markdown: string;
}

/**
 * Converts raw HTML into clean Markdown entirely on-device.
 * Regex-pipeline approach (no DOM available on Hermes) tuned for article-style pages.
 */
export function htmlToMarkdown(rawHtml: string, baseUrl?: string): HtmlConversion {
  const html = rawHtml.replace(/\r\n?/g, "\n");

  const title = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "";
  const description =
    extractFirst(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ??
    extractFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) ??
    extractFirst(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i) ??
    "";

  let body = extractBody(html);
  body = stripNoise(body);

  // Protect code blocks before other transforms.
  const codeBlocks: string[] = [];
  body = body.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
    const lang = extractFirst(inner, /class=["'][^"']*language-([a-zA-Z0-9+#-]+)/) ?? "";
    const codeText = decodeHtmlEntities(
      inner
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/^\n+|\n+$/g, ""),
    );
    codeBlocks.push("```" + lang + "\n" + codeText + "\n```");
    return `\n\n\u0000CODE${codeBlocks.length - 1}\u0000\n\n`;
  });

  body = convertTables(body);
  body = convertLists(body);

  body = body
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) => {
      const text = inlineToMd(inner, baseUrl).trim();
      return text ? `\n\n${"#".repeat(parseInt(level, 10))} ${text}\n\n` : "\n\n";
    })
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner: string) => {
      const text = inlineToMd(inner, baseUrl)
        .replace(/<\/?p[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();
      const quoted = text
        .split("\n")
        .map((line) => `> ${line.trim()}`)
        .join("\n");
      return `\n\n${quoted}\n\n`;
    })
    .replace(/<hr[^>]*\/?>/gi, "\n\n---\n\n");

  body = inlineToMd(body, baseUrl);

  body = body
    .replace(/<\/(p|div|section|article|main|figure|figcaption|header|footer|aside|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  body = decodeHtmlEntities(body);

  // Restore code blocks.
  body = body.replace(/\u0000CODE(\d+)\u0000/g, (_, idx: string) => codeBlocks[parseInt(idx, 10)] ?? "");

  body = body
    .split("\n")
    .map((line) => (line.trim().length === 0 ? "" : line.replace(/[ \t]+/g, " ").replace(/^ +| +$/g, "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: decodeHtmlEntities(title).trim(),
    description: decodeHtmlEntities(description).trim(),
    markdown: body,
  };
}

function extractFirst(text: string, regex: RegExp): string | undefined {
  const match = text.match(regex);
  return match?.[1]?.trim() || undefined;
}

function extractBody(html: string): string {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article && article[1].length > 500) return article[1];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main && main[1].length > 500) return main[1];
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<template[^>]*>[\s\S]*?<\/template>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<(button|select|input|textarea|label)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(input|button)[^>]*\/?>/gi, "");
}

function convertLists(html: string): string {
  let out = html;
  // Process innermost lists first, up to 4 nesting levels.
  for (let pass = 0; pass < 4; pass++) {
    const before = out;
    out = out.replace(
      /<(ul|ol)[^>]*>((?:(?!<\/?(?:ul|ol)[\s>])[\s\S])*?)<\/\1>/gi,
      (_, tag: string, inner: string) => {
        const ordered = tag.toLowerCase() === "ol";
        const items = inner.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) ?? [];
        const lines = items.map((item, index) => {
          const content = item
            .replace(/^<li[^>]*>/i, "")
            .replace(/<\/li>$/i, "")
            .replace(/\n+/g, " ")
            .trim();
          const marker = ordered ? `${index + 1}.` : "-";
          return `${marker} ${content}`;
        });
        return `\n\n${lines.join("\n")}\n\n`;
      },
    );
    if (out === before) break;
  }
  return out;
}

function convertTables(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner: string) => {
    const rows = inner.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
    if (rows.length === 0) return "\n\n";
    const parsed: string[][] = rows.map((row) => {
      const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) ?? [];
      return cells.map((cell) =>
        decodeHtmlEntities(
          cell
            .replace(/^<t[hd][^>]*>/i, "")
            .replace(/<\/t[hd]>$/i, "")
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .replace(/\|/g, "\\|")
            .trim(),
        ),
      );
    });
    const colCount = Math.max(...parsed.map((r) => r.length), 1);
    const header = parsed[0];
    const bodyRows = parsed.slice(1);
    const pad = (row: string[]) => {
      const cells = [...row];
      while (cells.length < colCount) cells.push("");
      return `| ${cells.join(" | ")} |`;
    };
    const lines = [
      pad(header),
      `| ${Array(colCount).fill("---").join(" | ")} |`,
      ...bodyRows.map(pad),
    ];
    return `\n\n${lines.join("\n")}\n\n`;
  });
}

function resolveUrl(href: string, baseUrl?: string): string {
  if (!baseUrl || /^(https?:|data:|mailto:|tel:)/i.test(href)) return href;
  try {
    if (href.startsWith("//")) {
      const protocol = baseUrl.split("//")[0] || "https:";
      return `${protocol}${href}`;
    }
    const origin = baseUrl.match(/^https?:\/\/[^/]+/i)?.[0] ?? "";
    if (href.startsWith("/")) return `${origin}${href}`;
    if (href.startsWith("#")) return `${baseUrl}${href}`;
    const dir = baseUrl.replace(/[^/]*$/, "");
    return `${dir}${href}`;
  } catch {
    return href;
  }
}

function inlineToMd(html: string, baseUrl?: string): string {
  return html
    .replace(/<img[^>]*>/gi, (tag) => {
      const src = extractFirst(tag, /src=["']([^"']+)["']/i);
      if (!src || src.startsWith("data:")) return "";
      const alt = extractFirst(tag, /alt=["']([^"']*)["']/i) ?? "";
      return `![${alt.replace(/\n/g, " ")}](${resolveUrl(src, baseUrl)})`;
    })
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (tag, inner: string) => {
      const href = extractFirst(tag, /href=["']([^"']+)["']/i);
      const text = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!href || href.startsWith("javascript:")) return text;
      if (!text) return "";
      return `[${text}](${resolveUrl(href, baseUrl)})`;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      return text ? `**${text}**` : "";
    })
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      return text ? `*${text}*` : "";
    })
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inner: string) => {
      const text = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ""));
      return text.trim() ? `\`${text.trim()}\`` : "";
    })
    .replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      return text ? `~~${text}~~` : "";
    });
}
