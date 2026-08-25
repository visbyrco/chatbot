import { z } from "zod";

export const ModelCapabilitySchema = z.enum([
  "text",
  "vision",
  "tool-calling",
  "reasoning",
]);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelEntrySchema = z.object({
  capabilities: z.array(ModelCapabilitySchema).optional(),
  id: z.string(),
  name: z.string().optional(),
  provider: z.string(),
});
export type ModelEntry = z.infer<typeof ModelEntrySchema>;

export const ModelCatalogSchema = z.array(ModelEntrySchema);
export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;
