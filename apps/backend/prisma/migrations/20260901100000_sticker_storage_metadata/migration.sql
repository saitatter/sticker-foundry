ALTER TABLE "Sticker" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Sticker" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Sticker" ADD COLUMN "width" INTEGER;
ALTER TABLE "Sticker" ADD COLUMN "height" INTEGER;

CREATE INDEX "Sticker_storageKey_idx" ON "Sticker"("storageKey");