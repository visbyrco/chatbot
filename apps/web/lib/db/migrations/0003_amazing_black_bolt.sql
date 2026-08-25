DROP TABLE "Vote_v2" CASCADE;--> statement-breakpoint
ALTER TABLE "Message_v2" ADD COLUMN "metadata" json DEFAULT '{}'::json NOT NULL;