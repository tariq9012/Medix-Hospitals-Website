import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { formatStatusLabel } from "@/lib/appointments/status";
import {
  affiliateDoctorFn,
  listAffiliatableDoctorsFn,
  listHospitalDoctorsFn,
  removeDoctorAffiliationFn,
} from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const searchSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/hospital/doctors")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listHospitalDoctorsFn({ data: { search: deps.q, page: deps.page ?? 1, pageSize: 20 } }),
  head: () => ({
    meta: [
      { title: "Doctors — Medix" },
      { name: "description", content: "Doctors affiliated with your hospital." },
    ],
  }),
  component: HospitalDoctors,
});

function formatFee(fee: string | null): string {
  if (!fee) return "—";
  const n = Number(fee);
  return Number.isFinite(n) ? `PKR ${n.toLocaleString()}` : "—";
}

function HospitalDoctors() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const result = Route.useLoaderData();
  const [query, setQuery] = useState(search.q ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);

  // DataTable keys rows by `id`; the affiliation row's own id is the stable choice.
  const rows = result.items.map((d) => ({ ...d, id: d.affiliationId }));
  type Row = (typeof rows)[number];

  async function handleRemove(doctorId: string, name: string) {
    if (!confirm(`Remove ${name} from your hospital? Their appointments and records are kept.`))
      return;
    const res = await removeDoctorAffiliationFn({ data: { doctorId } });
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("Affiliation removed.");
    await router.invalidate();
  }

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Doctor",
      render: (d) => (
        <span className="font-medium">
          Dr. {d.firstName} {d.lastName}
        </span>
      ),
    },
    { key: "department", header: "Department", render: (d) => d.department ?? "—" },
    {
      key: "verification",
      header: "Verification",
      render: (d) => <StatusBadge status={formatStatusLabel(d.verificationStatus)} />,
    },
    {
      key: "available",
      header: "Accepting",
      render: (d) => (d.isAvailable ? "Yes" : "No"),
      hideOnCard: true,
    },
    { key: "fee", header: "Fee", render: (d) => formatFee(d.consultationFee), hideOnCard: true },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() => handleRemove(d.doctorId, `Dr. ${d.firstName} ${d.lastName}`)}
        >
          Remove
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: "Hospital admin" }}>
      <PageHeader
        title="Doctors"
        description="Doctors practising at your hospital."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" aria-hidden="true" /> Affiliate doctor
              </Button>
            </DialogTrigger>
            <AffiliateDialog
              onClose={() => setDialogOpen(false)}
              onDone={() => router.invalidate()}
            />
          </Dialog>
        }
      />

      <form
        className="relative mb-5 sm:w-64"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/hospital/doctors", search: { q: query || undefined, page: 1 } });
        }}
      >
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search doctors…"
          className="pl-9"
        />
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        emptyTitle="No affiliated doctors"
        emptyDescription="Affiliate a verified doctor to get started."
      />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) => navigate({ to: "/hospital/doctors", search: { ...search, page } })}
          />
        </div>
      )}
    </DashboardLayout>
  );
}

function AffiliateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [candidates, setCandidates] = useState<
    { id: string; firstName: string; lastName: string }[] | null
  >(null);
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listAffiliatableDoctorsFn({ data: {} })
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, []);

  async function submit() {
    if (!doctorId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await affiliateDoctorFn({
        data: { doctorId, department: department || undefined },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success("Doctor affiliated.");
      onDone();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Affiliate a doctor</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Only doctors already verified by Medix can be affiliated. Verification itself is handled
          by platform admins, not hospitals.
        </p>
        <div className="space-y-2">
          <Label>Doctor</Label>
          {candidates === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No verified doctors are available to affiliate right now.
            </p>
          ) : (
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a doctor" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Dr. {c.firstName} {c.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="dept">Department (optional)</Label>
          <Input
            id="dept"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Cardiology"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isSubmitting || !doctorId}>
          {isSubmitting ? "Affiliating…" : "Affiliate doctor"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
