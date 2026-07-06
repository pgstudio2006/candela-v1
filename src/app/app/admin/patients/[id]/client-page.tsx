"use client";

import { deleteAdminPatientAction } from "@/server/admin/actions";
import { useAdminStore } from "@/components/admin/admin-store";
import type { AdminPatientHistory } from "@/server/admin/patients";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, Panel, StatusBadge } from "@/components/frontdesk/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatStageStatus } from "@/lib/frontdesk-workflow";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminPatientDetailClientPage({
  patientId,
  initialHistory,
}: {
  patientId: string;
  initialHistory: AdminPatientHistory | null;
}) {
  const router = useRouter();
  const { refresh: refreshAdminStore } = useAdminStore();
  const [history] = useState<AdminPatientHistory | null>(initialHistory);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [selectedForm, setSelectedForm] = useState<AdminPatientHistory["formSubmissions"][number] | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteAdminPatientAction(patientId);
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
      setConfirmDelete(false);
      return;
    }
    void refreshAdminStore({ silent: true });
    router.replace("/app/admin/patients");
  };

  if (!history) {
    return (
      <PageChrome breadcrumbs={[{ label: "Admin", href: "/app/admin" }, { label: "Patients" }]} title="Not found">
        <p className="text-[13px] text-red-600">Patient not found.</p>
        <Link href="/app/admin/patients" className="mt-3 inline-block text-[13px] text-[var(--attio-accent)]">
          ← Back to patients
        </Link>
      </PageChrome>
    );
  }

  const { patient } = history;

  return (
    <PageChrome
      breadcrumbs={[
        { label: "Admin", href: "/app/admin" },
        { label: "Patients", href: "/app/admin/patients" },
        { label: patient.name },
      ]}
      title={patient.name}
      meta={`${patient.uhid} · ${patient.age}y · ${patient.phone}`}
      actions={
        <AttioButton
          variant="secondary"
          className="gap-1.5 text-red-700 hover:bg-red-50"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-3.5" />
          Delete patient
        </AttioButton>
      }
    >
      <Link
        href="/app/admin/patients"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-text)]"
      >
        <ArrowLeft className="size-4" />
        All patients
      </Link>

      {history.warning && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {history.warning} Some sections may be incomplete.
        </div>
      )}

      {confirmDelete && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-[13px] font-medium text-red-900">
            Permanently delete {patient.name} ({patient.uhid})?
          </p>
          <p className="mt-1 text-[12px] text-red-800">
            This removes all visits, billing, consents, and form submissions for this patient. This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <AttioButton variant="secondary" className="!h-8" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </AttioButton>
            <AttioButton
              variant="primary"
              className="!h-8 bg-red-700 hover:bg-red-800"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Yes, delete permanently"}
            </AttioButton>
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-1">
        {Array.isArray(patient.tags) && patient.tags.map((t) => (
          <StatusBadge key={t} label={t} variant="neutral" />
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="visits">Visits ({history.visits.length})</TabsTrigger>
          <TabsTrigger value="consultations">Consultations ({history.consultations.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing ({history.invoices.length})</TabsTrigger>
          <TabsTrigger value="forms">Forms ({history.formSubmissions.length})</TabsTrigger>
          <TabsTrigger value="appointments">Appointments ({history.appointments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Panel title="Demographics">
            <dl className="grid grid-cols-2 gap-3 text-[13px] lg:grid-cols-3">
              <div><dt className="text-[var(--attio-text-tertiary)]">Email</dt><dd>{patient.email ?? "—"}</dd></div>
              <div><dt className="text-[var(--attio-text-tertiary)]">Department</dt><dd>{patient.department}</dd></div>
              <div><dt className="text-[var(--attio-text-tertiary)]">Referrer</dt><dd>{patient.referrer ?? "—"}</dd></div>
              <div><dt className="text-[var(--attio-text-tertiary)]">Last visit</dt><dd>{patient.lastVisit ?? "—"}</dd></div>
              <div><dt className="text-[var(--attio-text-tertiary)]">Balance</dt><dd>{patient.balance > 0 ? `₹${patient.balance}` : "Clear"}</dd></div>
              {patient.registrationNotes && (
                <div className="col-span-full"><dt className="text-[var(--attio-text-tertiary)]">Notes</dt><dd>{patient.registrationNotes}</dd></div>
              )}
            </dl>
          </Panel>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <Panel title="Visit history">
            {history.visits.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No visits recorded.</p>
            ) : (
              <ul className="space-y-2">
                {history.visits.map((v) => (
                  <li key={v.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{v.doctorName || "Unassigned"}</p>
                        <p className="text-[var(--attio-text-tertiary)]">
                          Token #{v.token ?? "—"} · {formatStageStatus(v.stage)} · {v.createdAt.slice(0, 10)}
                        </p>
                      </div>
                      <StatusBadge label={v.billing} variant={v.billing === "paid" ? "success" : "warning"} />
                    </div>
                    {v.billAmount != null && (
                      <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
                        Bill ₹{v.billAmount.toLocaleString("en-IN")}
                        {v.amountPaid != null && ` · paid ₹${v.amountPaid.toLocaleString("en-IN")}`}
                        {v.balanceDue ? ` · due ₹${v.balanceDue.toLocaleString("en-IN")}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="consultations" className="mt-4">
          <Panel title="Doctor consultations">
            {history.consultations.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No consultations recorded.</p>
            ) : (
              <ul className="space-y-2">
                {history.consultations.map((c) => (
                  <li key={c.id} className="rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{(c.doctorId ?? "—").replace(/^dr_/, "").replace(/_/g, " ")}</p>
                        <p className="text-[var(--attio-text-tertiary)]">
                          {c.startedAt.slice(0, 16).replace("T", " ")} · {c.status}
                        </p>
                      </div>
                      <StatusBadge label={c.status} variant={c.status === "completed" ? "success" : "neutral"} />
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">
                      Diagnosis: {c.diagnosisSummary}
                    </p>
                    {c.notes && (
                      <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">{c.notes.slice(0, 200)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Panel title="Invoices">
            {history.invoices.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No invoices.</p>
            ) : (
              <ul className="space-y-2">
                {history.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div>
                      <p className="font-medium font-mono">{inv.invoiceNo}</p>
                      <p className="text-[var(--attio-text-tertiary)]">{inv.createdAt.slice(0, 10)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">₹{inv.grandTotal.toLocaleString("en-IN")}</p>
                      <StatusBadge label={inv.status} variant={inv.status === "paid" ? "success" : "neutral"} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="forms" className="mt-4">
          <Panel title="Form submissions">
            {history.formSubmissions.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No form submissions.</p>
            ) : (
              <ul className="space-y-2">
                {history.formSubmissions.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedForm(f)}
                      className="w-full rounded-lg border border-[var(--attio-border-subtle)] p-3 text-left text-[13px] transition-colors hover:bg-[var(--attio-hover)]"
                    >
                      <p className="font-medium capitalize">{f.formId.replace(/-/g, " ")}</p>
                      <p className="text-[var(--attio-text-tertiary)]">{f.createdAt.slice(0, 16).replace("T", " ")}</p>
                      <p className="mt-1 text-[12px] text-[var(--attio-text-secondary)]">{f.summary}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <Panel title="Appointments">
            {history.appointments.length === 0 ? (
              <p className="text-[13px] text-[var(--attio-text-tertiary)]">No appointments.</p>
            ) : (
              <ul className="space-y-2">
                {history.appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
                    <div>
                      <p className="font-medium">{a.date} · {a.time}</p>
                      <p className="text-[var(--attio-text-tertiary)]">{a.doctorName ?? "Doctor TBD"}</p>
                    </div>
                    <StatusBadge label={a.status} variant="neutral" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {selectedForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedForm(null)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold capitalize">{selectedForm.formId.replace(/-/g, " ")}</h3>
            <p className="mt-1 text-[12px] text-[var(--attio-text-tertiary)]">{selectedForm.createdAt.slice(0, 16).replace("T", " ")}</p>
            <dl className="mt-4 space-y-2">
              {Object.entries(selectedForm.data).map(([key, value]) => (
                <div key={key} className="border-b border-[var(--attio-border-subtle)] pb-2 text-[13px]">
                  <dt className="font-medium capitalize text-[var(--attio-text-secondary)]">{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd className="mt-0.5 break-words text-[var(--attio-text)]">
                    {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
            <AttioButton variant="secondary" className="mt-4" onClick={() => setSelectedForm(null)}>
              Close
            </AttioButton>
          </div>
        </div>
      )}
    </PageChrome>
  );
}
