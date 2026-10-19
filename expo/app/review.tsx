import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import {
  Check,
  FileCode2,
  FileText,
  GripHorizontal,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FlavorBadge from "@/components/FlavorBadge";
import MarkdownPreview from "@/components/MarkdownPreview";
import TypeBadge from "@/components/TypeBadge";
import type { Theme } from "@/constants/colors";
import { useHistory } from "@/providers/HistoryProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { countWords } from "@/utils/encoding";

type TopPaneMode = "source" | "edit";

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { pending, addRecord, clearPending } = useHistory();

  const [topMode, setTopMode] = useState<TopPaneMode>("source");
  const [markdown, setMarkdown] = useState<string>(pending?.markdown ?? "");
  const [ratio, setRatio] = useState<number>(0.42);

  const containerHeight = useRef<number>(0);
  const ratioRef = useRef<number>(0.42);
  const dragStartRatio = useRef<number>(0.42);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          dragStartRatio.current = ratioRef.current;
        },
        onPanResponderMove: (_evt, gesture) => {
          if (containerHeight.current <= 0) return;
          const next = Math.min(
            MAX_RATIO,
            Math.max(MIN_RATIO, dragStartRatio.current + gesture.dy / containerHeight.current),
          );
          ratioRef.current = next;
          setRatio(next);
        },
      }),
    [],
  );

  const wordCount = useMemo(() => countWords(markdown), [markdown]);

  const handleSave = useCallback(() => {
    if (!pending) return;
    const record = addRecord({ ...pending, markdown });
    clearPending();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    router.replace(`/result/${record.id}` as never);
  }, [pending, markdown, addRecord, clearPending, router]);

  const handleDiscard = useCallback(() => {
    clearPending();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  }, [clearPending, router]);

  if (!pending) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.missingText}>Nothing to review.</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const sourceContent =
    pending.sourceContent && pending.sourceContent.length > 0
      ? pending.sourceContent
      : `No raw source preview available for "${pending.sourceName}".`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={handleDiscard} hitSlop={10} style={styles.headerButton} testID="discard-button">
          <X color={theme.textSecondary} size={20} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Review before saving</Text>
            <FlavorBadge flavor={pending.flavor} />
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {pending.sourceName}
          </Text>
        </View>
        <TypeBadge type={pending.sourceType} size={34} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={styles.splitContainer}
          onLayout={(e) => {
            containerHeight.current = e.nativeEvent.layout.height;
          }}
        >
          {/* Top pane — source / editable markdown */}
          <View style={[styles.pane, { flex: ratio }]}>
            <View style={styles.paneHeader}>
              <View style={styles.segmentRow}>
                <Pressable
                  style={[styles.segment, topMode === "source" && styles.segmentActive]}
                  onPress={() => setTopMode("source")}
                  testID="pane-source"
                >
                  <FileText
                    color={topMode === "source" ? theme.accent : theme.textMuted}
                    size={13}
                  />
                  <Text
                    style={[styles.segmentLabel, topMode === "source" && styles.segmentLabelActive]}
                  >
                    Source
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segment, topMode === "edit" && styles.segmentActive]}
                  onPress={() => setTopMode("edit")}
                  testID="pane-edit"
                >
                  <FileCode2
                    color={topMode === "edit" ? theme.accent : theme.textMuted}
                    size={13}
                  />
                  <Text
                    style={[styles.segmentLabel, topMode === "edit" && styles.segmentLabelActive]}
                  >
                    Markdown
                  </Text>
                </Pressable>
              </View>
            </View>
            {topMode === "source" ? (
              <ScrollView
                style={styles.paneScroll}
                contentContainerStyle={styles.paneScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sourceText} selectable>
                  {sourceContent}
                </Text>
              </ScrollView>
            ) : (
              <TextInput
                style={styles.editInput}
                value={markdown}
                onChangeText={setMarkdown}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Markdown…"
                placeholderTextColor={theme.textMuted}
                testID="markdown-editor"
              />
            )}
          </View>

          {/* Draggable divider */}
          <View style={styles.divider} {...panResponder.panHandlers}>
            <View style={styles.dividerHandle}>
              <GripHorizontal color={theme.textMuted} size={16} />
            </View>
          </View>

          {/* Bottom pane — live preview */}
          <View style={[styles.pane, { flex: 1 - ratio }]}>
            <View style={styles.paneHeader}>
              <Text style={styles.paneTitle}>Live preview</Text>
              <Text style={styles.paneMeta}>{wordCount.toLocaleString()} words</Text>
            </View>
            <ScrollView
              style={styles.paneScroll}
              contentContainerStyle={styles.paneScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <MarkdownPreview markdown={markdown} />
            </ScrollView>
          </View>
        </View>

        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable style={styles.discardButton} onPress={handleDiscard}>
            <Text style={styles.discardLabel}>Discard</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={handleSave} testID="save-button">
            <Check color={theme.onAccent} size={19} strokeWidth={2.6} />
            <Text style={styles.saveLabel}>Save to History</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  flex: {
    flex: 1,
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  headerSubtitle: {
    color: theme.textMuted,
    fontSize: 11,
    fontFamily: "Menlo" as const,
    marginTop: 2,
  },
  splitContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  pane: {
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    overflow: "hidden" as const,
  },
  paneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.card,
  },
  paneTitle: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  paneMeta: {
    color: theme.textMuted,
    fontSize: 11,
  },
  segmentRow: {
    flexDirection: "row",
    backgroundColor: theme.bg,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 2,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
  },
  segmentActive: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.borderStrong,
  },
  segmentLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  segmentLabelActive: {
    color: theme.text,
  },
  paneScroll: {
    flex: 1,
  },
  paneScrollContent: {
    padding: 14,
    paddingBottom: 24,
  },
  sourceText: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Menlo" as const,
  },
  editInput: {
    flex: 1,
    color: theme.codeText,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: "Menlo" as const,
    padding: 14,
  },
  divider: {
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  dividerHandle: {
    width: 56,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  discardButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 20,
  },
  discardLabel: {
    color: theme.textSecondary,
    fontSize: 14,
    fontWeight: "700" as const,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.accent,
    borderRadius: 14,
    height: 52,
  },
  saveLabel: {
    color: theme.onAccent,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  });
