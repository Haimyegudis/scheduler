-- Task 22: PWA + Web Push notifications on publish
-- Incremental migration for an EXISTING deployed database running the task-19 schema.

CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "technicianId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
