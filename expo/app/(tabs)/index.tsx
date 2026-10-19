import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  ChevronRight,
  ClipboardPaste,
  FileDown,
  Link2,
  Lock,
  Sparkles,
  StickyNote,
  X,
  Zap,
  Coins,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FlavorPicker from "@/components/FlavorPicker";
import TypeBadge from "@/components/TypeBadge";
import type { Theme } from "@/constants/colors";
import { useHistory } from "@/providers/HistoryProvider";
import { FREE_CONVERSION_LIMIT, useSubscription } from "@/providers/SubscriptionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { convertFile } from "@/utils/convert";
import { convertPastedText } from "@/utils/converters/text";
import { convertUrl, looksLikeUrl } from "@/utils/converters/url";
import { sourceFromNativeUri, sourceFromWebFile } from "@/utils/file";
import type { ConversionResult, PickedSource } from "@/types/conversion";

const FORMATS = ["PDF", "DOCX", "XLSX", "CSV", "HTML", "JSON", "TXT", "MD", "IMG", "VIDEO", "AUDIO"];

export default function ConvertScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { records, setPending, flavor, setFlavor } = useHistory();
  const { canConvert, recordConversion, isPremium, remainingFree, purchasedCredits } = useSubscription();

  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>("");
  const [textInput, setTextInput] = useState<string>("");
  const [showTextArea, setShowTextArea] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const pulse = useRef(new Animated.Value(0)).current;
  const dropScale = useRef(new Animated.Value(1)).current;
  const busyRef = useRef<boolean>(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const finishConversion = useCallback(
    (result: ConversionResult) => {
      setPending(result);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.push("/review" as never);
    },
    [setPending, router],
  );

  const runConversion = useCallback(
    async (label: string, task: () => Promise<ConversionResult>) => {
      if (busyRef.current) return;
      if (!canConvert) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        router.push("/paywall" as never);
        return;
      }
      busyRef.current = true;
      setErrorMessage(null);
      setBusyLabel(label);
      try {
        const result = await task();
        recordConversion();
        finishConversion(result);
      } catch (error) {
        console.log("[convert] failed", error);
        const message = error instanceof Error ? error.message : "Conversion failed. Try again.";
        setErrorMessage(message);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } finally {
        busyRef.current = false;
        setBusyLabel(null);
      }
    },
    [finishConversion, canConvert, recordConversion, router],
  );

  const handleSource = useCallback(
    (source: PickedSource) => {
      runConversion(`Converting ${source.name}…`, () => convertFile(source, flavor));
    },
    [runConversion, flavor],
  );

  const handleSourceRef = useRef(handleSource);
  handleSourceRef.current = handleSource;

  // Web drag & drop support.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if ((e as DragEvent & { relatedTarget: EventTarget | null }).relatedTarget == null) {
        setIsDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleSourceRef.current(sourceFromWebFile(file));
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  const pickFile = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      const webFile = (asset as { file?: File }).file;
      const source =
        Platform.OS === "web" && webFile
          ? sourceFromWebFile(webFile)
          : sourceFromNativeUri({
              name: asset.name ?? "file",
              uri: asset.uri,
              mimeType: asset.mimeType ?? null,
              size: asset.size ?? null,
            });
      handleSource(source);
    } catch (error) {
      console.log("[pickFile] failed", error);
      setErrorMessage("Couldn't open that file. Try another one.");
    }
  }, [handleSource]);

  const convertUrlInput = useCallback(() => {
    const value = urlInput.trim();
    if (value.length === 0) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    runConversion("Fetching & converting page…", async () => {
      const result = await convertUrl(value, flavor);
      setUrlInput("");
      return result;
    });
  }, [runConversion, urlInput, flavor]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || text.trim().length === 0) {
        setErrorMessage("Clipboard is empty.");
        return;
      }
      if (looksLikeUrl(text)) {
        setUrlInput(text.trim());
      } else {
        setShowTextArea(true);
        setTextInput(text);
      }
    } catch (error) {
      console.log("[paste] failed", error);
      setErrorMessage("Couldn't read the clipboard.");
    }
  }, []);

  const convertText = useCallback(() => {
    const value = textInput.trim();
    if (value.length === 0) return;
    runConversion("Converting text…", async () => {
      const result = convertPastedText(value, flavor);
      setTextInput("");
      setShowTextArea(false);
      return result;
    });
  }, [runConversion, textInput, flavor]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const recent = records.slice(0, 3);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                <FileDown color={theme.accent} size={22} strokeWidth={2.4} />
              </View>
              <Text style={styles.appName}>
                anything<Text style={styles.appNameAccent}>.md</Text>
              </Text>
            </View>
            <View style={styles.localBadge}>
              <Lock color={theme.green} size={11} strokeWidth={2.6} />
              <Text style={styles.localBadgeText}>100% local</Text>
            </View>
          </View>
          <Text style={styles.tagline}>
            Turn any file, page or note into clean Markdown — ready for Obsidian, Pandoc,
            static sites, or any editor you write in.
          </Text>

          <FlavorPicker value={flavor} onChange={setFlavor} />

          {isPremium ? (
            <View style={styles.creditsPill}>
              <Zap color={theme.accent} size={13} strokeWidth={2.6} fill={theme.accent} />
              <Text style={styles.creditsPillText}>Pro · unlimited conversions</Text>
            </View>
          ) : purchasedCredits > 0 ? (
            <Pressable
              onPress={() => router.push("/paywall" as never)}
              style={styles.creditsPill}
              testID="credits-pill"
            >
              <Coins color={theme.accent} size={13} strokeWidth={2.4} />
              <Text style={styles.creditsPillText}>
                {purchasedCredits} credit{purchasedCredits === 1 ? "" : "s"} remaining
              </Text>
              <Text style={styles.creditsPillCta}>
                {"Get more"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push("/paywall" as never)}
              style={styles.creditsPill}
              testID="credits-pill"
            >
              <Sparkles color={theme.accent} size={13} strokeWidth={2.4} />
              <Text style={styles.creditsPillText}>
                {remainingFree > 0
                  ? `${remainingFree} of ${FREE_CONVERSION_LIMIT} free conversion${remainingFree === 1 ? "" : "s"} left`
                  : "No free conversions left"}
              </Text>
              <Text style={styles.creditsPillCta}>
                {"Go Pro"}
              </Text>
            </Pressable>
          )}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable onPress={() => setErrorMessage(null)} hitSlop={10}>
                <X color={theme.red} size={16} />
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={pickFile}
            onPressIn={() =>
              Animated.spring(dropScale, { toValue: 0.97, useNativeDriver: true }).start()
            }
            onPressOut={() =>
              Animated.spring(dropScale, { toValue: 1, friction: 4, useNativeDriver: true }).start()
            }
            disabled={busyLabel !== null}
            testID="drop-zone"
          >
            <Animated.View
              style={[
                styles.dropZone,
                { transform: [{ scale: dropScale }] },
                isDragging && styles.dropZoneActive,
              ]}
            >
              <Animated.View
                style={[
                  styles.dropIconRing,
                  { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                ]}
              >
                <FileDown color={theme.accent} size={30} strokeWidth={2} />
              </Animated.View>
              <Text style={styles.dropTitle}>
                {isDragging ? "Drop it!" : Platform.OS === "web" ? "Drop a file or tap to browse" : "Tap to pick any file"}
              </Text>
              <Text style={styles.dropSubtitle}>One tap converts it to clean Markdown</Text>
              <View style={styles.formatRow}>
                {FORMATS.map((format) => (
                  <View key={format} style={styles.formatChip}>
                    <Text style={styles.formatChipText}>{format}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or paste a link</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.urlRow}>
            <View style={styles.urlInputWrap}>
              <Link2 color={theme.textMuted} size={16} />
              <TextInput
                style={styles.urlInput}
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="https://any-page.com/article"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={convertUrlInput}
                testID="url-input"
              />
              <Pressable onPress={pasteFromClipboard} hitSlop={8} style={styles.pasteButton}>
                <ClipboardPaste color={theme.accent} size={17} />
              </Pressable>
            </View>
            <Pressable
              onPress={convertUrlInput}
              disabled={urlInput.trim().length === 0 || busyLabel !== null}
              style={[styles.goButton, urlInput.trim().length === 0 && styles.goButtonDisabled]}
              testID="convert-url"
            >
              <ArrowRight
                color={urlInput.trim().length === 0 ? theme.textMuted : theme.onAccent}
                size={20}
                strokeWidth={2.6}
              />
            </Pressable>
          </View>

          {showTextArea ? (
            <View style={styles.textAreaCard}>
              <View style={styles.textAreaHeader}>
                <Text style={styles.textAreaTitle}>Raw text</Text>
                <Pressable
                  onPress={() => {
                    setShowTextArea(false);
                    setTextInput("");
                  }}
                  hitSlop={8}
                >
                  <X color={theme.textMuted} size={16} />
                </Pressable>
              </View>
              <TextInput
                style={styles.textArea}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Paste anything — notes, HTML, JSON…"
                placeholderTextColor={theme.textMuted}
                multiline
                textAlignVertical="top"
                testID="text-input"
              />
              <Pressable
                onPress={convertText}
                disabled={textInput.trim().length === 0}
                style={[
                  styles.convertTextButton,
                  textInput.trim().length === 0 && styles.goButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.convertTextButtonLabel,
                    textInput.trim().length === 0 && styles.convertTextButtonLabelDisabled,
                  ]}
                >
                  Convert to Markdown
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setShowTextArea(true)} style={styles.textToggle}>
              <StickyNote color={theme.textSecondary} size={15} />
              <Text style={styles.textToggleLabel}>or paste raw text</Text>
            </Pressable>
          )}

          {recent.length > 0 ? (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent</Text>
                <Pressable onPress={() => router.push("/history" as never)} hitSlop={8}>
                  <Text style={styles.recentSeeAll}>See all</Text>
                </Pressable>
              </View>
              {recent.map((record) => (
                <Pressable
                  key={record.id}
                  style={({ pressed }) => [styles.recentCard, pressed && styles.recentCardPressed]}
                  onPress={() => router.push(`/result/${record.id}` as never)}
                >
                  <TypeBadge type={record.sourceType} size={36} />
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentCardTitle} numberOfLines={1}>
                      {record.title}
                    </Text>
                    <Text style={styles.recentCardMeta} numberOfLines={1}>
                      {record.wordCount.toLocaleString()} words · {timeAgo(record.createdAt)}
                    </Text>
                  </View>
                  <ChevronRight color={theme.textMuted} size={18} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {busyLabel !== null ? (
        <View style={styles.busyOverlay}>
          <View style={styles.busyCard}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={styles.busyText}>{busyLabel}</Text>
            <Text style={styles.busySubtext}>Processing on-device — nothing leaves your phone</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },
  appNameAccent: {
    color: theme.accent,
    fontFamily: "Menlo" as const,
    fontSize: 17,
    fontWeight: "400" as const,
  },
  localBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.greenBorder,
  },
  localBadgeText: {
    color: theme.green,
    fontSize: 11,
    fontWeight: "700" as const,
  },
  tagline: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 18,
  },
  creditsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start" as const,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    borderRadius: 20,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7,
    marginTop: 14,
    marginBottom: 2,
  },
  creditsPillText: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: "600" as const,
  },
  creditsPillCta: {
    color: theme.onAccent,
    backgroundColor: theme.accent,
    fontSize: 11,
    fontWeight: "800" as const,
    overflow: "hidden" as const,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.redSoft,
    borderWidth: 1,
    borderColor: theme.redBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  errorText: {
    color: theme.red,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  dropZone: {
    borderWidth: 1.5,
    borderColor: theme.borderStrong,
    borderStyle: "dashed" as const,
    borderRadius: 20,
    backgroundColor: theme.bgElevated,
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  dropZoneActive: {
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
  },
  dropIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  dropTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700" as const,
  },
  dropSubtitle: {
    color: theme.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  formatRow: {
    flexDirection: "row",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    gap: 6,
  },
  formatChip: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  formatChipText: {
    color: theme.textSecondary,
    fontSize: 10,
    fontFamily: "Menlo" as const,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  dividerText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  urlRow: {
    flexDirection: "row",
    gap: 10,
  },
  urlInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
  },
  urlInput: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    height: 50,
  },
  pasteButton: {
    padding: 4,
  },
  goButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  goButtonDisabled: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  textToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 16,
    paddingVertical: 10,
  },
  textToggleLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  textAreaCard: {
    marginTop: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    padding: 14,
  },
  textAreaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  textAreaTitle: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  textArea: {
    minHeight: 110,
    maxHeight: 200,
    color: theme.text,
    fontSize: 14,
    lineHeight: 21,
    padding: 0,
  },
  convertTextButton: {
    marginTop: 12,
    backgroundColor: theme.accent,
    borderRadius: 12,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  convertTextButtonLabel: {
    color: theme.onAccent,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  convertTextButtonLabelDisabled: {
    color: theme.textMuted,
  },
  recentSection: {
    marginTop: 26,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  recentTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700" as const,
  },
  recentSeeAll: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  recentCardPressed: {
    backgroundColor: theme.cardPressed,
  },
  recentInfo: {
    flex: 1,
  },
  recentCardTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  recentCardMeta: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.scrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  busyCard: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch" as const,
  },
  busyText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700" as const,
    textAlign: "center" as const,
  },
  busySubtext: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center" as const,
  },
  });
