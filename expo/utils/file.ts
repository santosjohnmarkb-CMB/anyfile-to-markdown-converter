import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { base64ToUint8Array, slugifyFilename, utf8Decode } from "@/utils/encoding";
import type { PickedSource } from "@/types/conversion";

/** Wraps a native file URI (from expo-document-picker) into a PickedSource. */
export function sourceFromNativeUri(params: {
  name: string;
  uri: string;
  mimeType: string | null;
  size: number | null;
}): PickedSource {
  const { name, uri, mimeType, size } = params;
  return {
    name,
    mimeType,
    size,
    readBase64: async () => {
      return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    },
    readText: async () => {
      try {
        return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      } catch {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return utf8Decode(base64ToUint8Array(base64));
      }
    },
  };
}

/** Wraps a web File/Blob (picker or drag-drop) into a PickedSource. */
export function sourceFromWebFile(file: File): PickedSource {
  const readArrayBuffer = () =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });

  return {
    name: file.name,
    mimeType: file.type || null,
    size: file.size,
    readBase64: async () => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    readText: async () => {
      const buffer = await readArrayBuffer();
      return utf8Decode(new Uint8Array(buffer));
    },
  };
}

/** Saves markdown as a .md file: share sheet on native, download on web. */
export async function exportMarkdown(title: string, markdown: string): Promise<void> {
  const filename = `${slugifyFilename(title)}.md`;

  if (Platform.OS === "web") {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, markdown, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(fileUri, {
    mimeType: "text/markdown",
    dialogTitle: filename,
    UTI: "net.daringfireball.markdown",
  });
}
