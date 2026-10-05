import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";

import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { RecordPaymentDialog, RecordRefundDialog } from "@/components/billing/PaymentActions";
import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import {
  getHospitalInvoiceFn,
  recordHospitalPaymentFn,
  recordHospitalRefundFn,
} from "@/lib/billing/functions";

export const Route = createFileRoute("/hospital/billing/$id")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  loader: async ({ params }) => {
    // Ownership (this hospital only) is enforced inside getHospitalInvoiceFn
    // via the session-resolved hospital context — another hospital's
    // invoice id resolves to `null`, exactly like a nonexistent one.
    const data = await getHospitalInvoiceFn({ data: { invoiceId: params.id } });
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
    <DashboardLayout role="hospital">
      <EmptyState
        title="Invoice not found"
        description="This invoice doesn't exist, or doesn't belong to your hospital."
        action={
          <Button asChild>
            <Link to="/hospital/billing">Back to billing</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: HospitalInvoiceDetail,
});

function HospitalInvoiceDetail() {
  const { user } = Route.useRouteContext();
  const { invoice, payments, refunds } = Route.useLoaderData();
  const router = useRouter();

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: "Hospital admin" }}>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        description={`${invoice.patientFirstName ?? ""} ${invoice.patientLastName ?? ""} · Dr. ${invoice.doctorFirstName} ${invoice.doctorLastName}`}
        actions={
          <div className="flex gap-2">
            <RecordRefundDialog
              invoice={invoice}
              payments={payments}
              refunds={refunds}
              onRecord={async (input) => {
                const result = await recordHospitalRefundFn({ data: input });
                if (result.ok) await router.invalidate();
                return result;
              }}
            />
            <RecordPaymentDialog
              invoice={invoice}
              onRecord={async (input) => {
                const result = await recordHospitalPaymentFn({
                  data: { invoiceId: invoice.id, ...input },
                });
                if (result.ok) await router.invalidate();
                return result;
              }}
            />
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Summary</CardTitle>
          <InvoiceStatusBadge status={invoice.status} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <Money amount={invoice.total} currency={invoice.currency} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid</span>
            <Money amount={invoice.amountPaid} currency={invoice.currency} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Refunded</span>
            <Money amount={invoice.amountRefunded} currency={invoice.currency} />
          </div>
          <Separator />
          <div className="flex justify-between font-medium">
            <span>Issued</span>
            <span>{new Date(invoice.issuedAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
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

      {refunds.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Refunds</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {refunds.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>{r.reason}</span>
                  <Money amount={r.amount} currency={invoice.currency} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
