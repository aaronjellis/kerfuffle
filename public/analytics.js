// PostHog, cookieless. Replace POSTHOG_KEY with the project API key from
// PostHog → Project settings. The key is public by design.
(function () {
  const POSTHOG_KEY = 'phc_smoYoT7D9aM8QEnyCAUhv7EbnD3TYGwRSrCSHYiZmAmg';
  const API_HOST = 'https://us.i.posthog.com';
  if (!POSTHOG_KEY || POSTHOG_KEY === 'phc_PLACEHOLDER') return;

  const script = document.createElement('script');
  script.src = 'https://us-assets.i.posthog.com/static/array.js';
  script.async = true;
  script.onload = function () {
    window.posthog.init(POSTHOG_KEY, {
      api_host: API_HOST,
      persistence: 'memory',
      autocapture: true,
      capture_pageview: true,
    });
  };
  document.head.appendChild(script);
})();
