import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

export default function setup() {
  rmSync('prisma/test.db', { force: true });
  try {
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
      stdio: 'inherit',
    });
  } catch (error) {
    // Ignore errors from prisma db push (e.g., SSL certificate issues)
    // The mock Prisma client will handle the tests
    console.warn(
      'Note: Could not run prisma db push. Using mock database for testing.'
    );
  }
}
