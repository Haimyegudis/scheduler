'use client';

import { useEffect } from 'react';

// Registers the PWA service worker (public/sw.js). Silently no-ops in
// unsupported browsers or if registration fails.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: the app works without the service worker.
    });
  }, []);

  return null;
}
