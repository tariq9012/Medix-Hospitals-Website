import { formatMoney } from "@/lib/billing/money";

export function Money({ amount, currency }: { amount: string; currency: string }) {
  return <>{formatMoney(amount, currency)}</>;
}
