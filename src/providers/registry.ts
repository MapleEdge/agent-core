/**
 * Provider registry.
 *
 * Central registry for all provider implementations. Each subsystem has a
 * default mock provider. Real adapters can be registered at startup to
 * replace mocks.
 */

import type { MemoryProvider } from "./MemoryProvider.js";
import type { SessionProvider } from "./SessionProvider.js";
import type { ContextProvider } from "./ContextProvider.js";
import type { ActionProvider } from "./ActionProvider.js";
import type { RuleSolverProvider } from "./RuleSolverProvider.js";
import type { TraceProvider } from "./TraceProvider.js";
import type { ClassifierProvider } from "./ClassifierProvider.js";
import type { PolicyMatcherProvider } from "./PolicyMatcherProvider.js";

/** Architectural integration status — declared by the provider, not inferred. */
export type ProviderStatus = "mock" | "direct" | "adapter" | "sidecar" | "reference";

export interface ProviderCapability {
  /** Registry slot name (e.g. "memory", "classifier"). */
  name: string;
  /** Provider implementation name (e.g. "mock-memory"). */
  provider: string;
  /** Architectural integration status — set explicitly on registration. */
  status: ProviderStatus;
}

/** All provider interfaces must declare name and status. */
export interface BaseProvider {
  readonly name: string;
  readonly status: ProviderStatus;
}

interface ProviderRegistry {
  memory: MemoryProvider | null;
  session: SessionProvider | null;
  context: ContextProvider | null;
  action: ActionProvider | null;
  ruleSolver: RuleSolverProvider | null;
  trace: TraceProvider | null;
  classifier: ClassifierProvider | null;
  policyMatcher: PolicyMatcherProvider | null;
}

function emptyRegistry(): ProviderRegistry {
  return {
    memory: null,
    session: null,
    context: null,
    action: null,
    ruleSolver: null,
    trace: null,
    classifier: null,
    policyMatcher: null,
  };
}

let registry: ProviderRegistry = emptyRegistry();

export function registerProvider<K extends keyof ProviderRegistry>(
  key: K,
  provider: NonNullable<ProviderRegistry[K]>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry[key] = provider as any;
}

export function getProvider<K extends keyof ProviderRegistry>(
  key: K,
): NonNullable<ProviderRegistry[K]> {
  const p = registry[key];
  if (!p) {
    throw new Error(`No provider registered for "${key}". Register a mock or real provider at startup.`);
  }
  return p as NonNullable<ProviderRegistry[K]>;
}

export function hasProvider(key: keyof ProviderRegistry): boolean {
  return registry[key] !== null;
}

/** Reset all provider slots to null. Use in tests to prevent leaked state. */
export function resetProviderRegistry(): void {
  registry = emptyRegistry();
}

export function getCapabilityMatrix(): ProviderCapability[] {
  const capabilities: ProviderCapability[] = [];
  for (const [key, provider] of Object.entries(registry)) {
    if (provider) {
      capabilities.push({
        name: key,
        provider: provider.name,
        status: (provider as BaseProvider).status,
      });
    } else {
      capabilities.push({
        name: key,
        provider: "none",
        status: "mock",
      });
    }
  }
  return capabilities;
}

export function listRegisteredProviders(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, provider] of Object.entries(registry)) {
    result[key] = provider ? provider.name : "none";
  }
  return result;
}
