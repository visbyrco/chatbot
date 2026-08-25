DROP INDEX "ToolConfig_userId_toolId_idx";--> statement-breakpoint
ALTER TABLE "ToolConfig" ADD COLUMN "baseURL" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ToolConfig_userId_toolId_provider_idx" ON "ToolConfig" USING btree ("userId","toolId","provider");