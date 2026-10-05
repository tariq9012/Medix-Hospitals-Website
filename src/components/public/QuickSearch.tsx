import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

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
import { MAX_SEARCH_LENGTH } from "@/lib/validation/directory";

const ALL = "all";

/** Homepage search. Options are real (passed in from the DB-backed loader); submits to the server-filtered directory via URL params. */
export function QuickSearch({
  specialties,
  cities,
}: {
  specialties: { name: string; slug: string }[];
  cities: string[];
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState("doctor");
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState(ALL);
  const [city, setCity] = useState(ALL);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim() || undefined;
    const sp = specialty === ALL ? undefined : specialty;
    const ct = city === ALL ? undefined : city;
    if (kind === "hospital")
      void navigate({ to: "/hospitals", search: { q, specialty: sp, city: ct } });
    else void navigate({ to: "/doctors", search: { q, specialty: sp, city: ct } });
  }

  return (
    <form
      onSubmit={submit}
      className="surface-card grid gap-4 p-5 shadow-lift md:p-6"
      aria-label="Quick search"
    >
      <p className="font-display text-lg font-semibold">What are you looking for?</p>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="qs-kind">Looking for</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="qs-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="doctor">Doctor</SelectItem>
              <SelectItem value="hospital">Hospital</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qs-query">Name or keyword</Label>
          <Input
            id="qs-query"
            value={query}
            maxLength={MAX_SEARCH_LENGTH}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Ahmed"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qs-specialty">Specialty</Label>
          <Select value={specialty} onValueChange={setSpecialty}>
            <SelectTrigger id="qs-specialty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All specialties</SelectItem>
              {specialties.map((s) => (
                <SelectItem key={s.slug} value={s.slug}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qs-city">Location</Label>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger id="qs-city">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All cities</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" size="lg" className="w-full lg:w-auto">
            <Search className="size-4" aria-hidden="true" /> Search
          </Button>
        </div>
      </div>
    </form>
  );
}
