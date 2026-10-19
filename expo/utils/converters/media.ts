import { formatBytes } from "@/utils/encoding";

/**
 * Builds an Obsidian-ready embed note for binary media (images, video, audio, archives…)
 * that cannot be meaningfully converted to text locally.
 */
export function buildMediaNote(params: {
  name: string;
  mimeType: string | null;
  size: number | null;
  kind: "image" | "video" | "audio" | "other";
}): string {
  const { name, mimeType, size, kind } = params;
  const kindLabel =
    kind === "image" ? "Image" : kind === "video" ? "Video" : kind === "audio" ? "Audio" : "File";

  const lines: string[] = [];
  lines.push(`# ${name}`);
  lines.push("");
  lines.push(`![[${name}]]`);
  lines.push("");
  lines.push(`> [!info] ${kindLabel} attachment`);
  lines.push(`> - **File:** \`${name}\``);
  if (mimeType) lines.push(`> - **Type:** \`${mimeType}\``);
  lines.push(`> - **Size:** ${formatBytes(size)}`);
  lines.push(`> - **Captured:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(
    `Copy \`${name}\` into your vault's attachments folder and the embed above will render in Obsidian.`,
  );
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- ");
  return lines.join("\n");
}
