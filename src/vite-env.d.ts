/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_XCS_EXPORT?: string;
}

interface Window {
  /** PostHog, when the labs analytics snippet has loaded it. */
  posthog?: { capture: (event: string, properties?: Record<string, unknown>) => void };
}
