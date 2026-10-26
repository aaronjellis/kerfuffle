/**
 * PostHog custom events for outcomes a click doesn't prove. Each carries `project`, and the
 * page works without the loader, so every call is optional-chained.
 */
export const ANALYTICS_PROJECT = 'kerfuffle';

/** A file download that succeeded, from the Export menu or a section's STL button. */
export function captureExport(format: string, template: string): void {
  window.posthog?.capture('export_downloaded', { format, template, project: ANALYTICS_PROJECT });
}
