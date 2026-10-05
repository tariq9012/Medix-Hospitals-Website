import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";

import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { RecordPaymentDialog, RecordRefundDialog } from "@/components/billing/PaymentActions";
import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import {
  getAdminInvoiceFn,
  recordAdminPaymentFn,
  recordAdminRefundFn,
} from "@/lib/billing/functions";

export const Route = createFileRoute("/admin/payments/$id")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  loader: async ({ params }) => {
    const data = await getAdminInvoiceFn({ data: { invoiceId: params.id } });
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
    <DashboardLayout role="admin">
      <EmptyState
        title="Invoice not found"
        action={
          <Button asChild>
            <Link to="/admin/payments">Back to billing</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: AdminInvoiceDetail,
});

function AdminInvoiceDetail() {
  const { user } = Route.useRouteContext();
  const { invoice, payments, refunds } = Route.useLoaderData();
  const router = useRouter();

  // Per the Phase 12 policy (see src/lib/billing/service.server.ts): a
  // Platform Admin may only record payment/refund for invoices with NO
  // hospital. Every other invoice is read-only oversight here — Hospital
  // Admins manage their own billing from /hospital/billing.
  const canAct = invoice.hospitalId === null;

  return (
    <DashboardLayout role="admin" user={{ name: user.displayName, subtitle: "Platform admin" }}>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        description={`${invoice.patientFirstName ?? ""} ${invoice.patientLastName ?? ""} · Dr. ${invoice.doctorFirstName} ${invoice.doctorLastName}`}
        actions={
          canAct ? (
            <div className="flex gap-2">
              <RecordRefundDialog
                invoice={invoice}
                payments={payments}
                refunds={refunds}
                onRecord={async (input) => {
                  const result = await recordAdminRefundFn({ data: input });
                  if (result.ok) await router.invalidate();
                  return result;
                }}
              />
              <RecordPaymentDialog
                invoice={invoice}
                onRecord={async (input) => {
                  const result = await recordAdminPaymentFn({
                    data: { invoiceId: invoice.id, ...input },
                  });
                  if (result.ok) await router.invalidate();
                  return result;
                }}
              />
            </div>
          ) : undefined
        }
      />

      {!canAct && (
        <p className="mb-4 text-sm text-muted-foreground">
          This invoice belongs to a hospital — its Hospital Admin manages payments and refunds for
          it.
        </p>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Summary</CardTitle>
          <InvoiceStatusBadge status={invoice.status} />
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            Total: <Money amount={invoice.total} currency={invoice.currency} />
          </div>
          <div>
            Paid: <Money amount={invoice.amountPaid} currency={invoice.currency} />
          </div>
          <div>
            Refunded: <Money amount={invoice.amountRefunded} currency={invoice.currency} />
          </div>
          <div>Hospital: {invoice.hospitalName ?? "— (no hospital)"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="space-y-3">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>
                    {p.receiptNumber} · {p.paymentMethod} · {p.status}
                  </span>
                  <Money amount={p.amount} currency={p.currency} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
