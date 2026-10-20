import { useEffect } from 'react';

let prewarmed = false;
export function useBackendPrewarm(enabled: boolean) {
  useEffect(() => {
    if (!import.meta.env.PROD || !enabled || prewarmed) return;
    const warm = () => {
      if (prewarmed) return;
      try {
        if (sessionStorage.getItem('runway:prewarm')) return;
        sessionStorage.setItem('runway:prewarm', '1');
      } catch {
        /* Storage may be disabled; the module flag still deduplicates this load. */
      }
      prewarmed = true;
      void fetch('/api/health', { signal: AbortSignal.timeout(12000) }).catch(
        () => {},
      );
    };
    // Set the flag only when the request starts: StrictMode can cancel the
    // first scheduled callback and immediately mount the effect again.
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 2000);
    return () => clearTimeout(id);
  }, [enabled]);
}
