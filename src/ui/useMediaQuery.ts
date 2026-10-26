import { useEffect, useState } from 'react';

const matches = (query: string) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** Whether a media query matches now; re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setMatch(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

/** The phone layout's breakpoint, matching `app.css`. */
export const PHONE_QUERY = '(max-width: 719px)';
