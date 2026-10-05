import { Send } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  loadOlderMessagesFn,
  refreshConversationFn,
  sendMessageFn,
} from "@/lib/messaging/functions";
import { mergeLatestPage } from "@/lib/messaging/merge";
import { useRealtimeRevalidate } from "@/lib/realtime/client";
import type { Message } from "@/db/schema";

function formatMessageTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConversationView({
  conversationId,
  viewerId,
  initialMessages,
  initialHasMore,
  otherPartyLabel,
  disabledReason,
}: {
  conversationId: string;
  viewerId: string;
  initialMessages: Message[];
  initialHasMore: boolean;
  otherPartyLabel: string;
  /** Non-null when new sends are currently blocked (e.g. the provider is suspended) — history stays visible, but the composer is disabled with this explanation. */
  disabledReason: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [liveDisabledReason, setLiveDisabledReason] = useState(disabledReason);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  /**
   * Re-fetch the latest page from PostgreSQL (through the participant-checked
   * server function). Called for realtime hints, after reconnects, after our
   * own send, and when the tab becomes visible again. The incoming messages
   * are marked read on the server ONLY while this tab is actually visible.
   */
  const refreshSeq = useRef(0);
  const appliedSeq = useRef(0);
  const refresh = useCallback(async () => {
    const visible = typeof document === "undefined" || document.visibilityState === "visible";
    const seq = ++refreshSeq.current;
    const result = await refreshConversationFn({ data: { conversationId, markRead: visible } });
    if (!result) return; // not a participant / gone: show nothing new
    // A slower, older response must never overwrite a newer one already applied.
    if (seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    setMessages((prev) => mergeLatestPage(prev, result.messages));
    setLiveDisabledReason(result.disabledReason);
  }, [conversationId]);

  useRealtimeRevalidate(["MESSAGE_CREATED", "CONVERSATION_READ"], refresh, { conversationId });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Keep the newest message in view when new ones arrive, unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleLoadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await loadOlderMessagesFn({
        data: { conversationId, before: oldest.createdAt.toString() },
      });
      setMessages((prev) => [...page.messages, ...prev]);
      setHasMore(page.hasMore);
    } catch {
      toast.error("Could not load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    await submitMessage();
  }

  async function submitMessage() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const result = await sendMessageFn({ data: { conversationId, body: trimmed } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setBody("");
      // Ask the server for the authoritative list instead of hand-building a
      // message with the browser's clock: the DB row (id, createdAt) is what
      // renders, and merging by id makes the realtime echo harmless.
      // Deliberately NOT awaited: `sending` must clear immediately, exactly as
      // in Phase 10, so the composer never swallows a keypress while a
      // background refresh is in flight.
      void refresh().catch(() => undefined);
    } catch {
      toast.error("Could not send the message. Please try again.");
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col rounded-xl border border-border bg-card">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        data-testid="message-scroll"
      >
        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={handleLoadOlder} disabled={loadingOlder}>
              {loadingOlder ? "Loading…" : "Load older messages"}
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello to {otherPartyLabel}.
          </p>
        )}

        {messages.map((message) => {
          const isMine = message.senderId === viewerId;
          return (
            <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  isMine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-surface text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className={`mt-1 text-[11px] ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  {formatMessageTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="border-t border-border p-3">
        {liveDisabledReason ? (
          <p className="rounded-lg bg-surface px-3 py-2.5 text-sm text-muted-foreground">
            {liveDisabledReason}
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              ref={composerRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Message ${otherPartyLabel}…`}
              rows={2}
              className="flex-1 resize-none"
              aria-label="Message"
            />
            <Button
              type="submit"
              disabled={sending || body.trim().length === 0}
              size="icon"
              aria-label="Send"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
