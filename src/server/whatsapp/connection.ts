import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";

const GRAPH_URL = process.env.WHATSAPP_API_BASE_URL?.includes("graph.facebook.com")
  ? process.env.WHATSAPP_API_BASE_URL
  : "https://graph.facebook.com/v21.0";

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to store WhatsApp credentials");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptWhatsAppToken(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptWhatsAppToken(value: string) {
  if (!value.startsWith("v1:")) return value;
  const [, iv, tag, payload] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
): Promise<string> {
  const url = new URL(`${GRAPH_URL}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  // Note: For the FB.login config_id popup flow, do not set redirect_uri.
  // Meta does not record a redirect_uri for this code, and sending one causes
  // a "redirect_uri mismatch" error during exchange.

  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Token exchange failed (${response.status})`);
  }
  if (!data.access_token) {
    throw new Error("No access_token returned from Meta");
  }
  return data.access_token as string;
}

export async function getActiveConnection(ctx: Pick<ServerContext, "tenantId" | "branchId">) {
  return prisma.whatsappConnection.findFirst({
    where: { tenantId: ctx.tenantId, branchId: ctx.branchId, active: true },
    orderBy: { connectedAt: "desc" },
  });
}

export async function graphGet(path: string, token: string) {
  const response = await fetch(`${GRAPH_URL}/${path.replace(/^\//, "")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? `Meta request failed (${response.status})`);
  return data;
}

export { GRAPH_URL };
