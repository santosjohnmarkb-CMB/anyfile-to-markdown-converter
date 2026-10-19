import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Check, FileDown, Lock, Sparkles, X, Zap, Coins, Heart } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Theme } from "@/constants/colors";
import {
  CREDITS_PACK,
  SUBSCRIPTION_PLANS,
  useSubscription,
} from "@/providers/SubscriptionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import {
  fetchCreditsProduct,
  fetchMonthlySubscription,
  fetchWeeklySubscription,
  isMockMode,
  purchaseCredits,
  purchaseMonthlySubscription,
  purchaseWeeklySubscription,
  restoreSubscription,
  type CreditsProductInfo,
  type SubscriptionProductInfo,
} from "@/services/StoreKitService";

/** Apple's standard EULA for auto-renewable subscriptions. */
const EULA_URL = "https://www.apple.com/legal/internet-services/itunes/ph/terms.html";
/** App privacy policy. */
const PRIVACY_URL = "https://cmbfilmsportal.com/techdev/published-apps/anything-to-markdown/privacy-policy";

const PERKS: { icon: typeof Zap; label: string }[] = [
  { icon: Zap, label: "Unlimited conversions — no daily caps" },
  { icon: FileDown, label: "Every format: PDF, DOCX, XLSX, HTML, and more" },
  { icon: Sparkles, label: "All Markdown flavors & future updates" },
  { icon: Lock, label: "100% on-device — nothing ever leaves your phone" },
];

type Selection = "weekly" | "monthly" | "credits";

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { activatePremium, addCredits } = useSubscription();

  const [selected, setSelected] = useState<Selection>("weekly");
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState<string | null>(null);
  const [weeklyProduct, setWeeklyProduct] = useState<SubscriptionProductInfo | null>(null);
  const [subProduct, setSubProduct] = useState<SubscriptionProductInfo | null>(null);
  const [creditsProduct, setCreditsProduct] = useState<CreditsProductInfo | null>(null);

  // Fetch live localized prices from StoreKit on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      const [weeklyInfo, subInfo, creditsInfo] = await Promise.all([
        fetchWeeklySubscription(),
        fetchMonthlySubscription(),
        fetchCreditsProduct(),
      ]);
      if (!active) return;
      if (weeklyInfo) setWeeklyProduct(weeklyInfo);
      if (subInfo) setSubProduct(subInfo);
      if (creditsInfo) setCreditsProduct(creditsInfo);
    })();
    return () => {
      active = false;
    };
  }, []);

  const mockMode = isMockMode();

  const openUrl = useCallback(async (url: string) => {
    if (Platform.OS !== "web") {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } else {
      Linking.openURL(url);
    }
  }, []);

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)" as never);
    }
  }, [router]);

  const selectOption = useCallback((option: Selection) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    setSelected(option);
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (purchasing) return;
    setErrorMessage(null);
    setThankYou(null);
    setPurchasing(true);
    try {
      if (selected === "credits") {
        await purchaseCredits();
        addCredits(creditsProduct?.credits ?? CREDITS_PACK.credits);
        setThankYou(
          `${creditsProduct?.credits ?? CREDITS_PACK.credits} Conversion Credits added to your account. Happy converting!`,
        );
      } else if (selected === "weekly") {
        await purchaseWeeklySubscription();
        activatePremium();
        setThankYou("Welcome to Pro! You now have unlimited conversions.");
      } else {
        await purchaseMonthlySubscription();
        activatePremium();
        setThankYou("Welcome to Pro! You now have unlimited conversions.");
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Purchase couldn't be completed. Try again.";
      if (message !== "cancelled") {
        setErrorMessage(message);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } finally {
      setPurchasing(false);
    }
  }, [purchasing, selected, activatePremium, addCredits, creditsProduct]);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setErrorMessage(null);
    setThankYou(null);
    setRestoring(true);
    try {
      const restored = await restoreSubscription();
      if (restored) {
        activatePremium();
        setThankYou("Your Pro subscription has been restored.");
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setErrorMessage("No active subscription found to restore.");
      }
    } catch {
      setErrorMessage("Couldn't restore purchases. Try again.");
    } finally {
      setRestoring(false);
    }
  }, [restoring, activatePremium]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable onPress={close} hitSlop={12} style={styles.closeButton} testID="paywall-close">
            <X color={theme.textMuted} size={20} />
          </Pressable>
        </View>

        {thankYou ? (
          <View style={styles.thankYouCard}>
            <View style={styles.thankYouIcon}>
              <Heart color={theme.onAccent} size={26} strokeWidth={2.2} fill={theme.onAccent} />
            </View>
            <Text style={styles.thankYouTitle}>Thank you!</Text>
            <Text style={styles.thankYouMessage}>{thankYou}</Text>
            <Pressable onPress={close} style={styles.thankYouButton} testID="thank-you-done">
              <Text style={styles.thankYouButtonLabel}>Start Converting</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <FileDown color={theme.accent} size={34} strokeWidth={2.2} />
              </View>
              <Text style={styles.heroTitle}>
                Unlock <Text style={styles.heroTitleAccent}>anything.md</Text> Pro
              </Text>
              <Text style={styles.heroSubtitle}>
                You&apos;ve used your 2 free conversions. Go Pro weekly or monthly for unlimited
                Markdown, or grab a 5-credit pack — no expiry.
              </Text>
            </View>

            <View style={styles.perks}>
              {PERKS.map((perk) => {
                const { icon: Icon } = perk;
                return (
                  <View key={perk.label} style={styles.perkRow}>
                    <View style={styles.perkIcon}>
                      <Icon color={theme.accent} size={16} strokeWidth={2.4} />
                    </View>
                    <Text style={styles.perkLabel}>{perk.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Pro Weekly subscription card */}
            <Pressable
              onPress={() => selectOption("weekly")}
              style={[styles.optionCard, selected === "weekly" && styles.optionCardSelected]}
              testID="plan-weekly"
            >
              <View style={styles.radioWrap}>
                <View style={[styles.radioOuter, selected === "weekly" && styles.radioOuterSelected]}>
                  {selected === "weekly" ? <Check color={theme.onAccent} size={13} strokeWidth={3} /> : null}
                </View>
              </View>
              <View style={styles.optionInfo}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>Pro Weekly</Text>
                </View>
                <Text style={styles.optionCaption}>Unlimited conversions · billed weekly, cancel anytime</Text>
              </View>
              <View style={styles.optionPricing}>
                <Text style={styles.optionPrice}>{weeklyProduct?.price ?? SUBSCRIPTION_PLANS[0].price}</Text>
                <Text style={styles.optionPeriod}>{weeklyProduct ? weeklyProduct.period : SUBSCRIPTION_PLANS[0].period}</Text>
              </View>
            </Pressable>

            {/* Monthly subscription card */}
            <Pressable
              onPress={() => selectOption("monthly")}
              style={[styles.optionCard, selected === "monthly" && styles.optionCardSelected]}
              testID="plan-monthly"
            >
              <View style={styles.radioWrap}>
                <View style={[styles.radioOuter, selected === "monthly" && styles.radioOuterSelected]}>
                  {selected === "monthly" ? <Check color={theme.onAccent} size={13} strokeWidth={3} /> : null}
                </View>
              </View>
              <View style={styles.optionInfo}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>Monthly Pro</Text>
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
                  </View>
                </View>
                <Text style={styles.optionCaption}>Unlimited conversions · billed monthly, cancel anytime</Text>
              </View>
              <View style={styles.optionPricing}>
                <Text style={styles.optionPrice}>{subProduct?.price ?? SUBSCRIPTION_PLANS[1].price}</Text>
                <Text style={styles.optionPeriod}>{subProduct ? subProduct.period : SUBSCRIPTION_PLANS[1].period}</Text>
              </View>
            </Pressable>

            {/* 5 Conversion Credits card */}
            <Pressable
              onPress={() => selectOption("credits")}
              style={[styles.optionCard, selected === "credits" && styles.optionCardSelected]}
              testID="plan-credits"
            >
              <View style={styles.radioWrap}>
                <View style={[styles.radioOuter, selected === "credits" && styles.radioOuterSelected]}>
                  {selected === "credits" ? <Check color={theme.onAccent} size={13} strokeWidth={3} /> : null}
                </View>
              </View>
              <View style={styles.optionInfo}>
                <View style={styles.optionTitleRow}>
                  <Coins color={theme.accent} size={16} strokeWidth={2.2} />
                  <Text style={styles.optionTitle}>5 Conversion Credits</Text>
                </View>
                <Text style={styles.optionCaption}>{CREDITS_PACK.caption} · one-time purchase</Text>
              </View>
              <View style={styles.optionPricing}>
                <Text style={styles.optionPrice}>{creditsProduct?.price ?? CREDITS_PACK.price}</Text>
                <Text style={styles.optionPeriod}>one-time</Text>
              </View>
            </Pressable>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubscribe}
              disabled={purchasing || restoring}
              style={[styles.subscribeButton, (purchasing || restoring) && styles.subscribeButtonBusy]}
              testID="subscribe-button"
            >
              {purchasing ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={styles.subscribeLabel}>
                  {selected === "credits" ? "Buy Credits" : "Continue"}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={handleRestore} disabled={restoring || purchasing} style={styles.restoreButton}>
              {restoring ? (
                <ActivityIndicator color={theme.textSecondary} size="small" />
              ) : (
                <Text style={styles.restoreLabel}>Restore Purchases</Text>
              )}
            </Pressable>

            {mockMode ? (
              <View style={styles.mockBanner}>
                <Text style={styles.mockText}>
                  Preview mode — no real charge. StoreKit activates in a signed build.
                </Text>
              </View>
            ) : null}

            <Text style={styles.legal}>
              {selected === "credits"
                ? "This is a one-time purchase of 5 conversion credits. Credits never expire. Payment is charged to your Apple ID."
                : "Payment is charged to your Apple ID. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the period. Manage or cancel anytime in your App Store account settings."}
            </Text>

            <View style={styles.legalLinks}>
              <Pressable onPress={() => openUrl(EULA_URL)} hitSlop={8}>
                <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
              </Pressable>
              <Text style={styles.legalDot}>·</Text>
              <Pressable onPress={() => openUrl(PRIVACY_URL)} hitSlop={8}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </Pressable>
            </View>
          </>
        )}
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
      paddingHorizontal: 22,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    hero: {
      alignItems: "center",
      marginTop: 8,
      marginBottom: 24,
    },
    heroIcon: {
      width: 74,
      height: 74,
      borderRadius: 22,
      backgroundColor: theme.accentSoft,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 25,
      fontWeight: "800" as const,
      letterSpacing: -0.5,
      textAlign: "center" as const,
    },
    heroTitleAccent: {
      color: theme.accent,
    },
    heroSubtitle: {
      color: theme.textSecondary,
      fontSize: 14.5,
      lineHeight: 21,
      textAlign: "center" as const,
      marginTop: 10,
      paddingHorizontal: 6,
    },
    perks: {
      gap: 12,
      marginBottom: 26,
    },
    perkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    perkIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    perkLabel: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 19,
    },
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      backgroundColor: theme.card,
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginBottom: 12,
    },
    optionCardSelected: {
      borderColor: theme.accent,
      backgroundColor: theme.accentSoft,
    },
    radioWrap: {
      justifyContent: "center",
    },
    radioOuter: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    radioOuterSelected: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    optionInfo: {
      flex: 1,
    },
    optionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    optionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700" as const,
    },
    bestValueBadge: {
      backgroundColor: theme.accent,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    bestValueBadgeText: {
      color: theme.onAccent,
      fontSize: 9,
      fontWeight: "800" as const,
      letterSpacing: 0.5,
    },
    optionCaption: {
      color: theme.textMuted,
      fontSize: 12.5,
      marginTop: 3,
      lineHeight: 17,
    },
    optionPricing: {
      flexDirection: "row",
      alignItems: "baseline",
    },
    optionPrice: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "800" as const,
    },
    optionPeriod: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "600" as const,
      marginLeft: 4,
    },
    errorBanner: {
      backgroundColor: theme.redSoft,
      borderWidth: 1,
      borderColor: theme.redBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginTop: 4,
      marginBottom: 8,
    },
    errorText: {
      color: theme.red,
      fontSize: 13,
      lineHeight: 18,
    },
    subscribeButton: {
      backgroundColor: theme.accent,
      borderRadius: 15,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
    },
    subscribeButtonBusy: {
      opacity: 0.7,
    },
    subscribeLabel: {
      color: theme.onAccent,
      fontSize: 16.5,
      fontWeight: "800" as const,
    },
    restoreButton: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    restoreLabel: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: "600" as const,
    },
    legal: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center" as const,
      marginTop: 12,
      paddingHorizontal: 4,
    },
    legalLinks: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 10,
    },
    legalLink: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: "600" as const,
      textDecorationLine: "underline" as const,
    },
    legalDot: {
      color: theme.textMuted,
      fontSize: 12,
    },
    mockBanner: {
      backgroundColor: theme.accentSoft,
      borderWidth: 1,
      borderColor: theme.accentBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginTop: 12,
    },
    mockText: {
      color: theme.accent,
      fontSize: 11,
      textAlign: "center" as const,
      fontWeight: "600" as const,
    },
    thankYouCard: {
      alignItems: "center",
      marginTop: 60,
      paddingHorizontal: 10,
    },
    thankYouIcon: {
      width: 80,
      height: 80,
      borderRadius: 26,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 22,
    },
    thankYouTitle: {
      color: theme.text,
      fontSize: 28,
      fontWeight: "800" as const,
      letterSpacing: -0.5,
    },
    thankYouMessage: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center" as const,
      marginTop: 12,
    },
    thankYouButton: {
      backgroundColor: theme.accent,
      borderRadius: 15,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
      marginTop: 28,
    },
    thankYouButtonLabel: {
      color: theme.onAccent,
      fontSize: 16,
      fontWeight: "800" as const,
    },
  });
