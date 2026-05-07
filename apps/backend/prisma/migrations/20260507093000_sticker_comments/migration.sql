CREATE TABLE "StickerComment" (
    "id" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StickerComment_stickerId_createdAt_idx" ON "StickerComment"("stickerId", "createdAt");
CREATE INDEX "StickerComment_userId_idx" ON "StickerComment"("userId");

ALTER TABLE "StickerComment" ADD CONSTRAINT "StickerComment_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StickerComment" ADD CONSTRAINT "StickerComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
