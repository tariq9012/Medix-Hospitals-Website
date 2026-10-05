import { z } from "zod";

/** A Postgres `uuid` primary/foreign key. */
export const idSchema = z.string().uuid();

/** Standard offset-based pagination input for list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Wraps a paginated result set with the metadata clients need to page through it. */
export function paginatedResultSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
}
