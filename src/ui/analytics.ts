/**
 * PostHog custom events for outcomes a click doesn't prove. Each carries `project`, and the
 * page works without the loader, so every call is optional-chained.
 */
export const ANALYTICS_PROJECT = 'kerfuffle';

/**
 * A file download that succeeded, from the Export menu or a section's STL button. The labs
 * feedback widget hears about it too, so it can suggest a sibling experiment once.
 */
export function captureExport(format: string, template: string): void {
  window.posthog?.capture('export_downloaded', { format, template, project: ANALYTICS_PROJECT });
  window.labsFeedback?.milestone?.('export');
}

/**
 * Runs one export and records it only if it succeeded. A failure is logged, not thrown, so a
 * click handler never surfaces it as an uncaught error. Resolves to whether it succeeded.
 */
export async function runExport(format: string, template: string, run: () => unknown): Promise<boolean> {
  try {
    await run();
  } catch (err) {
    console.error(`Export ${format} failed`, err);
    return false;
  }
  captureExport(format, template);
  return true;
}
