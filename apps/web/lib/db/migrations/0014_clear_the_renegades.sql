ALTER TABLE "CustomProvider" ADD COLUMN "keyVersion" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomProvider" ADD COLUMN "salt" varchar(64);--> statement-breakpoint
ALTER TABLE "ToolConfig" ADD COLUMN "keyVersion" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ToolConfig" ADD COLUMN "salt" varchar(64);