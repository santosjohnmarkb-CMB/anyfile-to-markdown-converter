import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Check, Crown, FileText, Moon, Shield, Smartphone, Sparkles, Trash2, Coins } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Theme } from "@/constants/colors";
import { useHistory } from "@/providers/HistoryProvider";
import { FREE_CONVERSION_LIMIT, useSubscription } from "@/providers/SubscriptionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { ThemeMode } from "@/providers/ThemeProvider";

const EULA_URL = "https://www.apple.com/legal/internet-services/itunes/ph/terms.html";
const PRIVACY_URL = "https://cmbfilmsportal.com/techdev/published-apps/anything-to-markdown/privacy-policy";

const APPEARANCE_OPTIONS: { id: ThemeMode; label: string; hint: string; Icon: typeof Moon }[] = [
  { id: "dark", label: "Always dark", hint: "Keep the signature ink & amber look", Icon: Moon },
  { id: "system", label: "Match system", hint: "Follow your device appearance setting", Icon: Smartphone },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { records, clearAll } = useHistory();
  const { isPremium, remainingFree, purchasedCredits } = useSubscription();
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const selectMode = useCallback(
    (next: ThemeMode) => {
      if (Platform.OS !== "web") {
        Haptics.selectionAsync();
      }
      setMode(next);
    },
    [setMode],
  );

  const openUrl = useCallback(async (url: string) => {
    if (Platform.OS !== "web") {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } else {
      Linking.openURL(url);
    }
  }, []);

  const handleClear = useCallback(() => {
    if (records.length === 0) return;
    if (!confirmClear) {
      setConfirmClear(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    clearAll();
    setConfirmClear(false);
  }, [confirmClear, clearAll, records.length]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionLabel}>Subscription</Text>
        {isPremium ? (
          <View style={styles.proCard}>
            <View style={styles.proIcon}>
              <Crown color={theme.onAccent} size={20} strokeWidth={2.4} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.proTitle}>
                Pro<Text style={styles.proTitleAccent}>.md</Text>
              </Text>
              <Text style={styles.proHint}>Unlimited conversions unlocked. Thank you!</Text>
            </View>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.upsellCard, pressed && styles.rowPressed]}
            onPress={() => router.push("/paywall" as never)}
            testID="open-paywall"
          >
            <View style={styles.proIcon}>
              <Sparkles color={theme.onAccent} size={19} strokeWidth={2.4} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.proTitle}>
                Pro<Text style={styles.proTitleAccent}>.md</Text>
              </Text>
              <Text style={styles.proHint}>
                {purchasedCredits > 0
                  ? `${purchasedCredits} credit${purchasedCredits === 1 ? "" : "s"} remaining · ${remainingFree} of ${FREE_CONVERSION_LIMIT} free left`
                  : remainingFree > 0
                    ? `${remainingFree} of ${FREE_CONVERSION_LIMIT} free conversion${remainingFree === 1 ? "" : "s"} left`
                    : "Free conversions used — unlock unlimited"}
              </Text>
            </View>
            <Text style={styles.upsellCta}>View plans</Text>
          </Pressable>
        )}

        {purchasedCredits > 0 && !isPremium ? (
          <View style={styles.creditsCard}>
            <View style={styles.creditsIcon}>
              <Coins color={theme.onAccent} size={18} strokeWidth={2.4} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.creditsTitle}>Convert Credits</Text>
              <Text style={styles.creditsHint}>
                {purchasedCredits} credit{purchasedCredits === 1 ? "" : "s"} remaining · never expire
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          {APPEARANCE_OPTIONS.map((option, index) => {
            const selected = mode === option.id;
            const { Icon } = option;
            return (
              <Pressable
                key={option.id}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => selectMode(option.id)}
                testID={`appearance-${option.id}`}
              >
                <View style={styles.rowIcon}>
                  <Icon color={theme.accent} size={19} strokeWidth={2.2} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{option.label}</Text>
                  <Text style={styles.rowHint}>{option.hint}</Text>
                </View>
                {selected ? (
                  <View style={styles.check}>
                    <Check color={theme.onAccent} size={14} strokeWidth={3} />
                  </View>
                ) : (
                  <View style={styles.emptyCircle} />
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Saved conversions</Text>
              <Text style={styles.rowHint}>
                {records.length === 0
                  ? "Nothing stored on this device"
                  : `${records.length} note${records.length === 1 ? "" : "s"} stored on this device`}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.clearButton,
            confirmClear && styles.clearButtonConfirm,
            records.length === 0 && styles.clearButtonDisabled,
            pressed && records.length > 0 && styles.clearButtonPressed,
          ]}
          onPress={handleClear}
          disabled={records.length === 0}
          testID="clear-history"
        >
          <Trash2 color={records.length === 0 ? theme.textMuted : theme.red} size={18} />
          <Text
            style={[
              styles.clearLabel,
              records.length === 0 && styles.clearLabelDisabled,
            ]}
          >
            {confirmClear ? "Tap again to confirm" : "Clear Conversion History"}
          </Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => openUrl(EULA_URL)}
          >
            <View style={styles.rowIcon}>
              <FileText color={theme.accent} size={19} strokeWidth={2.2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Terms of Use (EULA)</Text>
              <Text style={styles.rowHint}>Apple's standard subscription terms</Text>
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
            onPress={() => openUrl(PRIVACY_URL)}
          >
            <View style={styles.rowIcon}>
              <Shield color={theme.accent} size={19} strokeWidth={2.2} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Privacy Policy</Text>
              <Text style={styles.rowHint}>How your data is handled</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <View style={styles.logoFrame}>
            <Image
              source={require("@/assets/images/cmb-techdev-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.copyright}>Copyright - CMB Techdev - MBS, 2026</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      paddingHorizontal: 20,
    },
    title: {
      color: theme.text,
      fontSize: 26,
      fontWeight: "800" as const,
      letterSpacing: -0.5,
      marginTop: 14,
      marginBottom: 20,
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "700" as const,
      textTransform: "uppercase" as const,
      letterSpacing: 1,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      overflow: "hidden" as const,
      marginBottom: 22,
    },
    proCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      borderRadius: 16,
      padding: 14,
      marginBottom: 22,
    },
    upsellCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      backgroundColor: theme.accentSoft,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      borderRadius: 16,
      padding: 14,
      marginBottom: 22,
    },
    creditsCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      borderRadius: 16,
      padding: 14,
      marginBottom: 22,
    },
    creditsIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    creditsTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700" as const,
    },
    creditsHint: {
      color: theme.textSecondary,
      fontSize: 12.5,
      marginTop: 2,
      lineHeight: 16,
    },
    proIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    proTitle: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "800" as const,
      letterSpacing: -0.5,
    },
    proTitleAccent: {
      color: theme.accent,
      fontFamily: "Menlo" as const,
      fontSize: 17,
      fontWeight: "400" as const,
    },
    proHint: {
      color: theme.textSecondary,
      fontSize: 12.5,
      marginTop: 2,
      lineHeight: 16,
    },
    upsellCta: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: "700" as const,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    rowPressed: {
      backgroundColor: theme.cardPressed,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor: theme.accentSoft,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "600" as const,
    },
    rowHint: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 16,
    },
    check: {
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
    clearButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: theme.redSoft,
      borderWidth: 1,
      borderColor: theme.redBorder,
      borderRadius: 14,
      height: 52,
    },
    clearButtonConfirm: {
      backgroundColor: theme.red,
      borderColor: theme.red,
    },
    clearButtonPressed: {
      opacity: 0.85,
    },
    clearButtonDisabled: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    clearLabel: {
      color: theme.red,
      fontSize: 15,
      fontWeight: "700" as const,
    },
    clearLabelDisabled: {
      color: theme.textMuted,
    },
    footer: {
      alignItems: "center",
      marginTop: 40,
      gap: 10,
    },
    logoFrame: {
      width: "100%",
      backgroundColor: "#000000",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 18,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    logo: {
      width: "78%",
      height: 84,
    },
    copyright: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
  });
