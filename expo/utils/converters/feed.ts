import { decodeHtmlEntities } from "@/utils/encoding";
import { htmlToMarkdown } from "@/utils/markdown/htmlToMarkdown";

const MAX_ITEMS = 50;

/** Quick sniff: is this XML an RSS or Atom feed? */
export function isFeed(xml: string): boolean {
  const head = xml.slice(0, 4000);
  return /<rss[\s>]/.test(head) || /<feed[\s>]/.test(head) || /<rdf:RDF[\s>]/.test(head);
}

/**
 * Converts an RSS/Atom feed to Markdown, mirroring MarkItDown:
 * `# Channel Title`, then per item `## Item Title`, `Published on: date`,
 * followed by the item description/content converted from HTML.
 */
export function feedToMarkdown(xml: string): { markdown: string; title: string | null } {
  if (/<feed[\s>]/.test(xml.slice(0, 4000))) return atomToMarkdown(xml);
  return rssToMarkdown(xml);
}

function rssToMarkdown(xml: string): { markdown: string; title: string | null } {
  const channel = xml.match(/<channel[\s\S]*?>([\s\S]*)<\/channel>/)?.[1] ?? xml;
  const items = channel.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/g) ?? [];
  const firstItem = items[0];
  const beforeItems = firstItem !== undefined ? channel.slice(0, channel.indexOf(firstItem)) : channel;

  const title = tagText(beforeItems, "title");
  const description = tagText(beforeItems, "description");

  const parts: string[] = [];
  if (title) parts.push(`# ${title}`);
  if (description) parts.push(description);

  for (const item of items.slice(0, MAX_ITEMS)) {
    const itemTitle = tagText(item, "title");
    const pubDate = tagText(item, "pubDate");
    const encoded = cdataOrText(item, "content:encoded");
    const desc = encoded || cdataOrText(item, "description");

    if (itemTitle) parts.push(`## ${itemTitle}`);
    if (pubDate) parts.push(`Published on: ${pubDate}`);
    if (desc) parts.push(htmlFragmentToMarkdown(desc));
  }

  if (items.length > MAX_ITEMS) parts.push(`> Truncated: showing ${MAX_ITEMS} of ${items.length} items.`);
  return { markdown: parts.join("\n\n"), title };
}

function atomToMarkdown(xml: string): { markdown: string; title: string | null } {
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/g) ?? [];
  const firstEntry = entries[0];
  const beforeEntries = firstEntry !== undefined ? xml.slice(0, xml.indexOf(firstEntry)) : xml;

  const title = tagText(beforeEntries, "title");
  const subtitle = tagText(beforeEntries, "subtitle");

  const parts: string[] = [];
  if (title) parts.push(`# ${title}`);
  if (subtitle) parts.push(subtitle);

  for (const entry of entries.slice(0, MAX_ITEMS)) {
    const entryTitle = tagText(entry, "title");
    const updated = tagText(entry, "updated");
    const content = cdataOrText(entry, "content") || cdataOrText(entry, "summary");

    if (entryTitle) parts.push(`## ${entryTitle}`);
    if (updated) parts.push(`Updated on: ${updated}`);
    if (content) parts.push(htmlFragmentToMarkdown(content));
  }

  if (entries.length > MAX_ITEMS) parts.push(`> Truncated: showing ${MAX_ITEMS} of ${entries.length} entries.`);
  return { markdown: parts.join("\n\n"), title };
}

function tagText(xml: string, tag: string): string | null {
  const raw = cdataOrText(xml, tag);
  if (!raw) return null;
  const clean = raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return clean.length > 0 ? clean : null;
}

/** Extracts tag content, unwrapping CDATA and decoding entities. */
function cdataOrText(xml: string, tag: string): string | null {
  const escaped = tag.replace(":", "\\:");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`));
  if (!match) return null;
  let inner = match[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) inner = cdata[1];
  else inner = decodeHtmlEntities(inner);
  return inner.trim().length > 0 ? inner.trim() : null;
}

function htmlFragmentToMarkdown(fragment: string): string {
  if (!/[<>]/.test(fragment)) return fragment.trim();
  const { markdown } = htmlToMarkdown(fragment);
  return markdown.trim();
}
