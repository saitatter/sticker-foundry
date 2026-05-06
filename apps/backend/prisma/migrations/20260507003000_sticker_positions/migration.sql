ALTER TABLE "Sticker" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "packId" ORDER BY "createdAt" ASC, "id" ASC) - 1 AS next_position
  FROM "Sticker"
)
UPDATE "Sticker"
SET "position" = ranked.next_position
FROM ranked
WHERE "Sticker"."id" = ranked."id";

CREATE INDEX "Sticker_packId_position_idx" ON "Sticker"("packId", "position");
