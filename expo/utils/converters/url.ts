import { capSource } from "@/utils/convert";
import { buildDocument, DEFAULT_FLAVOR } from "@/utils/flavor";
import { htmlToMarkdown } from "@/utils/markdown/htmlToMarkdown";
import type { MarkdownFlavor } from "@/utils/flavor";
import type { ConversionResult } from "@/types/conversion";

const FETCH_TIMEOUT_MS = 20000;

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!/^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(withProtocol)) return null;
  return withProtocol;
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.includes("\n") || trimmed.includes(" ")) return false;
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(trimmed);
}

/** Fetches a web page once and converts it to Markdown locally. */
export async function convertUrl(
  rawUrl: string,
  flavor: MarkdownFlavor = DEFAULT_FLAVOR,
): Promise<ConversionResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("That doesn't look like a valid link");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      },
    });
  } catch (error) {
    console.log("[convertUrl] fetch failed", url, error);
    throw new Error("Couldn't reach that page. Check the link and your connection.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`The site responded with ${response.status}. Try a different link.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  const domain = url.replace(/^https?:\/\//i, "").split("/")[0];

  if (contentType.includes("text/html") || /^\s*<(!doctype|html)/i.test(bodyText)) {
    const { title, description, markdown } = htmlToMarkdown(bodyText, url);
    const noteTitle = title || domain;
    return {
      title: noteTitle,
      sourceType: "url",
      sourceName: url,
      flavor,
      markdown: buildDocument(flavor, {
        title: noteTitle,
        source: url,
        type: "web-clip",
        description,
        body: `# ${noteTitle}\n\n${markdown}`,
      }),
      sourceContent: capSource(bodyText),
    };
  }

  if (contentType.includes("markdown") || /\.md$/i.test(url)) {
    return {
      title: domain,
      sourceType: "url",
      sourceName: url,
      flavor,
      markdown: buildDocument(flavor, {
        title: domain,
        source: url,
        type: "web-clip",
        body: bodyText.trim(),
      }),
      sourceContent: capSource(bodyText),
    };
  }

  if (contentType.includes("text/") || contentType.includes("json")) {
    const fenced = contentType.includes("json") ? `\`\`\`json\n${bodyText.trim()}\n\`\`\`` : bodyText.trim();
    return {
      title: domain,
      sourceType: "url",
      sourceName: url,
      flavor,
      markdown: buildDocument(flavor, {
        title: domain,
        source: url,
        type: "web-clip",
        body: `# ${domain}\n\n${fenced}`,
      }),
      sourceContent: capSource(bodyText),
    };
  }

  return {
    title: domain,
    sourceType: "url",
    sourceName: url,
    flavor,
    markdown: buildDocument(flavor, {
      title: domain,
      source: url,
      type: "web-clip",
      body: `# ${domain}\n\n> [!warning] This link points to a \`${contentType || "binary"}\` file, not a readable page.\n\n[Open original](${url})`,
    }),
  };
}
