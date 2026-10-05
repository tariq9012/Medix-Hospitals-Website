import { useState } from "react";
import { toast } from "sonner";

import { Money } from "@/components/billing/Money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { compareMoney, formatMoney, subtractMoney } from "@/lib/billing/money";

export type PaymentMethod = "CASH" | "MANUAL" | "TEST";

interface InvoiceLike {
  id: string;
  currency: string;
  total: string;
  amountPaid: string;
  amountRefunded: string;
  status: string;
}

interface PaymentLike {
  id: string;
  amount: string;
  paymentMethod: string;
  status: string;
}

interface RefundLike {
  paymentId: string;
  amount: string;
}

/**
 * Record-payment dialog. There is no payment gateway (Phase 12): this is
 * staff attesting that a real-world CASH/bank settlement happened — never a
 * live card charge. The server independently re-validates the amount
 * against the invoice's actual outstanding balance; this dialog's own
 * validation is only for a good UX, not the source of truth.
 */
export function RecordPaymentDialog({
  invoice,
  onRecord,
}: {
  invoice: InvoiceLike;
  onRecord: (input: {
    amount: string;
    method: PaymentMethod;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [submitting, setSubmitting] = useState(false);
  // Generated fresh each time the dialog opens; a repeat submit (double
  // click, network retry) with the same key is treated as one payment by
  // the server, not two (spec §35).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const outstanding = subtractMoney(invoice.total, invoice.amountPaid);
  const disabled =
    invoice.status === "VOID" ||
    invoice.status === "REFUNDED" ||
    compareMoney(outstanding, "0.00") <= 0;

  async function submit() {
    setSubmitting(true);
    try {
      const result = await onRecord({ amount, method, idempotencyKey });
      if (result.ok) {
        toast.success("Payment recorded.");
        setOpen(false);
        setAmount("");
        setIdempotencyKey(crypto.randomUUID());
      } else {
        toast.error(result.message ?? "Could not record the payment.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setIdempotencyKey(crypto.randomUUID());
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>Record payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Outstanding balance: {formatMoney(outstanding, invoice.currency)}. This records that
            money was collected outside this system — no card is charged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Amount ({invoice.currency})</Label>
            <Input
              id="payment-amount"
              inputMode="decimal"
              placeholder={outstanding}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-method">Settlement method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="MANUAL">Manual / bank transfer</SelectItem>
                <SelectItem value="TEST">Test (simulated, dev only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={submitting || !amount.trim()}>
            {submitting ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Record-refund dialog. A refund is an internal ledger entry that money was
 * handed back OUTSIDE this system — there is no real reversal triggered.
 * The picked payment's own refundable balance is shown; the server
 * re-validates both that and the invoice-level total independently.
 */
export function RecordRefundDialog({
  invoice,
  payments,
  refunds,
  onRecord,
}: {
  invoice: InvoiceLike;
  payments: PaymentLike[];
  refunds: RefundLike[];
  onRecord: (input: {
    paymentId: string;
    amount: string;
    reason: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const refundablePayments = payments.filter(
    (p) => p.status === "PAID" || p.status === "PARTIALLY_REFUNDED",
  );
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(refundablePayments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const invoiceRefundable = subtractMoney(invoice.amountPaid, invoice.amountRefunded);
  const selectedPayment = refundablePayments.find((p) => p.id === paymentId);
  const paymentRefundable = selectedPayment
    ? refunds
        .filter((r) => r.paymentId === selectedPayment.id)
        .reduce((acc, r) => subtractMoney(acc, r.amount), selectedPayment.amount)
    : "0.00";
  const maxRefundable =
    compareMoney(invoiceRefundable, paymentRefundable) < 0 ? invoiceRefundable : paymentRefundable;
  const disabled = refundablePayments.length === 0 || compareMoney(maxRefundable, "0.00") <= 0;

  async function submit() {
    setSubmitting(true);
    try {
      const result = await onRecord({ paymentId, amount, reason });
      if (result.ok) {
        toast.success("Refund recorded.");
        setOpen(false);
        setAmount("");
        setReason("");
      } else {
        toast.error(result.message ?? "Could not record the refund.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Record refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a refund</DialogTitle>
          <DialogDescription>
            Refundable balance: <Money amount={maxRefundable} currency={invoice.currency} />. This
            records that money was handed back outside this system — no automatic bank reversal
            occurs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="refund-payment">Payment to refund</Label>
            <Select value={paymentId} onValueChange={setPaymentId}>
              <SelectTrigger id="refund-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {refundablePayments.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatMoney(p.amount, invoice.currency)} ({p.paymentMethod})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Amount ({invoice.currency})</Label>
            <Input
              id="refund-amount"
              inputMode="decimal"
              placeholder={maxRefundable}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason (required)</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={submitting || !amount.trim() || !reason.trim()}>
            {submitting ? "Recording…" : "Record refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
