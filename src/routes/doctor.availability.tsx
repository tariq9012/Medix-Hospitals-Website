import { createFileRoute } from "@tanstack/react-router";
import { Building2, Plus, ShieldAlert, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { DoctorAvailability } from "@/db/schema";
import {
  createAvailabilityRuleFn,
  deleteAvailabilityRuleFn,
  listMyAvailabilityFn,
  listMyHospitalsFn,
  toggleAvailabilityRuleFn,
} from "@/lib/doctor/functions";
import type { ConsultationType, DayOfWeek } from "@/lib/validation/enums";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/availability")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Availability — Medix" },
      { name: "description", content: "Set your weekly consultation hours." },
    ],
  }),
  component: DoctorAvailabilityPage,
});

const DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function DoctorAvailabilityPage() {
  const { user } = Route.useRouteContext();
  const [rules, setRules] = useState<DoctorAvailability[] | null>(null);
  const [hospitals, setHospitals] = useState<{ id: string; name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  function load() {
    listMyAvailabilityFn()
      .then(setRules)
      .catch(() => setRules([]));
  }

  useEffect(() => {
    load();
    listMyHospitalsFn()
      .then(setHospitals)
      .catch(() => setHospitals([]));
  }, []);

  async function handleToggle(ruleId: string, isActive: boolean) {
    const result = await toggleAvailabilityRuleFn({ data: { ruleId, isActive } });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    load();
  }

  async function handleDelete(ruleId: string) {
    if (!confirm("Delete this availability rule? Existing booked appointments are never affected."))
      return;
    const result = await deleteAvailabilityRuleFn({ data: { ruleId } });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Availability rule deleted.");
    load();
  }

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Availability"
        description="Manage the weekly hours patients can book you for."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" aria-hidden="true" /> Add availability
              </Button>
            </DialogTrigger>
            <AvailabilityFormDialog
              hospitals={hospitals}
              onClose={() => setDialogOpen(false)}
              onCreated={load}
            />
          </Dialog>
        }
      />

      <Card className="mb-6 border-primary/20 bg-primary-soft/40">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">
            Changes here take effect immediately for new bookings. Appointments patients have
            already booked are never cancelled or affected by editing, disabling, or deleting a
            rule.
          </p>
        </CardContent>
      </Card>

      {rules === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No availability set yet"
          description="Add your first weekly slot so patients can start booking you."
        />
      ) : (
        <div className="space-y-6">
          {DAYS.map((day) => {
            const dayRules = rules.filter((r) => r.dayOfWeek === day);
            if (dayRules.length === 0) return null;
            return (
              <div key={day}>
                <h3 className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
                  {day.charAt(0) + day.slice(1).toLowerCase()}
                </h3>
                <div className="grid gap-2">
                  {dayRules.map((rule) => (
                    <Card key={rule.id} className={rule.isActive ? undefined : "opacity-60"}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-medium">
                            {rule.startTime.slice(0, 5)} – {rule.endTime.slice(0, 5)}
                          </span>
                          <Badge variant="secondary" className="gap-1">
                            {rule.consultationType === "ONLINE" ? (
                              <Video className="size-3" aria-hidden="true" />
                            ) : (
                              <Building2 className="size-3" aria-hidden="true" />
                            )}
                            {rule.consultationType === "ONLINE" ? "Video" : "In-person"}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {rule.slotDurationMinutes}-min slots
                          </span>
                          {rule.breakStartTime && rule.breakEndTime && (
                            <span className="text-xs text-muted-foreground">
                              Break {rule.breakStartTime.slice(0, 5)}–
                              {rule.breakEndTime.slice(0, 5)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) => handleToggle(rule.id, checked)}
                            aria-label={rule.isActive ? "Disable rule" : "Enable rule"}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(rule.id)}
                            aria-label="Delete rule"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

function AvailabilityFormDialog({
  hospitals,
  onClose,
  onCreated,
}: {
  hospitals: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>("MONDAY");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [consultationType, setConsultationType] = useState<ConsultationType>("IN_PERSON");
  const [hospitalId, setHospitalId] = useState<string | undefined>(hospitals[0]?.id);
  const [breakStartTime, setBreakStartTime] = useState("");
  const [breakEndTime, setBreakEndTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await createAvailabilityRuleFn({
        data: {
          dayOfWeek,
          startTime,
          endTime,
          slotDurationMinutes,
          consultationType,
          hospitalId: consultationType === "IN_PERSON" ? hospitalId : undefined,
          breakStartTime: breakStartTime || undefined,
          breakEndTime: breakEndTime || undefined,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Availability added.");
      onCreated();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add availability</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Day of week</Label>
            <Select value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v as DayOfWeek)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={d} className="capitalize">
                    {d.charAt(0) + d.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Consultation type</Label>
            <Select
              value={consultationType}
              onValueChange={(v) => setConsultationType(v as ConsultationType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_PERSON">In-person</SelectItem>
                <SelectItem value="ONLINE">Video</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End time</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Slot duration (minutes)</Label>
            <Input
              type="number"
              min={5}
              max={240}
              value={slotDurationMinutes}
              onChange={(e) => setSlotDurationMinutes(Number(e.target.value))}
            />
          </div>
          {consultationType === "IN_PERSON" && hospitals.length > 0 && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={hospitalId} onValueChange={setHospitalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a location" />
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Break start (optional)</Label>
            <Input
              type="time"
              value={breakStartTime}
              onChange={(e) => setBreakStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Break end (optional)</Label>
            <Input
              type="time"
              value={breakEndTime}
              onChange={(e) => setBreakEndTime(e.target.value)}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isSubmitting}>
          {isSubmitting ? "Adding…" : "Add availability"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
