import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { countWords, generateId } from "@/utils/encoding";
import { DEFAULT_FLAVOR } from "@/utils/flavor";
import type { MarkdownFlavor } from "@/utils/flavor";
import type { ConversionRecord, ConversionResult } from "@/types/conversion";

const STORAGE_KEY = "markdrop.history.v1";
const FLAVOR_KEY = "markdrop.flavor.v1";
const MAX_RECORDS = 100;
const MAX_MARKDOWN_CHARS = 400_000;

const VALID_FLAVORS: readonly MarkdownFlavor[] = ["obsidian", "plain", "pandoc", "multimarkdown"];

export const [HistoryProvider, useHistory] = createContextHook(() => {
  const [records, setRecords] = useState<ConversionRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [pending, setPending] = useState<ConversionResult | null>(null);
  const [flavor, setFlavorState] = useState<MarkdownFlavor>(DEFAULT_FLAVOR);
  const hydrated = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, savedFlavor] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(FLAVOR_KEY),
        ]);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as ConversionRecord[];
          if (Array.isArray(parsed)) setRecords(parsed);
        }
        if (!cancelled && savedFlavor && VALID_FLAVORS.includes(savedFlavor as MarkdownFlavor)) {
          setFlavorState(savedFlavor as MarkdownFlavor);
        }
      } catch (error) {
        console.log("[history] failed to load", error);
      } finally {
        if (!cancelled) {
          hydrated.current = true;
          setIsLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records)).catch((error) =>
      console.log("[history] failed to persist", error),
    );
  }, [records]);

  const addRecord = useCallback((result: ConversionResult): ConversionRecord => {
    const markdown =
      result.markdown.length > MAX_MARKDOWN_CHARS
        ? `${result.markdown.slice(0, MAX_MARKDOWN_CHARS)}\n\n> Truncated for storage.`
        : result.markdown;
    const record: ConversionRecord = {
      id: generateId(),
      title: result.title,
      sourceType: result.sourceType,
      sourceName: result.sourceName,
      markdown,
      createdAt: Date.now(),
      wordCount: countWords(markdown),
      charCount: markdown.length,
      flavor: result.flavor,
    };
    setRecords((prev) => [record, ...prev].slice(0, MAX_RECORDS));
    return record;
  }, []);

  const removeRecord = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setRecords([]);
  }, []);

  const clearPending = useCallback(() => {
    setPending(null);
  }, []);

  const setFlavor = useCallback((next: MarkdownFlavor) => {
    setFlavorState(next);
    AsyncStorage.setItem(FLAVOR_KEY, next).catch((error) =>
      console.log("[history] failed to persist flavor", error),
    );
  }, []);

  const getRecord = useCallback(
    (id: string): ConversionRecord | undefined => records.find((r) => r.id === id),
    [records],
  );

  return useMemo(
    () => ({
      records,
      isLoaded,
      addRecord,
      removeRecord,
      clearAll,
      getRecord,
      pending,
      setPending,
      clearPending,
      flavor,
      setFlavor,
    }),
    [records, isLoaded, addRecord, removeRecord, clearAll, getRecord, pending, clearPending, flavor, setFlavor],
  );
});
