ALTER TABLE "CustomModel" ADD COLUMN "capabilitiesIsCustom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomModel" ADD COLUMN "nameIsCustom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CustomProvider" ADD COLUMN "defaultConfig" json;