-- Normalize any legacy MOCK leads before removing enum variant.
UPDATE "Lead"
SET "source" = 'MANUAL'
WHERE "source"::text = 'MOCK';

-- Recreate LeadSource enum without MOCK.
CREATE TYPE "LeadSource_new" AS ENUM ('GOOGLE', 'CT_REGISTRY', 'UPLOAD', 'MANUAL', 'DIRECTORY');

ALTER TABLE "Lead"
ALTER COLUMN "source" DROP DEFAULT;

ALTER TABLE "Lead"
ALTER COLUMN "source" TYPE "LeadSource_new"
USING ("source"::text::"LeadSource_new");

ALTER TABLE "Lead"
ALTER COLUMN "source" SET DEFAULT 'MANUAL';

DROP TYPE "LeadSource";
ALTER TYPE "LeadSource_new" RENAME TO "LeadSource";

-- Remove legacy mock marker from usage logs.
ALTER TABLE "ApiUsage"
DROP COLUMN IF EXISTS "isMock";