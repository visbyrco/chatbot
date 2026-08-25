ALTER TABLE "User" ADD COLUMN "clerkId" text;--> statement-breakpoint
UPDATE "User" SET "clerkId" = 'legacy-' || "id" WHERE "clerkId" IS NULL;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "clerkId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "User" DROP COLUMN IF EXISTS "isAnonymous";--> statement-breakpoint
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_clerkId_unique" UNIQUE("clerkId");
