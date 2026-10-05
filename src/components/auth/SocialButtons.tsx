import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function SocialButtons() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          or continue with
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {["Google", "Apple"].map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            onClick={() => toast.info(`${p} sign-in is a placeholder in this phase`)}
          >
            Continue with {p}
          </Button>
        ))}
      </div>
    </div>
  );
}
