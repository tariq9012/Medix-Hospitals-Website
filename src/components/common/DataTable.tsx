import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hidden on the mobile card view */
  hideOnCard?: boolean;
}

/**
 * Responsive data table: a real table from `md` up, stacked cards below,
 * so dashboard tables stay usable on phones.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyTitle = "Nothing to show",
  emptyDescription,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
  caption?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-soft md:block">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <TableRow className="bg-surface/60 hover:bg-surface/60">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("whitespace-nowrap", c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="surface-card p-4">
            <dl className="space-y-2.5">
              {columns
                .filter((c) => !c.hideOnCard)
                .map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {c.header}
                    </dt>
                    <dd className="min-w-0 text-right text-sm">{c.render(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
