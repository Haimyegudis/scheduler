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

interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Shared delivery logic used by both sendPushToAll and sendPushToAdmins. Never
// throws — any failure (missing VAPID config, a bad subscription, a network
// error) is logged and swallowed so callers (e.g. the publish/register routes)
// always succeed regardless of push delivery outcome. Subscriptions that the
// push service reports as gone (404/410) are removed.
async function deliverToSubscriptions(subscriptions: StoredSubscription[], payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
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
    console.error('push delivery failed', err);
  }
}

// Sends `payload` to every stored push subscription (all technicians + admins).
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany().catch(() => []);
  await deliverToSubscriptions(subscriptions, payload);
}

// Sends `payload` only to subscriptions belonging to admin accounts. Used to
// alert admins of events they need to act on (e.g. a new user registering),
// without spamming every technician. `excludeTechnicianId` skips a specific
// account (e.g. the just-registered user themself, if they happen to be the
// bootstrap admin) so they don't get notified about their own registration.
export async function sendPushToAdmins(payload: PushPayload, excludeTechnicianId?: number): Promise<void> {
  const subscriptions = await prisma.pushSubscription
    .findMany({
      where: {
        technician: { isAdmin: true },
        ...(excludeTechnicianId !== undefined ? { technicianId: { not: excludeTechnicianId } } : {}),
      },
    })
    .catch(() => []);
  await deliverToSubscriptions(subscriptions, payload);
}
