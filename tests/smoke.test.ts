import { test, expect } from 'vitest';
import { prisma } from '@/lib/db';

test('db connects and is empty', async () => {
  expect(await prisma.technician.count()).toBe(0);
});
