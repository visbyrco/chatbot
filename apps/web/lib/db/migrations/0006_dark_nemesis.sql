ALTER TABLE "Chat" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "Chat" SET "updatedAt" = "createdAt";--> statement-breakpoint
