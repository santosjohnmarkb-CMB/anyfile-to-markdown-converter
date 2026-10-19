import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ChevronRight, Inbox, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import TypeBadge from "@/components/TypeBadge";
import type { Theme } from "@/constants/colors";
import { useHistory } from "@/providers/HistoryProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { ConversionRecord } from "@/types/conversion";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { records, removeRecord, clearAll } = useHistory();
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    clearAll();
    setConfirmClear(false);
  }, [confirmClear, clearAll]);

  const handleDelete = useCallback(
    (id: string) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      removeRecord(id);
    },
    [removeRecord],
  );

  const renderItem = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ({ item }: { item: ConversionRecord }) => (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/result/${item.id}` as never)}
        testID={`history-item-${item.id}`}
      >
        <TypeBadge type={item.sourceType} size={40} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardSource} numberOfLines={1}>
            {item.sourceName}
          </Text>
          <Text style={styles.cardMeta}>
            {item.wordCount.toLocaleString()} words · {formatDate(item.createdAt)}
          </Text>
        </View>
        <Pressable onPress={() => handleDelete(item.id)} hitSlop={10} style={styles.deleteButton}>
          <Trash2 color={theme.textMuted} size={17} />
        </Pressable>
        <ChevronRight color={theme.textMuted} size={18} />
      </Pressable>
    ),
    [router, handleDelete, styles],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        {records.length > 0 ? (
          <Pressable
            onPress={handleClear}
            style={[styles.clearButton, confirmClear && styles.clearButtonConfirm]}
          >
            <Text style={[styles.clearLabel, confirmClear && styles.clearLabelConfirm]}>
              {confirmClear ? "Tap to confirm" : "Clear all"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {records.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Inbox color={theme.textMuted} size={30} />
          </View>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyText}>
            Convert a file, link, or note and it will be stored here — on this device only.
          </Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  clearButtonConfirm: {
    backgroundColor: theme.redSoft,
    borderColor: theme.redBorder,
  },
  clearLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  clearLabelConfirm: {
    color: theme.red,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 12,
  },
  cardPressed: {
    backgroundColor: theme.cardPressed,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  cardSource: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: "Menlo" as const,
  },
  cardMeta: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  deleteButton: {
    padding: 6,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700" as const,
  },
  emptyText: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center" as const,
  },
  });
