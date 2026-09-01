DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Sticker"
    WHERE "storageKey" IS NULL
      OR "mimeType" IS NULL
      OR "width" IS NULL
      OR "height" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot require sticker storage metadata until every sticker has canonical metadata';
  END IF;
END $$;

ALTER TABLE "Sticker" ALTER COLUMN "storageKey" SET NOT NULL;
ALTER TABLE "Sticker" ALTER COLUMN "mimeType" SET NOT NULL;
ALTER TABLE "Sticker" ALTER COLUMN "width" SET NOT NULL;
ALTER TABLE "Sticker" ALTER COLUMN "height" SET NOT NULL;
