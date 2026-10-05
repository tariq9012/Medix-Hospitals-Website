import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-transparent",
  ISSUED: "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300",
  PARTIALLY_PAID:
    "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300",
  PAID: "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  VOID: "bg-muted text-muted-foreground border-transparent line-through",
  REFUNDED: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-950 dark:text-sky-300",
  PARTIALLY_REFUNDED:
    "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-950 dark:text-sky-300",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  VOID: "Void",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn(STATUS_STYLE[status] ?? "")} variant="outline">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
