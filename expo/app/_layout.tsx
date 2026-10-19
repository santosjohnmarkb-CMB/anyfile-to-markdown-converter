import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { HistoryProvider } from "@/providers/HistoryProvider";
import { SubscriptionProvider } from "@/providers/SubscriptionProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { installCodeGuard } from "@/utils/security/codeGuard";

installCodeGuard();

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { theme, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="result/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="review"
          options={{ headerShown: false, presentation: "modal", gestureEnabled: false }}
        />
        <Stack.Screen
          name="paywall"
          options={{ headerShown: false, presentation: "modal", gestureEnabled: true }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SubscriptionProvider>
          <HistoryProvider>
            <RootLayoutNav />
          </HistoryProvider>
        </SubscriptionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
