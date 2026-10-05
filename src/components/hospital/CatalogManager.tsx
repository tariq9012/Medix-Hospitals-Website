import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Department: phone extension / location. Service: category. */
  secondaryLabel?: string | null;
  tertiaryLabel?: string | null;
}

/**
 * Shared list + create/toggle UI for hospital departments and services.
 * Both are hospital-scoped catalogs with the same shape, so they share one
 * component rather than two near-identical pages.
 *
 * Items are disabled rather than deleted — other records may reference them
 * and shouldn't be silently orphaned.
 */
export function CatalogManager({
  items,
  itemNoun,
  extraFieldLabel,
  extraFieldPlaceholder,
  canManage,
  onCreate,
  onToggle,
}: {
  items: CatalogItem[];
  itemNoun: string;
  extraFieldLabel: string;
  extraFieldPlaceholder: string;
  canManage: boolean;
  onCreate: (input: {
    name: string;
    description?: string;
    extra?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  onToggle: (id: string, isActive: boolean) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleToggle(id: string, isActive: boolean) {
    const res = await onToggle(id, isActive);
    if (!res.ok) toast.error(res.message ?? "Could not update.");
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canManage}>
              <Plus className="size-4" aria-hidden="true" /> Add {itemNoun}
            </Button>
          </DialogTrigger>
          <CreateDialog
            itemNoun={itemNoun}
            extraFieldLabel={extraFieldLabel}
            extraFieldPlaceholder={extraFieldPlaceholder}
            onClose={() => setDialogOpen(false)}
            onCreate={onCreate}
          />
        </Dialog>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={`No ${itemNoun}s yet`}
          description={`Add your first ${itemNoun} so patients and staff can see it.`}
        />
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.id} className={item.isActive ? undefined : "opacity-60"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {item.secondaryLabel && (
                      <Badge variant="secondary">{item.secondaryLabel}</Badge>
                    )}
                    {item.tertiaryLabel && (
                      <span className="text-xs text-muted-foreground">{item.tertiaryLabel}</span>
                    )}
                    {!item.isActive && <Badge variant="outline">Disabled</Badge>}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={item.isActive}
                    disabled={!canManage}
                    onCheckedChange={(checked) => handleToggle(item.id, checked)}
                    aria-label={item.isActive ? `Disable ${item.name}` : `Enable ${item.name}`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function CreateDialog({
  itemNoun,
  extraFieldLabel,
  extraFieldPlaceholder,
  onClose,
  onCreate,
}: {
  itemNoun: string;
  extraFieldLabel: string;
  extraFieldPlaceholder: string;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description?: string;
    extra?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [extra, setExtra] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await onCreate({
        name,
        description: description || undefined,
        extra: extra || undefined,
      });
      if (!res.ok) {
        setError(res.message ?? "Could not create.");
        return;
      }
      toast.success(`${itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1)} added.`);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add {itemNoun}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-extra">{extraFieldLabel}</Label>
          <Input
            id="cat-extra"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={extraFieldPlaceholder}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-desc">Description (optional)</Label>
          <Textarea
            id="cat-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isSubmitting || name.trim().length < 2}>
          {isSubmitting ? "Adding…" : `Add ${itemNoun}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
