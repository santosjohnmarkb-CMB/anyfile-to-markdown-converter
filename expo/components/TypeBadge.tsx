import {
  BookOpen,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  FolderArchive,
  Globe,
  NotebookPen,
  Presentation,
  Rss,
  StickyNote,
} from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

import type { Theme } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";
import type { SourceType } from "@/types/conversion";

type BadgeStyle = { color: string; bg: string; Icon: typeof FileText };

function configFor(theme: Theme): Record<SourceType, BadgeStyle> {
  return {
    url: { color: theme.blue, bg: theme.blueSoft, Icon: Globe },
    pdf: { color: theme.red, bg: theme.redSoft, Icon: FileType },
    docx: { color: theme.blue, bg: theme.blueSoft, Icon: FileText },
    sheet: { color: theme.green, bg: theme.greenSoft, Icon: FileSpreadsheet },
    html: { color: theme.accent, bg: theme.accentSoft, Icon: FileCode },
    json: { color: theme.purple, bg: theme.purpleSoft, Icon: FileJson },
    slides: { color: theme.red, bg: theme.redSoft, Icon: Presentation },
    notebook: { color: theme.green, bg: theme.greenSoft, Icon: NotebookPen },
    epub: { color: theme.blue, bg: theme.blueSoft, Icon: BookOpen },
    archive: { color: theme.accent, bg: theme.accentSoft, Icon: FolderArchive },
    feed: { color: theme.accent, bg: theme.accentSoft, Icon: Rss },
    text: { color: theme.accent, bg: theme.accentSoft, Icon: StickyNote },
    image: { color: theme.purple, bg: theme.purpleSoft, Icon: FileImage },
    video: { color: theme.purple, bg: theme.purpleSoft, Icon: FileVideo },
    audio: { color: theme.purple, bg: theme.purpleSoft, Icon: FileAudio },
    other: { color: theme.textSecondary, bg: theme.bgElevated, Icon: FileText },
  };
}

export default function TypeBadge({ type, size = 38 }: { type: SourceType; size?: number }) {
  const { theme } = useTheme();
  const { color, bg, Icon } = configFor(theme)[type];
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg },
      ]}
    >
      <Icon color={color} size={size * 0.52} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
  },
});
