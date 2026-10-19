import { Check, ChevronDown, FileText } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { Theme } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";
import { FLAVORS, flavorInfo } from "@/utils/flavor";
import type { MarkdownFlavor } from "@/utils/flavor";

interface Props {
  value: MarkdownFlavor;
  onChange: (flavor: MarkdownFlavor) => void;
}

/** Step-one output-format selector: a dropdown that opens a picker sheet. */
export default function FlavorPicker({ value, onChange }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState<boolean>(false);
  const current = flavorInfo(value);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <View style={styles.stepDot}>
          <Text style={styles.stepDotText}>1</Text>
        </View>
        <Text style={styles.label}>Output format</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        onPress={() => setOpen(true)}
        testID="flavor-trigger"
      >
        <View style={styles.triggerIcon}>
          <FileText color={theme.accent} size={18} strokeWidth={2.2} />
        </View>
        <View style={styles.triggerText}>
          <Text style={styles.triggerLabel}>{current.label}</Text>
          <Text style={styles.triggerTagline}>{current.tagline}</Text>
        </View>
        <ChevronDown color={theme.textSecondary} size={20} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Choose output format</Text>
            <Text style={styles.sheetSubtitle}>
              How your Markdown is structured. You can change this anytime.
            </Text>
            {FLAVORS.map((flavor) => {
              const selected = flavor.id === value;
              return (
                <Pressable
                  key={flavor.id}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                  onPress={() => {
                    onChange(flavor.id);
                    setOpen(false);
                  }}
                  testID={`flavor-${flavor.id}`}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{flavor.label}</Text>
                    <Text style={styles.optionDesc}>{flavor.description}</Text>
                  </View>
                  {selected ? (
                    <View style={styles.checkCircle}>
                      <Check color={theme.onAccent} size={14} strokeWidth={3} />
                    </View>
                  ) : (
                    <View style={styles.emptyCircle} />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800" as const,
  },
  label: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerPressed: {
    backgroundColor: theme.cardPressed,
  },
  triggerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerText: {
    flex: 1,
  },
  triggerLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  triggerTagline: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(6, 8, 11, 0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderStrong,
    marginBottom: 16,
  },
  sheetTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800" as const,
  },
  sheetSubtitle: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 14,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  optionSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  optionPressed: {
    backgroundColor: theme.cardPressed,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  optionDesc: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.borderStrong,
  },
  });
