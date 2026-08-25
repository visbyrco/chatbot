ALTER TABLE "UserSettings" ADD COLUMN "aiAbout" text;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "aiIncludeDate" boolean;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "aiIncludeLocation" boolean;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "aiInstructions" text;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "aiPersonality" varchar(512);--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "aiUserName" varchar(128);