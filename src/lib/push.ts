import webpush from 'web-push';
import { prisma } from '@/lib/db';

export interface PushPayload {
  title: string;
  body: string;
}

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export function getPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

// Sends `payload` to every stored push subscription. Never throws — any
// failure (missing VAPID config, a bad subscription, a network error) is
// logged and swallowed so callers (e.g. the publish route) always succeed.
// Subscriptions that the push service reports as gone (404/410) are removed.
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    const subscriptions = await prisma.pushSubscription.findMany();
    const body = JSON.stringify(payload);
    await Promise.all(
      subscriptions.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error('push send failed for subscription', sub.id, err);
          }
        }
      })
    );
  } catch (err) {
    console.error('sendPushToAll failed', err);
  }
}
