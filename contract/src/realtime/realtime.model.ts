import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

export const GetStreamParamsSchema = z.object({
  streamId: z.string(),
});
export const GetStreamParamsJsonSchema = zodToJsonSchema(GetStreamParamsSchema);
export type GetStreamParamsType = z.infer<typeof GetStreamParamsSchema>;

export const PostStreamBodySchema = z.object({
  message: z.string(),
});
export const PostStreamBodyJsonSchema = zodToJsonSchema(PostStreamBodySchema);
export type PostStreamBodyType = z.infer<typeof PostStreamBodySchema>;
