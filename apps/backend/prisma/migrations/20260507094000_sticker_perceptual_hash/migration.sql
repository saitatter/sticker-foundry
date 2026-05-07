ALTER TABLE "Sticker" ADD COLUMN "perceptualHash" TEXT;

CREATE INDEX "Sticker_packId_perceptualHash_idx" ON "Sticker"("packId", "perceptualHash");
