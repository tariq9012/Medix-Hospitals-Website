import { z } from "zod";

import { idSchema } from "./common";

/**
 * 6,000 characters is comfortably above any real chat message while still
 * ruling out someone pasting an entire document into the composer.
 */
const MAX_MESSAGE_LENGTH = 6000;

export const sendMessageSchema = z.object({
  conversationId: idSchema,
  body: z
    .string()
    .trim()
    .min(1, "Message can't be empty.")
    .max(MAX_MESSAGE_LENGTH, `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`),
});

export const startConversationSchema = z.object({
  doctorId: idSchema,
});

export const conversationIdSchema = z.object({ conversationId: idSchema });

export const listMessagesSchema = z.object({
  conversationId: idSchema,
  /** Cursor for loading older messages: only return messages created before this timestamp. */
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
