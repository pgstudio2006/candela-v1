"use client";

import { PageChrome } from "@/components/frontdesk/page-chrome";
import { Panel } from "@/components/frontdesk/ui";

export default function LabSettingsPage() {
  return (
    <PageChrome
      breadcrumbs={[
        { label: "Laboratory", href: "/app/laboratory" },
        { label: "Settings" },
      ]}
      title="Laboratory settings"
      meta="Configure lab defaults and report preferences"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Report defaults">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">
            Lab report header/footer and signature defaults will be configurable here.
          </p>
        </Panel>
        <Panel title="Operations">
          <p className="text-[13px] text-[var(--attio-text-tertiary)]">
            Turnaround time alerts, sample collection reminders and integration settings will be configurable here.
          </p>
        </Panel>
      </div>
    </PageChrome>
  );
}
