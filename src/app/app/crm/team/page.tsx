"use client";

import { CrmAgentFormModal } from "@/components/crm/agent-form";
import { CrmAbsenceModal, CrmRuleFormModal } from "@/components/crm/rule-form";
import { useCrmStore } from "@/components/crm/crm-store";
import { PageChrome } from "@/components/frontdesk/page-chrome";
import { AttioButton, DataTable, Panel, StatusBadge } from "@/components/frontdesk/ui";
import type { CrmAgent, CrmAssignmentRule } from "@/design-system/crm-data";
import { isAgentAvailable } from "@/lib/crm-platform";
import { Copy, Eye, Pencil, Plus, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function CrmTeamPage() {
  const {
    agents,
    rules,
    updateRule,
    addRule,
    getAgentKpis,
    addAgent,
    updateAgent,
    removeAgent,
    getAgentPassword,
    setAgentPassword,
    isManager,
    getLeadDistribution,
    markAgentUnavailable,
    clearAgentUnavailable,
    transferOpenLeads,
  } = useCrmStore();
  const [formOpen, setFormOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [absenceAgent, setAbsenceAgent] = useState<CrmAgent | undefined>();
  const [editing, setEditing] = useState<CrmAgent | undefined>();
  const [editingRule, setEditingRule] = useState<CrmAssignmentRule | undefined>();
  const [credentialToast, setCredentialToast] = useState<string | null>(null);
  const kpis = getAgentKpis();
  const distribution = getLeadDistribution();

  if (!isManager()) {
    return (
      <PageChrome breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Team" }]} title="Team" meta="Manager only">
        <p className="text-[13px] text-[var(--attio-text-secondary)]">Team management is available in the manager workspace.</p>
      </PageChrome>
    );
  }

  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Team & routing" }]}
      title="Team & lead routing"
      meta="Percentage distribution · absence transfer · per-person logins"
      actions={
        <AttioButton
          variant="primary"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus className="size-3.5" />
          Add person
        </AttioButton>
      }
    >
      {credentialToast && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
          {credentialToast}
        </div>
      )}

      {distribution.length > 0 && (
        <Panel title="Lead distribution (target vs actual)" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {distribution.map((d) => (
              <div key={d.agentId} className="rounded-lg border border-[var(--attio-border-subtle)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{d.agentName}</p>
                  <StatusBadge label={d.available ? "Available" : "Away"} variant={d.available ? "success" : "warning"} />
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--attio-border-subtle)]">
                  <div className="bg-emerald-500" style={{ width: `${d.targetPercent}%` }} title="Target" />
                </div>
                <p className="mt-2 text-[11px] text-[var(--attio-text-tertiary)]">
                  Target {d.targetPercent}% · Actual {d.actualPercent}% · {d.openLeads} open leads
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[var(--attio-text-tertiary)]">
            New leads auto-route to whoever is below their percentage target. Absent agents are skipped.
          </p>
        </Panel>
      )}

      <Panel title="Team members">
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "login", label: "Login email" },
            { key: "role", label: "Role" },
            { key: "weight", label: "Weight" },
            { key: "open", label: "Open leads" },
            { key: "status", label: "Status" },
            { key: "actions", label: "", className: "w-28" },
          ]}
          rows={agents
            .filter((a) => a.role !== "manager")
            .map((a) => {
              const k = kpis.find((x) => x.agentId === a.id);
              const pwd = getAgentPassword(a.id);
              const away = !isAgentAvailable(a);
              return {
                name: (
                  <Link href={`/app/crm/staff/${a.id}`} className="text-[13px] font-medium hover:underline">
                    {a.name}
                  </Link>
                ),
                login: (
                  <div className="space-y-0.5">
                    <p className="font-mono text-[12px]">{a.email}</p>
                    {pwd && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[10px] text-[var(--attio-text-tertiary)] hover:text-[var(--attio-accent)]"
                        onClick={() => navigator.clipboard.writeText(`${a.email} / ${pwd}`)}
                      >
                        <Copy className="size-3" />
                        Copy login
                      </button>
                    )}
                  </div>
                ),
                role: <StatusBadge label={a.role} variant="info" />,
                weight: `${a.leadWeightPercent ?? "—"}%`,
                open: k?.openLeads ?? 0,
                status: away ? (
                  <StatusBadge label={a.unavailableReason ?? "Away"} variant="warning" />
                ) : (
                  <StatusBadge label={a.active ? "Active" : "Inactive"} variant={a.active ? "success" : "neutral"} />
                ),
                actions: (
                  <div className="flex flex-wrap gap-1">
                    {away ? (
                      <AttioButton variant="secondary" className="!h-7 !text-[10px]" onClick={() => clearAgentUnavailable(a.id)}>
                        Back
                      </AttioButton>
                    ) : (
                      <button type="button" className="rounded p-1 hover:bg-amber-50" title="Mark absent" onClick={() => setAbsenceAgent(a)}>
                        <UserX className="size-3.5 text-amber-700" />
                      </button>
                    )}
                    <AttioButton variant="secondary" className="!h-7 !text-[10px]" onClick={() => transferOpenLeads(a.id)}>
                      Transfer
                    </AttioButton>
                    <Link href={`/app/crm/staff/${a.id}`} className="rounded p-1 hover:bg-[var(--attio-hover)]">
                      <Eye className="size-3.5 text-[var(--attio-text-secondary)]" />
                    </Link>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-[var(--attio-hover)]"
                      onClick={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (confirm(`Remove ${a.name} from team?`)) removeAgent(a.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ),
              };
            })}
        />
      </Panel>

      <Panel
        title="Assignment rules"
        className="mt-4"
        action={
          <AttioButton
            variant="secondary"
            className="!h-7 !text-[11px]"
            onClick={() => {
              setEditingRule(undefined);
              setRuleOpen(true);
            }}
          >
            <Plus className="size-3" />
            Add rule
          </AttioButton>
        }
      >
        <ul className="space-y-3">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--attio-border-subtle)] p-3 text-[13px]">
              <div>
                <p className="font-medium">{r.label}</p>
                <p className="text-[11px] capitalize text-[var(--attio-text-tertiary)]">
                  {r.strategy.replace(/_/g, " ")}
                  {r.source ? ` · ${r.source}` : ""}
                  {r.specialty ? ` · ${r.specialty}` : ""}
                  {r.agentWeights
                    ? ` · ${Object.entries(r.agentWeights)
                        .map(([id, pct]) => `${agents.find((a) => a.id === id)?.name.split(" ")[0] ?? id} ${pct}%`)
                        .join(" · ")}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-[12px] text-[var(--attio-text-tertiary)] hover:underline"
                  onClick={() => {
                    setEditingRule(r);
                    setRuleOpen(true);
                  }}
                >
                  Edit
                </button>
                <button type="button" onClick={() => updateRule(r.id, { active: !r.active })} className="text-[12px] font-medium text-[var(--attio-accent)]">
                  {r.active ? "Disable" : "Enable"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <CrmAgentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        agents={agents.filter((a) => a.role !== "manager")}
        onSave={async (data, password) => {
          if (editing) {
            await updateAgent(editing.id, data);
            if (password) await setAgentPassword(editing.id, password);
            setCredentialToast(password ? `Password updated for ${data.name}.` : `Saved ${data.name}.`);
          } else {
            const pwd = await addAgent(data, password);
            setCredentialToast(`Added ${data.name}. Share login: ${data.email} / ${pwd}`);
          }
          setTimeout(() => setCredentialToast(null), 8000);
        }}
      />
      <CrmRuleFormModal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        initial={editingRule}
        agents={agents}
        onSave={(rule) => {
          void (editingRule ? updateRule(editingRule.id, rule) : addRule(rule));
        }}
      />
      {absenceAgent && (
        <CrmAbsenceModal
          open={Boolean(absenceAgent)}
          onClose={() => setAbsenceAgent(undefined)}
          agent={absenceAgent}
          agents={agents}
          onConfirm={(until, reason, transfer) => {
            void markAgentUnavailable(absenceAgent.id, until, reason, transfer).then(() => {
              setAbsenceAgent(undefined);
              setCredentialToast(`${absenceAgent.name} marked unavailable${transfer ? " — leads transferred" : ""}.`);
              setTimeout(() => setCredentialToast(null), 6000);
            });
          }}
        />
      )}
    </PageChrome>
  );
}
