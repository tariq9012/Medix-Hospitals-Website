import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { Article } from "@/types";

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lift">
      <Link to="/articles/$id" params={{ id: article.id }} className="block">
        <img
          src={article.image}
          alt={article.title}
          loading="lazy"
          className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <CardContent className="space-y-2.5 p-5">
          <Badge variant="secondary">{article.category}</Badge>
          <h3 className="font-semibold leading-snug group-hover:text-primary">{article.title}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{article.excerpt}</p>
          <p className="text-xs text-muted-foreground">
            {article.author} · {formatDate(article.date)} · {article.readTime}
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}
