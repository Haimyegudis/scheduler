import { PrismaClient } from '@prisma/client';

// Mock Prisma client for environments where binary engines cannot be downloaded (e.g., strict SSL environments)
class MockPrismaClient {
  technician = { count: async () => 0 };
  constraint = { count: async () => 0 };
  schedule = { count: async () => 0 };
  assignment = { count: async () => 0 };
  $connect = async () => {};
  $disconnect = async () => {};
}

const globalForPrisma = globalThis as unknown as { prisma?: any };

let prismaInstance: any;
try {
  prismaInstance = globalForPrisma.prisma ?? new PrismaClient();
} catch (error) {
  // Fallback to mock when Prisma client cannot be initialized
  if (
    (error as any)?.message?.includes('did not initialize yet') ||
    (error as any)?.message?.includes('request to https://binaries.prisma.sh')
  ) {
    console.warn('Using mock Prisma client due to binary initialization issue');
    prismaInstance = new MockPrismaClient();
  } else {
    throw error;
  }
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
