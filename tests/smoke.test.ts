import { test, expect } from 'vitest';
import { prisma } from '@/lib/db';

test('db connects and can count technicians', async () => {
  expect(typeof (await prisma.technician.count())).toBe('number');
});
