import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CREDITS_PER_PURCHASE,
  checkActiveSubscription,
  initStoreKit,
  isMockMode,
  restoreCreditsPurchases,
} from "@/services/StoreKitService";

/** Number of free conversions allowed before the paywall appears. */
export const FREE_CONVERSION_LIMIT = 2;

const USAGE_KEY = "markdrop.usage.v1";
const PREMIUM_KEY = "markdrop.premium.v1";
const CREDITS_KEY = "markdrop.credits.v1";

/** A subscription plan offered on the paywall. */
export type SubscriptionPlan = {
  id: string;
  /** Apple App Store product identifier for StoreKit. */
  productId: string;
  title: string;
  price: string;
  period: string;
  caption: string;
  badge?: string;
};

/** Plans shown on the paywall. `productId` maps to App Store Connect products. */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "weekly",
    productId: "PW1",
    title: "Pro Weekly",
    price: "$1.99",
    period: "/week",
    caption: "Billed weekly, cancel anytime",
  },
  {
    id: "monthly",
    productId: "app.cmbtechdev.anythingmd.pro.monthly",
    title: "Monthly",
    price: "$4.99",
    period: "/month",
    caption: "Billed monthly, cancel anytime",
  },
];

/** Credits pack shown on the paywall. */
export const CREDITS_PACK = {
  productId: "app.cmbtechdev.anythingmd.credits.five",
  title: "5 Conversion Credits",
  price: "$0.99",
  credits: CREDITS_PER_PURCHASE,
  caption: "No expiry — use them anytime",
};

export const [SubscriptionProvider, useSubscription] = createContextHook(() => {
  const [freeUsed, setFreeUsed] = useState<number>(0);
  const [purchasedCredits, setPurchasedCredits] = useState<number>(0);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Initialize StoreKit and check the receipt for an active subscription.
        await initStoreKit();
        const [usageRaw, premiumRaw, creditsRaw, storeActive] = await Promise.all([
          AsyncStorage.getItem(USAGE_KEY),
          AsyncStorage.getItem(PREMIUM_KEY),
          AsyncStorage.getItem(CREDITS_KEY),
          checkActiveSubscription(),
        ]);
        if (!active) return;
        const parsed = usageRaw ? parseInt(usageRaw, 10) : 0;
        setFreeUsed(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
        const parsedCredits = creditsRaw ? parseInt(creditsRaw, 10) : 0;
        setPurchasedCredits(Number.isFinite(parsedCredits) && parsedCredits > 0 ? parsedCredits : 0);
        // Premium if either locally flagged or StoreKit reports an active subscription.
        const premium = premiumRaw === "true" || storeActive;
        setIsPremium(premium);
        if (premium && premiumRaw !== "true") {
          AsyncStorage.setItem(PREMIUM_KEY, "true").catch(() => {});
        }
      } catch (error) {
        console.log("[subscription] load failed", error);
      } finally {
        if (active) setIsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const remainingFree = useMemo(
    () => Math.max(0, FREE_CONVERSION_LIMIT - freeUsed),
    [freeUsed],
  );

  const remainingCredits = useMemo(() => purchasedCredits, [purchasedCredits]);

  const canConvert = useMemo(
    () => isPremium || remainingFree > 0 || remainingCredits > 0,
    [isPremium, remainingFree, remainingCredits],
  );

  /**
   * Records one used conversion. Decrements purchased credits first, then
   * increments the free usage counter. No-op for premium subscribers.
   */
  const recordConversion = useCallback(() => {
    if (isPremium) return;
    setPurchasedCredits((prevCredits) => {
      if (prevCredits > 0) {
        const nextCredits = prevCredits - 1;
        AsyncStorage.setItem(CREDITS_KEY, String(nextCredits)).catch((error) =>
          console.log("[subscription] save credits failed", error),
        );
        return nextCredits;
      }
      // No purchased credits — count against the free tier.
      setFreeUsed((prevUsed) => {
        const nextUsed = prevUsed + 1;
        AsyncStorage.setItem(USAGE_KEY, String(nextUsed)).catch((error) =>
          console.log("[subscription] save usage failed", error),
        );
        return nextUsed;
      });
      return prevCredits;
    });
  }, [isPremium]);

  /** Marks the user as subscribed after a successful purchase/restore. */
  const activatePremium = useCallback(() => {
    setIsPremium(true);
    AsyncStorage.setItem(PREMIUM_KEY, "true").catch((error) =>
      console.log("[subscription] save premium failed", error),
    );
  }, []);

  /** Adds credits to the balance after a successful credits purchase. */
  const addCredits = useCallback((amount: number) => {
    setPurchasedCredits((prev) => {
      const next = prev + amount;
      AsyncStorage.setItem(CREDITS_KEY, String(next)).catch((error) =>
        console.log("[subscription] save credits failed", error),
      );
      return next;
    });
  }, []);

  /** Restores unconsumed credits purchases from the StoreKit receipt. */
  const restoreCredits = useCallback(async () => {
    const packs = await restoreCreditsPurchases();
    if (packs > 0) {
      addCredits(packs * CREDITS_PER_PURCHASE);
    }
    return packs;
  }, [addCredits]);

  return useMemo(
    () => ({
      isLoaded,
      freeUsed,
      remainingFree,
      purchasedCredits: remainingCredits,
      isPremium,
      canConvert,
      recordConversion,
      activatePremium,
      addCredits,
      restoreCredits,
      isMockMode: isMockMode(),
    }),
    [
      isLoaded,
      freeUsed,
      remainingFree,
      remainingCredits,
      isPremium,
      canConvert,
      recordConversion,
      activatePremium,
      addCredits,
      restoreCredits,
    ],
  );
});
