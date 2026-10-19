/**
 * Production Apple StoreKit service via `expo-iap`.
 *
 * Subscriptions:
 *   1. `initStoreKit()` once at app launch → `initConnection()` + listeners.
 *   2. `fetchWeeklySubscription()` / `fetchMonthlySubscription()` → `fetchProducts({ type: "subs" })`.
 *   3. `purchaseWeeklySubscription()` / `purchaseMonthlySubscription()` → `requestPurchase({ type: "subs" })`.
 *   4. `purchaseUpdatedListener` resolves the deferred purchase promise; on
 *      success we `finishTransaction()`.
 *   5. `restoreSubscription()` → `getActiveSubscriptions()` to verify entitlement.
 *
 * Consumable credits:
 *   1. `fetchCreditsProduct()` → `fetchProducts({ type: "in-app" })`.
 *   2. `purchaseCredits()` → `requestPurchase({ type: "in-app" })`.
 *   3. `finishTransaction({ isConsumable: true })` so the pack can be re-purchased.
 *   4. `restoreCreditsPurchases()` → `getAvailablePurchases()` to find unconsumed packs.
 *
 * The native StoreKit module only loads in a signed development build / TestFlight /
 * App Store build. In the in-app JS preview the module is absent, so every call
 * falls through to a clearly-labeled mock that keeps the flow testable.
 */

import {
  finishTransaction,
  getActiveSubscriptions,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  fetchProducts,
  type Purchase,
  type ProductIOS,
  type ProductSubscriptionIOS,
} from "expo-iap";
import type { PurchaseError } from "expo-iap/build/utils/errorMapping";

/** App Store Connect product ID for the monthly Pro subscription. */
export const MONTHLY_PRODUCT_ID = "app.cmbtechdev.anythingmd.pro.monthly";

/** App Store Connect product ID for the 5 Conversion Credits consumable IAP. */
export const CREDITS_PRODUCT_ID = "app.cmbtechdev.anythingmd.credits.five";

/** App Store Connect product ID for the weekly Pro subscription. */
export const WEEKLY_PRODUCT_ID = "PW1";

/** All subscription product IDs — used for restore/entitlement checks. */
export const ALL_SUB_PRODUCT_IDS: string[] = [WEEKLY_PRODUCT_ID, MONTHLY_PRODUCT_ID];

/** Number of conversion credits granted by one credits purchase. */
export const CREDITS_PER_PURCHASE = 5;

type PurchaseResolver = {
  resolve: (purchase: Purchase) => void;
  reject: (error: Error) => void;
};

let initialized = false;
let updateUnsubscribe: { remove: () => void } | null = null;
let errorUnsubscribe: { remove: () => void } | null = null;
let pendingPurchase: PurchaseResolver | null = null;
let mockMode = false;

/** True when running without the native StoreKit module (in-app preview). */
export function isMockMode(): boolean {
  return mockMode;
}

/**
 * Initializes the StoreKit connection and purchase listeners.
 * Call once at app launch. Safe to call multiple times.
 */
export async function initStoreKit(): Promise<void> {
  if (initialized) return;
  try {
    if (!initConnection) {
      mockMode = true;
      console.log("[storekit] native module missing — mock mode");
      initialized = true;
      return;
    }
    await initConnection();
    initialized = true;
    console.log("[storekit] connection initialized");
  } catch (error) {
    console.log("[storekit] init failed, using mock mode", error);
    mockMode = true;
    initialized = true;
  }
}

function ensureListeners(): void {
  if (updateUnsubscribe && errorUnsubscribe) return;
  if (!purchaseUpdatedListener || !purchaseErrorListener) {
    mockMode = true;
    return;
  }

  updateUnsubscribe = purchaseUpdatedListener((purchase: Purchase) => {
    console.log("[storekit] purchase updated", purchase.id);
    const resolver = pendingPurchase;
    if (resolver) {
      pendingPurchase = null;
      resolver.resolve(purchase);
    }
  });

  errorUnsubscribe = purchaseErrorListener((error: PurchaseError) => {
    console.log("[storekit] purchase error", error);
    const resolver = pendingPurchase;
    if (resolver) {
      pendingPurchase = null;
      const message = error?.message ?? "Purchase failed.";
      // Apple returns "cancelled" when the user dismisses the sheet — surface it as a known state.
      resolver.reject(
        new Error(/cancel/i.test(message) ? "cancelled" : message),
      );
    }
  });
}

export interface SubscriptionProductInfo {
  productId: string;
  /** Localized price string, e.g. "$4.99". */
  price: string;
  /** Display title from App Store Connect. */
  title: string;
  /** Period label, e.g. "per month". */
  period: string;
}

/** Product info for the consumable credits IAP. */
export interface CreditsProductInfo {
  productId: string;
  /** Localized price string, e.g. "$0.99". */
  price: string;
  /** Display title from App Store Connect. */
  title: string;
  /** Number of credits in this pack. */
  credits: number;
}

/**
 * Fetches the monthly subscription product from StoreKit.
 * Returns null if the product isn't configured or unavailable.
 */
export async function fetchMonthlySubscription(): Promise<SubscriptionProductInfo | null> {
  await initStoreKit();

  if (mockMode || !fetchProducts) {
    return {
      productId: MONTHLY_PRODUCT_ID,
      price: "$4.99",
      title: "Monthly",
      period: "per month",
    };
  }

  try {
    const products = await fetchProducts({
      skus: [MONTHLY_PRODUCT_ID],
      type: "subs",
    });
    const sub = (products ?? []).find(
      (p): p is ProductSubscriptionIOS =>
        "platform" in p && p.platform === "ios" && p.id === MONTHLY_PRODUCT_ID,
    );

    if (!sub) {
      console.log("[storekit] monthly product not found in StoreKit");
      return null;
    }

    const periodUnit = sub.subscriptionPeriodUnitIOS ?? "month";
    return {
      productId: sub.id,
      price: sub.displayPrice || "$4.99",
      title: sub.displayName || sub.title || "Monthly",
      period: `per ${periodUnit}`,
    };
  } catch (error) {
    console.log("[storekit] fetchProducts failed", error);
    return null;
  }
}

/**
 * Fetches the weekly subscription product from StoreKit.
 * Returns null if the product isn't configured or unavailable.
 */
export async function fetchWeeklySubscription(): Promise<SubscriptionProductInfo | null> {
  await initStoreKit();

  if (mockMode || !fetchProducts) {
    return {
      productId: WEEKLY_PRODUCT_ID,
      price: "$1.99",
      title: "Weekly",
      period: "per week",
    };
  }

  try {
    const products = await fetchProducts({
      skus: [WEEKLY_PRODUCT_ID],
      type: "subs",
    });
    const sub = (products ?? []).find(
      (p): p is ProductSubscriptionIOS =>
        "platform" in p && p.platform === "ios" && p.id === WEEKLY_PRODUCT_ID,
    );

    if (!sub) {
      console.log("[storekit] weekly product not found in StoreKit");
      return null;
    }

    const periodUnit = sub.subscriptionPeriodUnitIOS ?? "week";
    return {
      productId: sub.id,
      price: sub.displayPrice || "$1.99",
      title: sub.displayName || sub.title || "Weekly",
      period: `per ${periodUnit}`,
    };
  } catch (error) {
    console.log("[storekit] fetchWeeklySubscription failed", error);
    return null;
  }
}

/**
 * Internal helper that initiates a subscription purchase for any product ID.
 * Resolves with the Purchase object on success.
 * Rejects with Error("cancelled") if the user dismisses the Apple sheet.
 */
async function purchaseSubscriptionProduct(productId: string): Promise<Purchase> {
  await initStoreKit();
  ensureListeners();

  if (mockMode || !requestPurchase) {
    console.log("[storekit] mock purchase", productId);
    await new Promise<void>((resolve) => setTimeout(resolve, 900));
    return { id: "mock-purchase" } as unknown as Purchase;
  }

  return new Promise<Purchase>((resolve, reject) => {
    pendingPurchase = { resolve, reject };
    requestPurchase({
      request: {
        apple: { sku: productId },
      },
      type: "subs",
    }).catch((error: unknown) => {
      pendingPurchase = null;
      reject(error instanceof Error ? error : new Error("Purchase request failed."));
    });
  }).then(async (purchase) => {
    // Finish the transaction so it leaves the payment queue.
    try {
      if (finishTransaction) {
        await finishTransaction({ purchase, isConsumable: false });
      }
    } catch (error) {
      // Non-fatal — entitlement is already granted by the purchase event.
      console.log("[storekit] finishTransaction failed (non-fatal)", error);
    }
    return purchase;
  });
}

/**
 * Initiates a subscription purchase for the weekly plan.
 * Resolves with the Purchase object on success.
 * Rejects with Error("cancelled") if the user dismisses the Apple sheet.
 */
export async function purchaseWeeklySubscription(): Promise<Purchase> {
  return purchaseSubscriptionProduct(WEEKLY_PRODUCT_ID);
}

/**
 * Initiates a subscription purchase for the monthly plan.
 * Resolves with the Purchase object on success.
 * Rejects with Error("cancelled") if the user dismisses the Apple sheet.
 */
export async function purchaseMonthlySubscription(): Promise<Purchase> {
  return purchaseSubscriptionProduct(MONTHLY_PRODUCT_ID);
}

/**
 * Restores prior purchases and returns true if any active subscription exists
 * (weekly or monthly). Required by App Store Review (Guideline 3.1.1).
 */
export async function restoreSubscription(): Promise<boolean> {
  await initStoreKit();

  if (mockMode || !getActiveSubscriptions) {
    console.log("[storekit] mock restore");
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    return false;
  }

  try {
    const active = await getActiveSubscriptions(ALL_SUB_PRODUCT_IDS);
    const hasActive = active.some(
      (sub) => ALL_SUB_PRODUCT_IDS.includes(sub.productId) && sub.isActive,
    );
    console.log("[storekit] restore result", hasActive, active.length);
    return hasActive;
  } catch (error) {
    console.log("[storekit] restore failed", error);
    return false;
  }
}

/**
 * Checks at app launch whether the user has an active subscription (weekly or monthly).
 * Used by SubscriptionProvider to set premium state from the receipt.
 */
export async function checkActiveSubscription(): Promise<boolean> {
  await initStoreKit();

  if (mockMode || !getActiveSubscriptions) {
    return false;
  }

  try {
    const active = await getActiveSubscriptions(ALL_SUB_PRODUCT_IDS);
    return active.some(
      (sub) => ALL_SUB_PRODUCT_IDS.includes(sub.productId) && sub.isActive,
    );
  } catch (error) {
    console.log("[storekit] check active failed", error);
    return false;
  }
}

/**
 * Fetches the 5 Conversion Credits consumable product from StoreKit.
 * Returns null if the product isn't configured or unavailable.
 */
export async function fetchCreditsProduct(): Promise<CreditsProductInfo | null> {
  await initStoreKit();

  if (mockMode || !fetchProducts) {
    return {
      productId: CREDITS_PRODUCT_ID,
      price: "$0.99",
      title: "5 Conversion Credits",
      credits: CREDITS_PER_PURCHASE,
    };
  }

  try {
    const products = await fetchProducts({
      skus: [CREDITS_PRODUCT_ID],
      type: "in-app",
    });
    const item = (products ?? []).find(
      (p): p is ProductIOS =>
        "platform" in p && p.platform === "ios" && p.id === CREDITS_PRODUCT_ID,
    );

    if (!item) {
      console.log("[storekit] credits product not found in StoreKit");
      return null;
    }

    return {
      productId: item.id,
      price: item.displayPrice || "$0.99",
      title: item.displayName || item.title || "5 Conversion Credits",
      credits: CREDITS_PER_PURCHASE,
    };
  } catch (error) {
    console.log("[storekit] fetchCreditsProduct failed", error);
    return null;
  }
}

/**
 * Initiates a consumable purchase for the 5 Conversion Credits pack.
 * Resolves with the Purchase object on success.
 * Rejects with Error("cancelled") if the user dismisses the Apple sheet.
 */
export async function purchaseCredits(): Promise<Purchase> {
  await initStoreKit();
  ensureListeners();

  if (mockMode || !requestPurchase) {
    console.log("[storekit] mock credits purchase");
    await new Promise<void>((resolve) => setTimeout(resolve, 900));
    return { id: "mock-credits" } as unknown as Purchase;
  }

  return new Promise<Purchase>((resolve, reject) => {
    pendingPurchase = { resolve, reject };
    requestPurchase({
      request: {
        apple: { sku: CREDITS_PRODUCT_ID },
      },
      type: "in-app",
    }).catch((error: unknown) => {
      pendingPurchase = null;
      reject(error instanceof Error ? error : new Error("Purchase request failed."));
    });
  }).then(async (purchase) => {
    // Finish the transaction as a consumable so it can be purchased again.
    try {
      if (finishTransaction) {
        await finishTransaction({ purchase, isConsumable: true });
      }
    } catch (error) {
      console.log("[storekit] finishTransaction (credits) failed (non-fatal)", error);
    }
    return purchase;
  });
}

/**
 * Checks for any unconsumed credits purchases (e.g. after a reinstall or crash).
 * Returns the number of credit packs that were purchased but not yet consumed.
 */
export async function restoreCreditsPurchases(): Promise<number> {
  await initStoreKit();

  if (mockMode || !getAvailablePurchases) {
    console.log("[storekit] mock restore credits");
    return 0;
  }

  try {
    const purchases = await getAvailablePurchases();
    const creditsPurchases = purchases.filter(
      (p) => p.productId === CREDITS_PRODUCT_ID,
    );
    console.log("[storekit] restore credits result", creditsPurchases.length);
    return creditsPurchases.length;
  } catch (error) {
    console.log("[storekit] restore credits failed", error);
    return 0;
  }
}
