"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel } from "@/components/frontdesk/ui";
import { useEffect, useState, useCallback, useRef } from "react";
import Script from "next/script";

type FbLoginResponse = {
  authResponse?: { code?: string; accessToken?: string } | null;
  status?: string;
};

type FbSdk = {
  init: (config: Record<string, unknown>) => void;
  login: (
    callback: (response: FbLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB: FbSdk;
  }
}

type Template = {
  id: string | null;
  trigger: string;
  label: string;
  body: string;
  enabled: boolean;
};

type WhatsAppLog = {
  id: string;
  trigger: string;
  recipient: string;
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
};

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  checkin_doctor_schedule: "When a patient checks in at frontdesk, the assigned doctor receives their schedule details.",
  lead_greeting: "When a new lead is added to CRM, they receive a greeting message.",
  appointment_confirmation: "When an appointment is booked, the patient receives confirmation details.",
  visit_thankyou_review: "After a visit is completed, the patient gets a thank you message with a Google review link.",
  billing_invoice: "When billing is processed, the patient receives their invoice details.",
  prescription_sent: "When a prescription is created, the patient is notified to collect it from pharmacy.",
};

const AVAILABLE_VARS: Record<string, string[]> = {
  checkin_doctor_schedule: ["doctorName", "patientName", "uhid", "time", "department"],
  lead_greeting: ["leadName"],
  appointment_confirmation: ["patientName", "doctorName", "date", "time"],
  visit_thankyou_review: ["patientName", "reviewLink"],
  billing_invoice: ["patientName", "invoiceNumber", "amount", "paymentStatus", "balanceDue"],
  prescription_sent: ["patientName", "itemCount", "doctorName"],
};

const WHATSAPP_APP_ID =
  process.env.NEXT_PUBLIC_WHATSAPP_APP_ID ?? "2599951033795789";
const WHATSAPP_FB_SDK_VERSION =
  process.env.NEXT_PUBLIC_WHATSAPP_FB_SDK_VERSION ?? "v20.0";
const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID =
  process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID;

type WaEmbeddedSession = {
  phone_number_id?: string;
  waba_id?: string;
  display_phone_number?: string;
  waba_name?: string;
};

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState<"connection" | "templates" | "logs" | "test">("connection");
  const [fbLoaded, setFbLoaded] = useState(false);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<{
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber?: string | null;
  } | null>(null);
  const sessionInfoRef = useRef<WaEmbeddedSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, logRes, connRes] = await Promise.all([
        fetch("/api/admin/whatsapp/templates", { credentials: "include" }),
        fetch("/api/admin/whatsapp/logs?limit=50", { credentials: "include" }),
        fetch("/api/admin/whatsapp/connect", { credentials: "include" }),
      ]);
      const tplJson = await tplRes.json();
      const logJson = await logRes.json();
      const connJson = await connRes.json();
      if (tplJson.ok) setTemplates(tplJson.data);
      if (logJson.ok) setLogs(logJson.data);
      if (connJson.ok && connJson.data) {
        setConnectedAccount({
          wabaId: connJson.data.wabaId,
          phoneNumberId: connJson.data.phoneNumberId,
          displayPhoneNumber: connJson.data.displayPhoneNumber,
        });
      }
    } catch (e) {
      console.error("Failed to load WhatsApp data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Data fetch on mount; this is the standard pattern already used across this page.
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          const info = data?.data ?? data;
          console.log("[whatsapp:embedded-signup] session info:", info);
          const next: WaEmbeddedSession = {
            phone_number_id: info?.phone_number_id,
            waba_id: info?.waba_id,
            display_phone_number: info?.display_phone_number,
            waba_name: info?.waba_name,
          };
          sessionInfoRef.current = next;
        }
      } catch {
        // Non-JSON or unrelated message — ignore
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const saveTemplate = async (trigger: string) => {
    const tpl = templates.find((t) => t.trigger === trigger);
    if (!tpl) return;
    setSaving(trigger);
    try {
      const res = await fetch("/api/admin/whatsapp/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          trigger: tpl.trigger,
          label: tpl.label,
          body: tpl.body,
          enabled: tpl.enabled,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(json.error || "Failed to save template");
      }
    } catch (e) {
      console.error("Failed to save template:", e);
      alert("Failed to save template");
    } finally {
      setSaving(null);
    }
  };

  const updateTemplate = (trigger: string, field: keyof Template, value: string | boolean) => {
    setTemplates((prev) =>
      prev.map((t) => (t.trigger === trigger ? { ...t, [field]: value } : t)),
    );
  };

  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string } | null>(null);

  /* ---------------- OpenWA gateway session state ---------------- */
  const [openwa, setOpenwa] = useState<{
    gatewayOnline: boolean;
    sessionId: string;
    status?: string;
    phone?: string | null;
    detail?: string;
  } | null>(null);
  const [openwaQr, setOpenwaQr] = useState<string | null>(null);
  const [openwaBusy, setOpenwaBusy] = useState(false);
  const [openwaError, setOpenwaError] = useState<string | null>(null);

  const loadOpenwa = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/openwa/session", { credentials: "include" });
      const json = await res.json();
      if (json.ok) setOpenwa(json.data);
    } catch (e) {
      console.error("[whatsapp:openwa] status load failed:", e);
    }
  }, []);

  const openwaAction = useCallback(async (action: "start" | "qr" | "stop") => {
    setOpenwaBusy(true);
    setOpenwaError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/openwa/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.ok && action === "qr") {
        setOpenwaQr(json.data?.qr ?? null);
      } else if (!json.ok) {
        setOpenwaError(json.error || "OpenWA action failed");
      }
    } catch (e) {
      setOpenwaError(e instanceof Error ? e.message : "OpenWA request failed");
    } finally {
      setOpenwaBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadOpenwa();
  }, [loadOpenwa]);

  // Poll session status while a QR pairing might be in progress.
  useEffect(() => {
    if (!openwaQr) return;
    const timer = setInterval(() => void loadOpenwa(), 4000);
    return () => clearInterval(timer);
  }, [openwaQr, loadOpenwa]);

  // Stop showing the QR once the session reports connected/ready.
  useEffect(() => {
    const s = openwa?.status?.toLowerCase();
    if (s === "connected" || s === "ready" || s === "authenticated") {
      setOpenwaQr(null);
    }
  }, [openwa?.status]);
  const sendTest = async () => {
    if (!testPhone.trim()) {
      alert("Enter a phone number first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: testPhone.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        const detail =
          json.data?.detail ||
          json.data?.error ||
          (json.data?.provider === "demo" ? "Demo mode — not actually sent" : "Message sent successfully");
        setTestResult({ ok: true, detail });
      } else {
        setTestResult({ ok: false, detail: json.error || json.data?.error || "Send failed" });
      }
    } catch {
      setTestResult({ ok: false, detail: "Request failed" });
    } finally {
      setTesting(false);
    }
  };

  const launchWhatsAppSignup = () => {
    if (!window.FB) return alert("Facebook SDK not loaded yet.");
    if (!WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) {
      return alert("WhatsApp Embedded Signup Configuration ID is not configured.");
    }
    setFbConnecting(true);
    sessionInfoRef.current = null;

    window.FB.login(
      (response: FbLoginResponse) => {
        if (response?.authResponse?.code) {
          const code = response.authResponse.code;
          const info = sessionInfoRef.current;
          fetch("/api/admin/whatsapp/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              wabaId: info?.waba_id,
              phoneNumberId: info?.phone_number_id,
              displayPhoneNumber: info?.display_phone_number,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.ok) {
                setConnectedAccount({
                  wabaId: info?.waba_id ?? "",
                  phoneNumberId: info?.phone_number_id ?? "",
                  displayPhoneNumber: info?.display_phone_number,
                });
                alert("WhatsApp connected successfully!");
                void load();
              } else {
                alert(data.error || "Failed to connect WhatsApp");
              }
            })
            .catch(() => alert("Network error"))
            .finally(() => setFbConnecting(false));
        } else {
          setFbConnecting(false);
        }
      },
      {
        config_id: WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      }
    );
  };

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Admin", href: "/app/admin" },
        { label: "WhatsApp Templates" },
      ]}
      title="WhatsApp Templates"
      meta="Gurgaon branch · Editable message templates"
    >
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={() => {
          if (window.FB) {
            window.FB.init({
              appId: WHATSAPP_APP_ID,
              cookie: true,
              xfbml: true,
              version: WHATSAPP_FB_SDK_VERSION,
            });
            setFbLoaded(true);
          }
        }}
      />
      <div className="mb-4 flex gap-2">
        <AttioButton
          variant={tab === "connection" ? "primary" : "secondary"}
          onClick={() => setTab("connection")}
        >
          Connection
        </AttioButton>
        <AttioButton
          variant={tab === "templates" ? "primary" : "secondary"}
          onClick={() => setTab("templates")}
        >
          Templates
        </AttioButton>
        <AttioButton
          variant={tab === "logs" ? "primary" : "secondary"}
          onClick={() => setTab("logs")}
        >
          Message Logs
        </AttioButton>
        <AttioButton
          variant={tab === "test" ? "primary" : "secondary"}
          onClick={() => setTab("test")}
        >
          Test Send
        </AttioButton>
      </div>

      {loading ? (
        <Panel title="Loading...">
          <p className="text-[13px] text-neutral-500">Loading WhatsApp configuration...</p>
        </Panel>
      ) : tab === "connection" ? (
        <div className="space-y-4">
          <Panel title="WhatsApp Gateway (OpenWA)">
            <div className="space-y-4">
              <p className="text-[13px] text-neutral-600">
                Self-hosted OpenWA gateway session. Scan the QR once with the clinic WhatsApp number
                (Linked devices). After pairing, all branch WhatsApp messages are sent through this session.
              </p>

              {!openwa?.gatewayOnline ? (
                <div className="rounded-md bg-red-50 p-3 text-[13px] text-red-700">
                  <p className="font-medium">OpenWA gateway is not reachable.</p>
                  <p className="mt-1">
                    {openwa?.detail || "Start the OpenWA service and set OPENWA_BASE_URL in the environment."}
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-neutral-100 p-3 text-[13px] text-neutral-700">
                  <p className="font-medium">Session: {openwa.sessionId}</p>
                  <p className="mt-1">
                    Status: <span className="font-mono">{openwa.status ?? "unknown"}</span>
                    {openwa.phone ? ` · ${openwa.phone}` : ""}
                  </p>
                </div>
              )}

              {openwaQr && (
                <div className="flex flex-col items-center gap-2 rounded-md border border-neutral-200 bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      openwaQr.startsWith("data:")
                        ? openwaQr
                        : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(openwaQr)}`
                    }
                    alt="WhatsApp pairing QR"
                    className="size-[220px]"
                  />
                  <p className="text-[12px] text-neutral-500">
                    WhatsApp → Linked devices → Link a device. This page refreshes status automatically.
                  </p>
                </div>
              )}

              {openwaError && (
                <div className="rounded-md bg-red-50 p-3 text-[13px] text-red-700">{openwaError}</div>
              )}

              <div className="flex gap-2">
                <AttioButton
                  variant="primary"
                  disabled={openwaBusy || !openwa?.gatewayOnline}
                  onClick={() => void openwaAction("start")}
                >
                  {openwaBusy ? "Working..." : "Start / Reconnect Session"}
                </AttioButton>
                <AttioButton
                  variant="secondary"
                  disabled={openwaBusy || !openwa?.gatewayOnline}
                  onClick={() => void openwaAction("qr")}
                >
                  Show Pairing QR
                </AttioButton>
                <AttioButton
                  variant="secondary"
                  disabled={openwaBusy || !openwa?.gatewayOnline}
                  onClick={() => void loadOpenwa()}
                >
                  Refresh Status
                </AttioButton>
              </div>
            </div>
          </Panel>

          <Panel title="Connect WhatsApp Business (Meta Cloud API)">
            <div className="space-y-4">
              <p className="text-[13px] text-neutral-600">
                Alternative: connect an official WhatsApp Business Cloud API account. Click below, sign in with
                Facebook, select your WhatsApp Business account and phone number. Once connected, all messages
                for this branch will be sent from that number.
              </p>
              {!WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID && (
                <div className="rounded-md bg-red-50 p-3 text-[13px] text-red-700">
                  <p className="font-medium">WhatsApp Embedded Signup is not configured.</p>
                  <p className="mt-1">
                    Set <code>NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID</code> in your environment.
                  </p>
                </div>
              )}
              {connectedAccount && (
                <div className="rounded-md bg-green-50 p-3 text-[13px] text-green-700">
                  <p className="font-medium">Connected WhatsApp account</p>
                  <p className="mt-1">WABA ID: {connectedAccount.wabaId}</p>
                  <p>Phone Number ID: {connectedAccount.phoneNumberId}</p>
                  {connectedAccount.displayPhoneNumber && (
                    <p>Number: {connectedAccount.displayPhoneNumber}</p>
                  )}
                </div>
              )}
              <AttioButton
                variant="primary"
                onClick={launchWhatsAppSignup}
                disabled={!fbLoaded || fbConnecting || !WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID}
              >
                {fbConnecting ? "Connecting..." : "Connect WhatsApp Business"}
              </AttioButton>
            </div>
          </Panel>
        </div>
      ) : tab === "templates" ? (
        <div className="space-y-4">
          {templates.map((tpl) => (
            <Panel key={tpl.trigger} title={tpl.label}>
              <div className="space-y-3">
                <p className="text-[12px] text-neutral-500">
                  {TRIGGER_DESCRIPTIONS[tpl.trigger] || ""}
                </p>

                <div>
                  <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                    Template Label
                  </label>
                  <input
                    type="text"
                    value={tpl.label}
                    onChange={(e) => updateTemplate(tpl.trigger, "label", e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-[13px]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                    Message Body
                  </label>
                  <textarea
                    value={tpl.body}
                    onChange={(e) => updateTemplate(tpl.trigger, "body", e.target.value)}
                    rows={5}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-[13px] font-mono"
                  />
                </div>

                <div>
                  <p className="mb-1 text-[11px] text-neutral-500">Available variables:</p>
                  <div className="flex flex-wrap gap-1">
                    {(AVAILABLE_VARS[tpl.trigger] || []).map((v) => (
                      <code
                        key={v}
                        className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600"
                      >
                        {`{{${v}}}`}
                      </code>
                    ))}
                    {tpl.trigger === "visit_thankyou_review" && (
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                        {"{{reviewLink}}"}
                      </code>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={tpl.enabled}
                      onChange={(e) => updateTemplate(tpl.trigger, "enabled", e.target.checked)}
                    />
                    <span>Enabled</span>
                  </label>
                  <AttioButton
                    variant="primary"
                    onClick={() => void saveTemplate(tpl.trigger)}
                    disabled={saving === tpl.trigger}
                  >
                    {saving === tpl.trigger ? "Saving..." : "Save"}
                  </AttioButton>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : tab === "test" ? (
        <Panel title="Test WhatsApp Message">
          <div className="space-y-4">
            <p className="text-[13px] text-neutral-500">
              Send a test WhatsApp message to verify your Meta Cloud API configuration is working.
              Make sure the phone number is registered with WhatsApp.
            </p>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-700">
                Phone Number (with or without country code)
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-[13px]"
              />
              <p className="mt-1 text-[11px] text-neutral-400">
                Indian numbers: 10 digits without country code. International: include country code.
              </p>
            </div>
            <AttioButton
              variant="primary"
              onClick={() => void sendTest()}
              disabled={testing}
            >
              {testing ? "Sending..." : "Send Test Message"}
            </AttioButton>
            {testResult && (
              <div
                className={`rounded-md p-3 text-[13px] ${
                  testResult.ok
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <strong>{testResult.ok ? "Success" : "Failed"}</strong>
                {testResult.detail && <p className="mt-1">{testResult.detail}</p>}
              </div>
            )}
            <div className="rounded-md bg-neutral-50 p-3 text-[12px] text-neutral-500">
              <p className="font-medium text-neutral-700">Meta WhatsApp Cloud API — Environment Variables (set in Coolify):</p>
              <ul className="mt-2 space-y-1">
                <li><code>NEXT_PUBLIC_WHATSAPP_APP_ID</code> — Meta app ID (fallback: 2599951033795789)</li>
                <li><code>NEXT_PUBLIC_WHATSAPP_FB_SDK_VERSION</code> — FB SDK version for Embedded Signup (default: v20.0)</li>
                <li><code>NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID</code> — WhatsApp Embedded Signup configuration ID</li>
                <li><code>WHATSAPP_APP_SECRET</code> — Meta app secret (server-side only)</li>
                <li><code>WHATSAPP_API_TOKEN</code> — Fallback global Meta access token</li>
                <li><code>WHATSAPP_API_BASE_URL</code> — Meta Graph API base URL (default: https://graph.facebook.com/v21.0)</li>
                <li><code>WHATSAPP_PHONE_NUMBER_ID</code> — Fallback global phone number ID</li>
                <li><code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> — Webhook verify token</li>
              </ul>
              <p className="mt-2">Our webhook receiver: <code>/api/whatsapp/webhook</code></p>
              <p className="mt-1">Set this URL in Meta webhook config: <code>https://your-domain.com/api/whatsapp/webhook</code></p>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Recent WhatsApp Messages">
          {logs.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No messages sent yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-md border border-neutral-200 p-3 text-[12px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.trigger}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        log.status === "sent" || log.status === "delivered" || log.status === "read"
                          ? "bg-green-100 text-green-700"
                          : log.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <div className="mt-1 text-neutral-500">To: {log.recipient}</div>
                  <div className="mt-1 text-neutral-600">{log.body.slice(0, 150)}...</div>
                  {log.error && (
                    <div className="mt-1 text-red-500">Error: {log.error}</div>
                  )}
                  <div className="mt-1 text-neutral-400">
                    {new Date(log.createdAt).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </PageChrome>
  );
}
