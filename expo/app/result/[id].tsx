import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronLeft, Copy, Download, Eye, FileCode2 } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FlavorBadge from "@/components/FlavorBadge";
import MarkdownPreview from "@/components/MarkdownPreview";
import TypeBadge from "@/components/TypeBadge";
import type { Theme } from "@/constants/colors";
import { useHistory } from "@/providers/HistoryProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { slugifyFilename } from "@/utils/encoding";
import { exportMarkdown } from "@/utils/file";

type ViewMode = "preview" | "raw";

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { getRecord } = useHistory();

  const record = useMemo(() => (id ? getRecord(id) : undefined), [id, getRecord]);

  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [copied, setCopied] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    if (!record) return;
    try {
      await Clipboard.setStringAsync(record.markdown);
      setCopied(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.log("[copy] failed", error);
      setExportError("Couldn't copy to clipboard.");
    }
  }, [record]);

  const handleExport = useCallback(async () => {
    if (!record) return;
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await exportMarkdown(record.title, record.markdown);
    } catch (error) {
      console.log("[export] failed", error);
      setExportError(error instanceof Error ? error.message : "Export failed.");
    }
  }, [record]);

  if (!record) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.missingText}>This note is no longer in your history.</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const filename = `${slugifyFilename(record.title)}.md`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ChevronLeft color={theme.text} size={24} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerFilename} numberOfLines={1}>
            {filename}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.metaCard}>
        <TypeBadge type={record.sourceType} size={42} />
        <View style={styles.metaInfo}>
          <Text style={styles.metaTitle} numberOfLines={2}>
            {record.title}
          </Text>
          <Text style={styles.metaStats}>
            {record.wordCount.toLocaleString()} words · {formatSize(record.charCount)} ·{" "}
            {new Date(record.createdAt).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
        <FlavorBadge flavor={record.flavor} />
      </View>

      <View style={styles.segmentRow}>
        <Pressable
          style={[styles.segment, viewMode === "preview" && styles.segmentActive]}
          onPress={() => setViewMode("preview")}
          testID="segment-preview"
        >
          <Eye color={viewMode === "preview" ? theme.accent : theme.textMuted} size={15} />
          <Text style={[styles.segmentLabel, viewMode === "preview" && styles.segmentLabelActive]}>
            Preview
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, viewMode === "raw" && styles.segmentActive]}
          onPress={() => setViewMode("raw")}
          testID="segment-raw"
        >
          <FileCode2 color={viewMode === "raw" ? theme.accent : theme.textMuted} size={15} />
          <Text style={[styles.segmentLabel, viewMode === "raw" && styles.segmentLabelActive]}>
            Markdown
          </Text>
        </Pressable>
      </View>

      {exportError ? (
        <Pressable style={styles.errorBanner} onPress={() => setExportError(null)}>
          <Text style={styles.errorText}>{exportError}</Text>
        </Pressable>
      ) : null}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {viewMode === "preview" ? (
          <MarkdownPreview markdown={record.markdown} />
        ) : (
          <View style={styles.rawBlock}>
            <Text style={styles.rawText} selectable>
              {record.markdown}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={[styles.copyButton, copied && styles.copyButtonDone]}
          onPress={handleCopy}
          testID="copy-button"
        >
          {copied ? (
            <Check color={theme.onAccent} size={19} strokeWidth={2.6} />
          ) : (
            <Copy color={theme.onAccent} size={18} strokeWidth={2.4} />
          )}
          <Text style={styles.copyLabel}>{copied ? "Copied!" : "Copy Markdown"}</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={handleExport} testID="export-button">
          <Download color={theme.accent} size={19} />
          <Text style={styles.exportLabel}>{Platform.OS === "web" ? "Download" : "Save .md"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} chars`;
  return `${(chars / 1024).toFixed(1)} KB`;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  missingText: {
    color: theme.textSecondary,
    fontSize: 14,
  },
  backLink: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backLinkText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButton: {
    padding: 6,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerFilename: {
    color: theme.textSecondary,
    fontSize: 13,
    fontFamily: "Menlo" as const,
  },
  headerSpacer: {
    width: 36,
  },
  metaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  metaInfo: {
    flex: 1,
  },
  metaTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700" as const,
    lineHeight: 23,
  },
  metaStats: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: theme.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 3,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.borderStrong,
  },
  segmentLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  segmentLabelActive: {
    color: theme.text,
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: theme.redSoft,
    borderWidth: 1,
    borderColor: theme.redBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    color: theme.red,
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  rawBlock: {
    backgroundColor: theme.codeBg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
  },
  rawText: {
    color: theme.codeText,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: "Menlo" as const,
  },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  copyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.accent,
    borderRadius: 14,
    height: 52,
  },
  copyButtonDone: {
    backgroundColor: theme.green,
  },
  copyLabel: {
    color: theme.onAccent,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 18,
  },
  exportLabel: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "700" as const,
  },
  });
