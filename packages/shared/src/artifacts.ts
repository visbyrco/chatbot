import { z } from "zod";

export const ArtifactKindSchema = z.enum([
  "text",
  "code",
  "image",
  "sheet",
  "document",
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactSchema = z.object({
  content: z.string().optional(),
  id: z.string(),
  kind: ArtifactKindSchema,
  title: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
