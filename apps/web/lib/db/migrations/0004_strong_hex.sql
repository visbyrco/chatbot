CREATE TABLE "ToolConfig" (
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encryptedApiKey" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iv" varchar(32) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"toolId" varchar(64) NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ToolConfig" ADD CONSTRAINT "ToolConfig_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ToolConfig_userId_toolId_idx" ON "ToolConfig" USING btree ("userId","toolId");