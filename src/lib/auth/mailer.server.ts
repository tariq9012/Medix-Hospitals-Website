import "@tanstack/react-start/server-only";

import { isProductionEnv } from "./env.server";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}

/**
 * DEVELOPMENT ONLY. Prints the message (including any reset/verification
 * link) to the server console instead of sending real email, so the flow is
 * testable locally without a mail provider. This must never run in
 * production — see `getMailAdapter` below.
 */
class ConsoleDevMailAdapter implements MailAdapter {
  async send(message: MailMessage): Promise<void> {
    console.log(
      [
        "",
        "📧  [DEV MAIL — not actually sent] ─────────────────────────",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "──────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}

/**
 * Fails loudly instead of silently logging sensitive links (password reset
 * URLs, etc.) to production logs. Configure a real provider under
 * `MAIL_PROVIDER` before any flow that sends email can work in production.
 */
class UnconfiguredMailAdapter implements MailAdapter {
  async send(): Promise<void> {
    throw new Error(
      "No email provider is configured for production (MAIL_PROVIDER is unset). " +
        "Refusing to send — configure a provider in src/lib/auth/mailer.server.ts before " +
        "relying on email delivery in production.",
    );
  }
}

let cachedAdapter: MailAdapter | undefined;

export function getMailAdapter(): MailAdapter {
  if (cachedAdapter) return cachedAdapter;

  if (!isProductionEnv()) {
    cachedAdapter = new ConsoleDevMailAdapter();
    return cachedAdapter;
  }

  const provider = process.env["MAIL_PROVIDER"];
  if (!provider) {
    cachedAdapter = new UnconfiguredMailAdapter();
    return cachedAdapter;
  }

  // Future: wire real providers here, e.g.
  //   if (provider === "resend") return new ResendMailAdapter(...);
  throw new Error(`Unsupported MAIL_PROVIDER: "${provider}".`);
}

/**
 * Sends best-effort — a failed mail send (e.g. unconfigured production
 * provider) is logged but never thrown back to the caller, so flows like
 * "forgot password" can still return their neutral response regardless of
 * whether the email actually went out.
 */
export async function sendMailSafely(message: MailMessage): Promise<void> {
  try {
    await getMailAdapter().send(message);
  } catch (error) {
    console.error("[mailer] failed to send message:", error);
  }
}
