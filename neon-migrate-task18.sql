-- Task 18: Named stations, cell notes, experimenter slot
-- Incremental migration for an EXISTING deployed database running the OLD schema.
-- Assumes production data is empty (no schedules/assignments to preserve).

-- DropForeignKey (old Assignment references Technician as required)
ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_scheduleId_fkey";
ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_technicianId_fkey";

-- DropTable
DROP TABLE IF EXISTS "Assignment" CASCADE;

-- CreateTable
CREATE TABLE "Station" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "stationId" INTEGER NOT NULL,
    "technicianId" INTEGER,
    "experimenter" TEXT,
    "note" TEXT,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_scheduleId_date_shift_stationId_key" ON "Assignment"("scheduleId", "date", "shift", "stationId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
