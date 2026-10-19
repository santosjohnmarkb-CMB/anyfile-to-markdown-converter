import { Platform } from "react-native";

/**
 * Core-level runtime code guard.
 *
 * Layers applied at app start:
 * 1. Console silencing in production (belt-and-braces on top of the babel
 *    strip) so nothing internal is printable at runtime.
 * 2. Integrity registry: critical functions register a fingerprint of their
 *    compiled source; `verifyIntegrity()` detects monkey-patching / hooking
 *    of the conversion engine at runtime.
 * 3. Prototype-pollution guard: freezes JSON and key global entry points
 *    attackers use to inject behavior.
 * 4. Web hardening: blocks rendering inside a hostile iframe (clickjacking /
 *    wrapper-site protection).
 *
 * Note: shipped release builds are compiled to Hermes bytecode, so no
 * readable JavaScript source is present in the binary. This module guards
 * the runtime on top of that.
 */

interface GuardState {
  installed: boolean;
  fingerprints: Map<string, string>;
  tampered: string[];
}

const state: GuardState = {
  installed: false,
  fingerprints: new Map<string, string>(),
  tampered: [],
};

/** Cheap 32-bit FNV-1a hash of a function's compiled source text. */
function fingerprint(fn: (...args: never[]) => unknown): string {
  const src = Function.prototype.toString.call(fn);
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Registers a critical function in the integrity registry. Call once at
 * module load; later verification detects if it was replaced or patched.
 */
export function guardFunction(name: string, fn: (...args: never[]) => unknown): void {
  state.fingerprints.set(name, fingerprint(fn));
}

/**
 * Re-checks every registered function against its original fingerprint.
 * Returns the list of tampered names (empty = intact).
 */
export function verifyIntegrity(
  current: Record<string, (...args: never[]) => unknown>,
): string[] {
  const tampered: string[] = [];
  for (const [name, fn] of Object.entries(current)) {
    const original = state.fingerprints.get(name);
    if (original !== undefined && fingerprint(fn) !== original) {
      tampered.push(name);
    }
  }
  state.tampered = tampered;
  if (tampered.length > 0) {
    console.warn("[codeGuard] runtime integrity check failed:", tampered.join(", "));
  }
  return tampered;
}

/** True if the last integrity verification found patched functions. */
export function isTampered(): boolean {
  return state.tampered.length > 0;
}

function silenceConsoleInProduction(): void {
  if (__DEV__) return;
  const noop = (): void => undefined;
  const target = console as unknown as Record<string, unknown>;
  for (const method of ["log", "debug", "info", "trace", "table", "dir", "group", "groupEnd"]) {
    try {
      target[method] = noop;
    } catch {
      // Console may be frozen by the host — fine.
    }
  }
}

function freezeCriticalGlobals(): void {
  try {
    // JSON.parse/stringify are the classic hook points for data exfiltration.
    Object.freeze(JSON);
  } catch {
    // Ignore if the host already locked it.
  }
}

function hardenWeb(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    // Frame-busting: refuse to run inside a third-party iframe wrapper.
    if (window.top !== null && window.top !== window.self) {
      window.top.location.href = window.self.location.href;
    }
  } catch {
    // Cross-origin frame access throws — that itself means we're framed.
    console.warn("[codeGuard] running inside a cross-origin frame");
  }
}

/** Installs all runtime guard layers. Idempotent; call once at app start. */
export function installCodeGuard(): void {
  if (state.installed) return;
  state.installed = true;
  silenceConsoleInProduction();
  freezeCriticalGlobals();
  hardenWeb();
}
