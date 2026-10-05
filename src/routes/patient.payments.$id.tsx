import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { getPatientInvoiceFn } from "@/lib/billing/functions";
import { useRealtimeRevalidate } from "@/lib/realtime/client";

export const Route = createFileRoute("/patient/payments/$id")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: async ({ params }) => {
    // Ownership is enforced inside getPatientInvoiceFn (via the authenticated
    // session) — another patient's invoice id resolves to `null`, exactly
    // like a nonexistent one, so nothing is ever leaked either way.
    const data = await getPatientInvoiceFn({ data: { invoiceId: params.id } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `Invoice ${loaderData.invoice.invoiceNumber} — Medix`
          : "Invoice — Medix",
      },
    ],
  }),
  notFoundComponent: () => (
    <DashboardLayout role="patient">
      <EmptyState
        title="Invoice not found"
        description="This invoice doesn't exist, or doesn't belong to your account."
        action={
          <Button asChild>
            <Link to="/patient/payments">Back to billing</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: PatientInvoiceDetail,
});

function PatientInvoiceDetail() {
  const { user } = Route.useRouteContext();
  const { invoice, payments, refunds } = Route.useLoaderData();
  const router = useRouter();

  // Phase 11 realtime, reused (not a separate financial realtime system,
  // per spec §32): a PAYMENT_RECORDED/REFUND_RECORDED/INVOICE_ISSUED
  // notification for this user re-runs the loader, so the patient sees the
  // updated status/receipt without refreshing.
  useRealtimeRevalidate(["NOTIFICATION_CREATED"], () => router.invalidate());

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <div className="print:hidden">
        <PageHeader
          title={`Invoice ${invoice.invoiceNumber}`}
          description={`Dr. ${invoice.doctorFirstName} ${invoice.doctorLastName}${invoice.hospitalName ? ` · ${invoice.hospitalName}` : ""}`}
          actions={
            <Button variant="outline" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          }
        />
      </div>

      <div id="invoice-print" className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Invoice {invoice.invoiceNumber}</CardTitle>
            <InvoiceStatusBadge status={invoice.status} />
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Issued" value={new Date(invoice.issuedAt).toLocaleDateString()} />
            <Row
              label="Provider"
              value={`Dr. ${invoice.doctorFirstName} ${invoice.doctorLastName}`}
            />
            {invoice.hospitalName && <Row label="Hospital" value={invoice.hospitalName} />}
            <Separator />
            <Row
              label="Subtotal"
              value={<Money amount={invoice.total} currency={invoice.currency} />}
            />
            <Row
              label="Amount paid"
              value={<Money amount={invoice.amountPaid} currency={invoice.currency} />}
            />
            {Number(invoice.amountRefunded) > 0 && (
              <Row
                label="Refunded"
                value={<Money amount={invoice.amountRefunded} currency={invoice.currency} />}
              />
            )}
            <Separator />
            <Row
              label="Total"
              value={
                <span className="text-lg font-semibold">
                  <Money amount={invoice.total} currency={invoice.currency} />
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment has been recorded yet.</p>
            ) : (
              <ul className="space-y-4">
                {payments.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.receiptNumber ?? "Receipt"}</span>
                      <span className="font-semibold">
                        <Money amount={p.amount} currency={p.currency} />
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"} · Method:{" "}
                      {p.paymentMethod} · Status: {p.status}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Recorded internally by hospital/admin staff — no online card charge occurred.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {refunds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Refunds</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {refunds.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Refund</span>
                      <span className="font-semibold">
                        <Money amount={r.amount} currency={invoice.currency} />
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(r.completedAt).toLocaleString()} · {r.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
