CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "userId" TEXT,
    "packId" TEXT,
    "stickerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaJob_status_createdAt_idx" ON "MediaJob"("status", "createdAt");
CREATE INDEX "MediaJob_userId_idx" ON "MediaJob"("userId");
CREATE INDEX "MediaJob_packId_idx" ON "MediaJob"("packId");
CREATE INDEX "MediaJob_stickerId_idx" ON "MediaJob"("stickerId");