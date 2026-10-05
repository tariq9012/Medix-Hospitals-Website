import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ArticleCard } from "@/components/cards/ArticleCard";
import { EmptyState, PageHeader, SectionHeading } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { articles, formatDate, getArticle } from "@/data/mock";

export const Route = createFileRoute("/articles/$id")({
  loader: ({ params }) => {
    const article = getArticle(params.id);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Article not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    const { article } = loaderData;
    return {
      meta: [
        { title: `${article.title} — Medix Health Articles` },
        { name: "description", content: article.excerpt },
        { property: "og:title", content: article.title },
        { property: "og:description", content: article.excerpt },
        { property: "og:type", content: "article" },
      ],
    };
  },
  notFoundComponent: () => (
    <PublicLayout>
      <div className="container-page py-20">
        <EmptyState
          title="Article not found"
          description="This article may have been unpublished."
          action={
            <Button asChild>
              <Link to="/articles">Back to articles</Link>
            </Button>
          }
        />
      </div>
    </PublicLayout>
  ),
  component: ArticleDetail,
});

function ArticleDetail() {
  const { article } = Route.useLoaderData();
  const related = articles
    .filter((a) => a.id !== article.id && a.status === "published")
    .slice(0, 3);

  return (
    <PublicLayout>
      <article className="container-page py-10">
        <PageHeader
          breadcrumbs={[
            { label: "Home", to: "/" },
            { label: "Health Articles", to: "/articles" },
            { label: article.category },
          ]}
          title={article.title}
        />

        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="secondary">{article.category}</Badge>
          <span>{article.author}</span>
          <span>{formatDate(article.date)}</span>
          <span>{article.readTime}</span>
        </div>

        <img
          src={article.image}
          alt={article.title}
          className="mb-8 h-64 w-full rounded-2xl object-cover sm:h-96"
        />

        <div className="mx-auto max-w-3xl space-y-5">
          <p className="text-lg leading-relaxed text-foreground">{article.excerpt}</p>
          {article.body.map((p) => (
            <p key={p.slice(0, 24)} className="leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </div>

        <div className="mt-14">
          <SectionHeading title="Related reading" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </div>
      </article>
    </PublicLayout>
  );
}
