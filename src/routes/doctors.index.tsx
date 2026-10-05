import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal, Stethoscope, X } from "lucide-react";
import { useState } from "react";

import { DoctorCard } from "@/components/cards/DoctorCard";
import { DirectoryError, DirectoryPending } from "@/components/directory/DirectoryStates";
import { EmptyState, PageHeader, Pagination } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { searchDoctorsFn } from "@/lib/directory/functions";
import { parseDoctorSearch, type DoctorUrlSearch } from "@/lib/directory/search-params";
import { MAX_SEARCH_LENGTH } from "@/lib/validation/directory";

export const Route = createFileRoute("/doctors/")({
  validateSearch: (search: Record<string, unknown>): DoctorUrlSearch => parseDoctorSearch(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchDoctorsFn({ data: deps }),
  pendingComponent: () => <DirectoryPending title="Find a doctor" />,
  errorComponent: DirectoryError,
  head: () => ({
    meta: [
      { title: "Find Doctors — Medix Doctor Directory" },
      {
        name: "description",
        content:
          "Search verified doctors by specialty, hospital, fee, rating and experience. Compare profiles and book appointments.",
      },
      { property: "og:title", content: "Find Doctors — Medix Doctor Directory" },
    ],
  }),
  component: DoctorsPage,
});

const ALL = "all";

function DoctorsPage() {
  const { results, options, viewerRole } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/doctors/" });

  const [query, setQuery] = useState(search.q ?? "");
  const [minFee, setMinFee] = useState(search.minFee?.toString() ?? "");
  const [maxFee, setMaxFee] = useState(search.maxFee?.toString() ?? "");

  function apply(patch: Partial<DoctorUrlSearch>) {
    void navigate({
      search: (prev: DoctorUrlSearch) => {
        const next = { ...prev, ...patch, page: patch.page } as DoctorUrlSearch;
        return Object.fromEntries(
          Object.entries(next).filter(([, v]) => v !== undefined && v !== ""),
        ) as DoctorUrlSearch;
      },
    });
  }

  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
  const sel = (v: string) => (v === ALL ? undefined : v);
  const hasFilters = Object.keys(search).some((k) => k !== "page" && k !== "sort");

  function reset() {
    setQuery("");
    setMinFee("");
    setMaxFee("");
    void navigate({ search: {} });
  }

  const filters = (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="f-specialty">Specialty</Label>
        <Select
          value={search.specialty ?? ALL}
          onValueChange={(v) => apply({ specialty: sel(v), page: undefined })}
        >
          <SelectTrigger id="f-specialty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All specialties</SelectItem>
            {options.specialties.map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-hospital">Hospital</Label>
        <Select
          value={search.hospital ?? ALL}
          onValueChange={(v) => apply({ hospital: sel(v), page: undefined })}
        >
          <SelectTrigger id="f-hospital">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All hospitals</SelectItem>
            {options.hospitals.map((h) => (
              <SelectItem key={h.slug} value={h.slug}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {options.cities.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="f-city">City</Label>
          <Select
            value={search.city ?? ALL}
            onValueChange={(v) => apply({ city: sel(v), page: undefined })}
          >
            <SelectTrigger id="f-city">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All cities</SelectItem>
              {options.cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="f-mode">Appointment type</Label>
        <Select
          value={search.mode ?? ALL}
          onValueChange={(v) =>
            apply({ mode: v === ALL ? undefined : (v as "ONLINE" | "IN_PERSON"), page: undefined })
          }
        >
          <SelectTrigger id="f-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any</SelectItem>
            <SelectItem value="ONLINE">Online</SelectItem>
            <SelectItem value="IN_PERSON">In-person</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-rating">Minimum rating</Label>
        <Select
          value={search.minRating?.toString() ?? ALL}
          onValueChange={(v) =>
            apply({ minRating: v === ALL ? undefined : Number(v), page: undefined })
          }
        >
          <SelectTrigger id="f-rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any</SelectItem>
            {[3, 3.5, 4, 4.5].map((r) => (
              <SelectItem key={r} value={String(r)}>
                {r}+ stars
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-exp">Minimum experience</Label>
        <Select
          value={search.minExperience?.toString() ?? ALL}
          onValueChange={(v) =>
            apply({ minExperience: v === ALL ? undefined : Number(v), page: undefined })
          }
        >
          <SelectTrigger id="f-exp">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any</SelectItem>
            {[3, 5, 10, 15].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}+ years
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ minFee: num(minFee), maxFee: num(maxFee), page: undefined });
        }}
      >
        <Label htmlFor="f-minfee">Consultation fee (PKR)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="f-minfee"
            inputMode="numeric"
            placeholder="Min"
            value={minFee}
            onChange={(e) => setMinFee(e.target.value)}
            aria-label="Minimum fee"
          />
          <Input
            inputMode="numeric"
            placeholder="Max"
            value={maxFee}
            onChange={(e) => setMaxFee(e.target.value)}
            aria-label="Maximum fee"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          Apply fee range
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <Checkbox
          id="f-scheduled"
          checked={search.scheduled === "1"}
          onCheckedChange={(c) =>
            apply({ scheduled: c === true ? "1" : undefined, page: undefined })
          }
        />
        <Label htmlFor="f-scheduled" className="font-normal">
          Has an open booking schedule
        </Label>
      </div>

      <Button variant="outline" className="w-full" onClick={reset} disabled={!hasFilters}>
        <X className="size-4" aria-hidden="true" /> Clear filters
      </Button>
    </div>
  );

  const specialtyName = options.specialties.find((s) => s.slug === search.specialty)?.name;

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Doctors" }]}
          title="Find a doctor"
          description="Compare verified specialists by fee, rating, experience and hospital."
        />

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            className="flex gap-2 lg:w-full lg:max-w-md"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              apply({ q: query.trim() || undefined, page: undefined });
            }}
          >
            <Input
              value={query}
              maxLength={MAX_SEARCH_LENGTH}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search doctor, specialty, qualification or hospital"
              aria-label="Search doctors"
            />
            <Button type="submit">Search</Button>
          </form>
          <div className="flex items-center gap-2 lg:ml-auto">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="text-left">Filters</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-8">{filters}</div>
              </SheetContent>
            </Sheet>

            <Select
              value={search.sort ?? "recommended"}
              onValueChange={(v) =>
                apply({
                  sort: v === "recommended" ? undefined : (v as DoctorUrlSearch["sort"]),
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-[210px]" aria-label="Sort doctors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="reviews">Most reviews</SelectItem>
                <SelectItem value="experience">Most experienced</SelectItem>
                <SelectItem value="fee_asc">Fee: low to high</SelectItem>
                <SelectItem value="fee_desc">Fee: high to low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <div className="surface-card sticky top-24 p-5">
              <h2 className="mb-4 font-semibold">Filters</h2>
              {filters}
            </div>
          </aside>

          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Showing <strong className="text-foreground">{results.items.length}</strong> of{" "}
                {results.total} {results.total === 1 ? "doctor" : "doctors"}
              </p>
              {search.q && <Badge variant="secondary">“{search.q}”</Badge>}
              {specialtyName && <Badge variant="secondary">{specialtyName}</Badge>}
              {search.city && <Badge variant="secondary">{search.city}</Badge>}
              {search.mode && (
                <Badge variant="secondary">
                  {search.mode === "ONLINE" ? "Online" : "In-person"}
                </Badge>
              )}
            </div>

            {results.items.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No doctors found"
                description={
                  hasFilters
                    ? "No verified doctors match these filters. Try removing a filter or searching a different term."
                    : "There are no verified doctors listed yet. Please check back soon."
                }
                action={hasFilters ? <Button onClick={reset}>Clear all filters</Button> : undefined}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {results.items.map((d) => (
                    <DoctorCard key={d.id} doctor={d} viewerRole={viewerRole} />
                  ))}
                </div>
                <div className="mt-8">
                  <Pagination
                    page={results.page}
                    totalPages={results.totalPages}
                    onChange={(p) => apply({ page: p === 1 ? undefined : p })}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
