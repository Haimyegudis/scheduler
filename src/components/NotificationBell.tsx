'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

// Small bell button that requests notification permission and registers a
// push subscription. Visibility is driven by whether an active push
// subscription already exists (not just by Notification.permission), so a
// user who granted permission but never actually subscribed (or who
// unsubscribed elsewhere) still sees the bell. Hidden in browsers that don't
// support push, once a live subscription exists, or once permission has been
// explicitly denied.
export default function NotificationBell() {
  const { t } = useT();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshSubscriptionState = useCallback(async () => {
    if (!pushSupported()) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setHasSubscription(!!subscription);
    } catch {
      setHasSubscription(false);
    }
  }, []);

  useEffect(() => {
    if (!pushSupported()) return;
    setSupported(true);
    setPermission(Notification.permission);
    void refreshSubscriptionState();
  }, [refreshSubscriptionState]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;

      const keyRes = await fetch('/api/push/public-key');
      if (!keyRes.ok) {
        setError(t('notificationsSetupFailed'));
        return;
      }
      const { key } = (await keyRes.json()) as { key: string };

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const raw = subscription.toJSON();

      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys }),
      });
      if (!subRes.ok) setError(t('notificationsSetupFailed'));
    } catch {
      setError(t('notificationsSetupFailed'));
    } finally {
      setBusy(false);
      await refreshSubscriptionState();
    }
  }, [t, refreshSubscriptionState]);

  // hasSubscription === null means the check hasn't resolved yet; stay
  // hidden until we know for sure to avoid a flash of the bell.
  if (!supported || permission === 'denied' || hasSubscription !== false) return null;

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        title={t('enableNotificationsBtn')}
        aria-label={t('enableNotificationsBtn')}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        🔔
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
