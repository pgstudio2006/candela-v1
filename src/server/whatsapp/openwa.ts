/**
 * OpenWA Gateway client (Open Source WhatsApp API Gateway, self-hosted HTTP API).
 *
 * Docs endpoints used:
 *  - POST /api/sessions                          create session
 *  - GET  /api/sessions                          list sessions
 *  - GET  /api/sessions/{id}                     get session
 *  - DELETE /api/sessions/{id}                   delete session
 *  - POST /api/sessions/{id}/start               start + init WhatsApp connection
 *  - POST /api/sessions/{id}/stop                stop / disconnect
 *  - GET  /api/sessions/{id}/qr                  QR code for auth
 *  - POST /api/sessions/{id}/messages/send-text  send text message
 *  - POST /api/sessions/{id}/webhooks            create webhook
 *  - GET  /api/health                            health check
 *
 * Config (env):
 *  - OPENWA_BASE_URL             e.g. http://127.0.0.1:2785
 *  - OPENWA_API_KEY              optional admin API key
 *  - OPENWA_DEFAULT_SESSION_ID   fallback session, default "candela-main"
 */

const OPENWA_BASE_URL = (process.env.OPENWA_BASE_URL ?? "http://127.0.0.1:2785").replace(/\/$/, "");
const OPENWA_API_KEY = process.env.OPENWA_API_KEY ?? "";

export function openwaBaseUrl() {
  return OPENWA_BASE_URL;
}

export function defaultOpenwaSessionId() {
  return process.env.OPENWA_DEFAULT_SESSION_ID ?? "candela-main";
}

export type OpenwaSessionStatus =
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "authenticated"
  | "connected"
  | "ready"
  | "stopped"
  | "failed"
  | (string & {});

export type OpenwaSession = {
  id: string;
  name?: string;
  status?: OpenwaSessionStatus;
  phone?: string | null;
  pushName?: string | null;
  connected?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type OpenwaQr = {
  qr?: string;
  qrCode?: string;
  dataUrl?: string;
  status?: OpenwaSessionStatus;
};

export class OpenwaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenwaError";
    this.status = status;
  }
}

async function openwaFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const url = `${OPENWA_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(OPENWA_API_KEY ? { "X-API-Key": OPENWA_API_KEY } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers, signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (body as { message?: string; error?: string } | null)?.message ??
        (body as { error?: string } | null)?.error ??
        (text.slice(0, 300) || `OpenWA request failed (${res.status})`);
      throw new OpenwaError(msg, res.status);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

export async function openwaHealth(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await openwaFetch<unknown>("/api/health", { method: "GET" }, 5_000);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "unreachable" };
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function listOpenwaSessions(): Promise<OpenwaSession[]> {
  const data = await openwaFetch<OpenwaSession[] | { data?: OpenwaSession[] }>("/api/sessions");
  return Array.isArray(data) ? data : (data?.data ?? []);
}

export async function getOpenwaSession(sessionId: string): Promise<OpenwaSession | null> {
  try {
    return await openwaFetch<OpenwaSession>(`/api/sessions/${encodeURIComponent(sessionId)}`);
  } catch (e) {
    if (e instanceof OpenwaError && e.status === 404) return null;
    throw e;
  }
}

export async function createOpenwaSession(sessionId: string, displayName?: string): Promise<OpenwaSession> {
  return openwaFetch<OpenwaSession>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ id: sessionId, name: displayName ?? sessionId }),
  });
}

export async function startOpenwaSession(sessionId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    await openwaFetch<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/start`, { method: "POST" }, 30_000);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "start failed" };
  }
}

export async function stopOpenwaSession(sessionId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    await openwaFetch<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, { method: "POST" });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "stop failed" };
  }
}

export async function deleteOpenwaSession(sessionId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    await openwaFetch<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "delete failed" };
  }
}

export async function getOpenwaQr(sessionId: string): Promise<OpenwaQr> {
  return openwaFetch<OpenwaQr>(`/api/sessions/${encodeURIComponent(sessionId)}/qr`);
}

/** Ensure a session exists and is started. Safe to call repeatedly. */
export async function ensureOpenwaSession(sessionId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const existing = await getOpenwaSession(sessionId);
    if (!existing) {
      await createOpenwaSession(sessionId);
    }
    return startOpenwaSession(sessionId);
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "ensure failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/** Normalize an Indian phone number into a WhatsApp chat id (e.g. 919876543210@c.us). */
export function formatOpenwaChatId(recipient: string): string {
  const trimmed = recipient.trim();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `${normalized}@c.us`;
}

export async function sendOpenwaTextMessage(
  sessionId: string,
  recipient: string,
  text: string,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const data = await openwaFetch<Record<string, unknown>>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`,
      {
        method: "POST",
        body: JSON.stringify({ chatId: formatOpenwaChatId(recipient), text }),
      },
    );
    return { ok: true, detail: JSON.stringify(data).slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "send-text failed" };
  }
}

export async function sendOpenwaDocumentMessage(
  sessionId: string,
  recipient: string,
  documentUrl: string,
  filename?: string,
  caption?: string,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const data = await openwaFetch<Record<string, unknown>>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages/send-document`,
      {
        method: "POST",
        body: JSON.stringify({
          chatId: formatOpenwaChatId(recipient),
          url: documentUrl,
          ...(filename ? { filename } : {}),
          ...(caption ? { caption } : {}),
        }),
      },
    );
    return { ok: true, detail: JSON.stringify(data).slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "send-document failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

export async function createOpenwaWebhook(
  sessionId: string,
  url: string,
  events?: string[],
): Promise<{ ok: boolean; detail?: string }> {
  try {
    await openwaFetch<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, {
      method: "POST",
      body: JSON.stringify({ url, ...(events?.length ? { events } : {}) }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "webhook create failed" };
  }
}
