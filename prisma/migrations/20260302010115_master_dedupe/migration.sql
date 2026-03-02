-- CreateTable
CREATE TABLE "MasterRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterRecord_normalizedKey_key" ON "MasterRecord"("normalizedKey");

-- CreateIndex
CREATE INDEX "MasterRecord_createdAt_idx" ON "MasterRecord"("createdAt");
