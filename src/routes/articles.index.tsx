import { createFileRoute, Link } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";
import { useMemo, useState } from "react";

import { ArticleCard } from "@/components/cards/ArticleCard";
import { EmptyState, PageHeader } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { articles, formatDate } from "@/data/mock";

const CATEGORIES = [
  "All",
  "Nutrition",
  "Fitness",
  "Mental Wellness",
  "General Health",
  "Women's Health",
  "Children's Health",
];

export const Route = createFileRoute("/articles/")({
  head: () => ({
    meta: [
      { title: "Health Articles — Evidence-based Guides | Medix" },
      {
        name: "description",
        content:
          "Practical health writing reviewed by Medix doctors: nutrition, fitness, mental wellness, women's health and children's health.",
      },
      { property: "og:title", content: "Health Articles — Evidence-based Guides | Medix" },
      {
        property: "og:description",
        content: "Practical, doctor-reviewed health guides from the Medix editorial team.",
      },
    ],
  }),
  component: ArticlesPage,
});

function ArticlesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const published = articles.filter((a) => a.status === "published");
  const featured = published.find((a) => a.featured) ?? published[0];

  const list = useMemo(
    () =>
      published.filter((a) => {
        if (a.id === featured?.id) return false;
        if (category !== "All" && a.category !== category) return false;
        if (query && !`${a.title} ${a.excerpt}`.toLowerCase().includes(query.toLowerCase()))
          return false;
        return true;
      }),
    [published, featured, category, query],
  );

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Health Articles" }]}
          title="Health articles"
          description="Practical, doctor-reviewed guides on everyday health decisions."
        />

        <div className="mb-8 flex flex-col gap-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles"
            aria-label="Search articles"
            className="max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={c === category ? "default" : "outline"}
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>

        {featured && category === "All" && !query && (
          <Link
            to="/articles/$id"
            params={{ id: featured.id }}
            className="surface-card mb-10 grid overflow-hidden transition-shadow hover:shadow-lifted md:grid-cols-2"
          >
            <img
              src={featured.image}
              alt={featured.title}
              className="h-56 w-full object-cover md:h-full"
            />
            <div className="space-y-3 p-6 md:p-8">
              <Badge variant="secondary">Featured · {featured.category}</Badge>
              <h2 className="font-display text-2xl font-bold tracking-tight">{featured.title}</h2>
              <p className="text-sm text-muted-foreground">{featured.excerpt}</p>
              <p className="text-xs text-muted-foreground">
                {featured.author} · {formatDate(featured.date)} · {featured.readTime}
              </p>
            </div>
          </Link>
        )}

        {list.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title="No articles found"
            description="Try a different category or search term."
            action={
              <Button
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Reset
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
