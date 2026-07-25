-- Tester role + machine requests. Run against Neon before deploying the tester-role build.
ALTER TABLE "Technician" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'technician';
UPDATE "Technician" SET "role" = 'admin' WHERE "isAdmin" = true AND "role" <> 'admin';

CREATE TABLE IF NOT EXISTS "TesterRequest" (
  "id" SERIAL PRIMARY KEY,
  "testerId" INTEGER NOT NULL REFERENCES "Technician"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "shift" TEXT NOT NULL,
  "stationId" INTEGER REFERENCES "Station"("id"),
  "swVersion" TEXT,
  "hwNotes" TEXT,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "assignedStationId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
