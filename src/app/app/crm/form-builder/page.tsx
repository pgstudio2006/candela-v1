"use client";

import { AdminFormBuilder } from "@/components/admin/form-builder";
import { PageChrome } from "@/components/frontdesk/page-chrome";

export default function CrmLeadFormBuilderPage() {
  return (
    <PageChrome
      breadcrumbs={[{ label: "CRM", href: "/app/crm" }, { label: "Lead form builder" }]}
      title="CRM lead form builder"
      meta="Customize the lead capture form used in the CRM pipeline and inbox"
    >
      <AdminFormBuilder initialDepartment="crm" initialSchemaId="crm-lead-capture" hideDepartmentFilter />
    </PageChrome>
  );
}
