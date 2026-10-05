import { useRouter } from "@tanstack/react-router";

import { CardSkeletonGrid, ErrorState, PageHeader } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";

export function DirectoryPending({ title }: { title: string }) {
  return (
    <PublicLayout>
      <div className="container-page py-10" aria-busy="true">
        <PageHeader title={title} />
        <CardSkeletonGrid count={6} />
      </div>
    </PublicLayout>
  );
}

/** Safe, generic error UI — the message is fixed text, never the raw error. */
export function DirectoryError() {
  const router = useRouter();
  return (
    <PublicLayout>
      <div className="container-page py-16">
        <ErrorState
          title="We couldn't load this page"
          description="Something went wrong on our side. Please try again in a moment."
          onRetry={() => void router.invalidate()}
        />
      </div>
    </PublicLayout>
  );
}
