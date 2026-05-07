CREATE TYPE "StickerReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_WORK');

ALTER TABLE "Sticker" ADD COLUMN "reviewStatus" "StickerReviewStatus" NOT NULL DEFAULT 'PENDING';
