import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Theme } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";
import { flavorInfo } from "@/utils/flavor";
import type { MarkdownFlavor } from "@/utils/flavor";

interface Props {
  flavor?: string;
}

const KNOWN: readonly MarkdownFlavor[] = ["obsidian", "plain", "pandoc", "multimarkdown"];

/** A small pill showing which Markdown flavor a note was generated in. */
export default function FlavorBadge({ flavor }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!flavor || !KNOWN.includes(flavor as MarkdownFlavor)) return null;
  const info = flavorInfo(flavor as MarkdownFlavor);

  return (
    <View style={styles.pill} testID="flavor-badge">
      <View style={styles.dot} />
      <Text style={styles.label}>{info.label}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: theme.accentSoft,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      borderRadius: 20,
      paddingLeft: 8,
      paddingRight: 11,
      paddingVertical: 4,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.accent,
    },
    label: {
      color: theme.accent,
      fontSize: 11,
      fontWeight: "700" as const,
      letterSpacing: 0.2,
    },
  });
