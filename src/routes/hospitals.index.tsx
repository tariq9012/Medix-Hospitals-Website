import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { HospitalCard } from "@/components/cards/HospitalCard";
import { DirectoryError, DirectoryPending } from "@/components/directory/DirectoryStates";
import { EmptyState, PageHeader, Pagination } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { searchHospitalsFn } from "@/lib/directory/functions";
import { parseHospitalSearch, type HospitalUrlSearch } from "@/lib/directory/search-params";
import { MAX_SEARCH_LENGTH } from "@/lib/validation/directory";

export const Route = createFileRoute("/hospitals/")({
  validateSearch: (search: Record<string, unknown>): HospitalUrlSearch =>
    parseHospitalSearch(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchHospitalsFn({ data: deps }),
  pendingComponent: () => <DirectoryPending title="Find a hospital" />,
  errorComponent: DirectoryError,
  head: () => ({
    meta: [
      { title: "Find Hospitals — Medix Hospital Directory" },
      {
        name: "description",
        content:
          "Browse verified hospitals and clinics by specialty, department, service and city, and book with their doctors.",
      },
      { property: "og:title", content: "Find Hospitals — Medix Hospital Directory" },
    ],
  }),
  component: HospitalsPage,
});

const ALL = "all";

function HospitalsPage() {
  const { results, options, viewerRole } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/hospitals/" });
  const [query, setQuery] = useState(search.q ?? "");

  function apply(patch: Partial<HospitalUrlSearch>) {
    void navigate({
      search: (prev: HospitalUrlSearch) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, v]) => v !== undefined && v !== ""),
        ) as HospitalUrlSearch,
    });
  }
  const sel = (v: string) => (v === ALL ? undefined : v);
  const hasFilters = Object.keys(search).some((k) => k !== "page" && k !== "sort");

  function reset() {
    setQuery("");
    void navigate({ search: {} });
  }

  const dropdown = (
    id: string,
    label: string,
    value: string | undefined,
    items: { value: string; label: string }[],
    key: keyof HospitalUrlSearch,
    allLabel: string,
  ) =>
    items.length > 0 && (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={value ?? ALL}
          onValueChange={(v) => apply({ [key]: sel(v), page: undefined })}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{allLabel}</SelectItem>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );

  const filters = (
    <div className="space-y-5">
      {dropdown(
        "h-specialty",
        "Specialty",
        search.specialty,
        options.specialties.map((s) => ({ value: s.slug, label: s.name })),
        "specialty",
        "All specialties",
      )}
      {dropdown(
        "h-city",
        "City",
        search.city,
        options.cities.map((c) => ({ value: c, label: c })),
        "city",
        "All cities",
      )}
      {dropdown(
        "h-dept",
        "Department",
        search.department,
        options.departments.map((d) => ({ value: d, label: d })),
        "department",
        "All departments",
      )}
      {dropdown(
        "h-service",
        "Service",
        search.service,
        options.services.map((d) => ({ value: d, label: d })),
        "service",
        "All services",
      )}
      <Button variant="outline" className="w-full" onClick={reset} disabled={!hasFilters}>
        <X className="size-4" aria-hidden="true" /> Clear filters
      </Button>
    </div>
  );

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Hospitals" }]}
          title="Find a hospital"
          description="Verified hospitals and clinics with their departments, services and doctors."
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
              placeholder="Search hospital, city, department or service"
              aria-label="Search hospitals"
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
                  sort: v === "recommended" ? undefined : (v as HospitalUrlSearch["sort"]),
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-[200px]" aria-label="Sort hospitals">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="reviews">Most reviews</SelectItem>
                <SelectItem value="doctors">Most doctors</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
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
                {results.total} {results.total === 1 ? "hospital" : "hospitals"}
              </p>
              {search.q && <Badge variant="secondary">“{search.q}”</Badge>}
              {search.city && <Badge variant="secondary">{search.city}</Badge>}
            </div>
            {results.items.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No hospitals found"
                description={
                  hasFilters
                    ? "No verified hospitals match these filters. Try removing a filter or searching a different term."
                    : "There are no verified hospitals listed yet. Please check back soon."
                }
                action={hasFilters ? <Button onClick={reset}>Clear all filters</Button> : undefined}
              />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {results.items.map((h) => (
                    <HospitalCard key={h.id} hospital={h} viewerRole={viewerRole} />
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
