import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DoctorCard } from "@/components/cards/DoctorCard";
import { HospitalCard } from "@/components/cards/HospitalCard";
import { EmptyState, ErrorState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import {
  listMyFavoritesFn,
  setDoctorFavoriteFn,
  setHospitalFavoriteFn,
} from "@/lib/favorites/functions";

export const Route = createFileRoute("/patient/favorites")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  head: () => ({
    meta: [
      { title: "Favorites — Medix" },
      { name: "description", content: "Doctors and hospitals you've saved for quick access." },
    ],
  }),
  component: Favorites,
});

type Data = Awaited<ReturnType<typeof listMyFavoritesFn>>;

function Favorites() {
  const { user } = Route.useRouteContext();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    listMyFavoritesFn()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function removeUnavailable(kind: "doctor" | "hospital", id: string) {
    const r =
      kind === "doctor"
        ? await setDoctorFavoriteFn({ data: { doctorId: id, favorite: false } })
        : await setHospitalFavoriteFn({ data: { hospitalId: id, favorite: false } });
    if (r.ok) load();
    else toast.error(r.message);
  }

  const unavailable = (kind: "doctor" | "hospital", list: { id: string; name: string }[]) =>
    list.length > 0 && (
      <div className="mt-6 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Currently unavailable</h3>
        {list.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  Not listed right now. It will reappear here if it becomes available again.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void removeUnavailable(kind, u.id)}
              >
                Remove
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    );

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="Favorites"
        description="Doctors and hospitals you've saved for quick access."
      />
      {failed ? (
        <ErrorState onRetry={load} />
      ) : data === null ? null : (
        <Tabs defaultValue="doctors">
          <TabsList>
            <TabsTrigger value="doctors">
              Doctors ({data.doctors.available.length + data.doctors.unavailable.length})
            </TabsTrigger>
            <TabsTrigger value="hospitals">
              Hospitals ({data.hospitals.available.length + data.hospitals.unavailable.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="doctors" className="mt-4">
            {data.doctors.available.length + data.doctors.unavailable.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No favorite doctors yet"
                description="Tap the heart on a doctor's card or profile to save them here."
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {data.doctors.available.map((d) => (
                    <DoctorCard key={d.id} doctor={d} viewerRole="PATIENT" />
                  ))}
                </div>
                {unavailable("doctor", data.doctors.unavailable)}
              </>
            )}
          </TabsContent>
          <TabsContent value="hospitals" className="mt-4">
            {data.hospitals.available.length + data.hospitals.unavailable.length === 0 ? (
              <EmptyState
                icon={Heart}
                title="No favorite hospitals yet"
                description="Tap the heart on a hospital's card or profile to save it here."
              />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.hospitals.available.map((h) => (
                    <HospitalCard key={h.id} hospital={h} viewerRole="PATIENT" />
                  ))}
                </div>
                {unavailable("hospital", data.hospitals.unavailable)}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </DashboardLayout>
  );
}
