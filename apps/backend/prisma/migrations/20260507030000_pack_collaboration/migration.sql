CREATE TYPE "PackRole" AS ENUM ('VIEWER', 'EDITOR', 'OWNER');

CREATE TABLE "PackMember" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PackRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackInvite" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "email" TEXT,
    "role" "PackRole" NOT NULL DEFAULT 'VIEWER',
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackMember_packId_userId_key" ON "PackMember"("packId", "userId");
CREATE INDEX "PackMember_userId_idx" ON "PackMember"("userId");
CREATE INDEX "PackMember_packId_role_idx" ON "PackMember"("packId", "role");
CREATE UNIQUE INDEX "PackInvite_code_key" ON "PackInvite"("code");
CREATE INDEX "PackInvite_packId_idx" ON "PackInvite"("packId");
CREATE INDEX "PackInvite_email_idx" ON "PackInvite"("email");
CREATE INDEX "PackInvite_acceptedById_idx" ON "PackInvite"("acceptedById");

ALTER TABLE "PackMember" ADD CONSTRAINT "PackMember_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackMember" ADD CONSTRAINT "PackMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackInvite" ADD CONSTRAINT "PackInvite_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackInvite" ADD CONSTRAINT "PackInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackInvite" ADD CONSTRAINT "PackInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
