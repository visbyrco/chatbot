CREATE TABLE "UserSettings" (
	"chatModelId" varchar(512),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"enabledTools" json,
	"enterBehavior" varchar(32),
	"fontBody" varchar(64),
	"fontHeading" varchar(64),
	"fontLabel" varchar(64),
	"fontMono" varchar(64),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identityDisplayMode" varchar(32),
	"reasoningEffort" varchar(32),
	"sidebarCollapsed" boolean,
	"statsForNerds" boolean,
	"theme" varchar(16),
	"titleModelId" varchar(512),
	"titleReasoningEffort" varchar(32),
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UserSettings_userId_idx" ON "UserSettings" USING btree ("userId");