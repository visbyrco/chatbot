CREATE TABLE "CatalogSync" (
	"id" integer PRIMARY KEY NOT NULL,
	"syncedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "CustomModel" ADD COLUMN "cachedInput" double precision;--> statement-breakpoint
ALTER TABLE "CustomModel" ADD COLUMN "cachedOutput" double precision;--> statement-breakpoint
ALTER TABLE "CustomModel" ADD COLUMN "input" double precision;--> statement-breakpoint
ALTER TABLE "CustomModel" ADD COLUMN "output" double precision;--> statement-breakpoint
ALTER TABLE "CustomModel" ADD COLUMN "pricingIsCustom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
