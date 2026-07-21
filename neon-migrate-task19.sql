-- Task 19: Cell highlight colors
-- Incremental migration for an EXISTING deployed database running the task-18 schema.

ALTER TABLE "Assignment" ADD COLUMN "color" TEXT;
