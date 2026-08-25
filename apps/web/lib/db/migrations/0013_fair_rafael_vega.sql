CREATE INDEX "Chat_userId_idx" ON "Chat" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "CustomModel_providerId_idx" ON "CustomModel" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "CustomProvider_userId_idx" ON "CustomProvider" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Document_id_idx" ON "Document" USING btree ("id");--> statement-breakpoint
CREATE INDEX "Message_chatId_idx" ON "Message_v2" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message_v2" USING btree ("chatId","createdAt");--> statement-breakpoint
CREATE INDEX "Stream_chatId_idx" ON "Stream" USING btree ("chatId");