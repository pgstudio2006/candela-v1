// @ts-nocheck
import { hash } from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { SEED_DEPARTMENTS, SEED_GEO, SEED_MIS, SEED_STAFF } from "../src/design-system/admin-data";
import {
  DEFAULT_CRM_STAGES,
  SEED_ASSIGNMENT_RULES,
  SEED_CRM_ACTIVITIES,
  SEED_CRM_AGENTS,
  SEED_CRM_FOLLOWUPS,
  SEED_CRM_INTEGRATIONS,
  SEED_CRM_LEADS,
} from "../src/design-system/crm-data";
import { CARE_PACKAGES } from "../src/design-system/doctor-data";
import { BILLING_SCHEMA, CHECKIN_SCHEMA, JUNIOR_EXAM_SCHEMA, REGISTRATION_SCHEMA } from "../src/design-system/frontdesk-schemas";
import { PATIENTS, VISITS } from "../src/design-system/frontdesk-data";
import {
  SEED_HR_ATTENDANCE,
  SEED_HR_DEPARTMENTS,
  SEED_HR_EMPLOYEES,
  SEED_HR_LEAVE,
  SEED_HR_PAYROLL,
  SEED_HR_SHIFTS,
} from "../src/design-system/hr-data";
import { BRANCHES, COUNSELLOR_HANDOFF } from "../src/design-system/mock-data";
import { CONSENT_TEMPLATES } from "../src/design-system/nurse-data";
import {
  SEED_DRUGS,
  SEED_PHARMACY_STAFF,
  SEED_PRESCRIPTIONS,
  SEED_PURCHASE_ORDERS,
  SEED_STOCK,
  SEED_SUPPLIERS,
} from "../src/design-system/pharmacy-data";
import { DEFAULT_DOCUMENT_TEMPLATES } from "../src/design-system/document-templates";

const prisma = new PrismaClient();

const TENANT_ID = "tenant_navayu";
const PIPELINE_ID = "pipeline_navayu_default";

const toDate = (value?: string) => (value ? new Date(value) : null);

async function clearData() {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.misAggregate.deleteMany(),
    prisma.geoPin.deleteMany(),
    prisma.staffAccess.deleteMany(),
    prisma.formSchema.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.payrollLine.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.department.deleteMany(),
    prisma.followUp.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.stage.deleteMany(),
    prisma.pipeline.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.rule.deleteMany(),
    prisma.billingHandoff.deleteMany(),
    prisma.approval.deleteMany(),
    prisma.counsellorSession.deleteMany(),
    prisma.package.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.prescriptionFulfillment.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.drug.deleteMany(),
    prisma.documentTemplate.deleteMany(),
    prisma.consultNote.deleteMany(),
    prisma.prescription.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.nursingTask.deleteMany(),
    prisma.vitals.deleteMany(),
    prisma.queue.deleteMany(),
    prisma.opdVisit.deleteMany(),
    prisma.visit.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.session.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.user.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);
}

async function seedAccessAndUsers() {
  await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      slug: "navayu",
      name: "Navayu Spine & Joint Care",
      legalName: "ASP Global Health & Educare Pvt Ltd",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
    },
  });

  await prisma.branch.createMany({
    data: BRANCHES.map((branch) => ({
      id: branch.id,
      tenantId: TENANT_ID,
      code: branch.code,
      name: branch.name,
      city: branch.id.includes("gurgaon") ? "Gurgaon" : "Pataudi",
      state: "Haryana",
      country: "India",
      active: true,
    })),
  });

  const modules = ["admin", "frontdesk", "nurse", "doctor", "pharmacy", "laboratory", "counsellor", "crm", "hr"] as const;
  const permissionRows = modules.flatMap((module) => [
    {
      id: `perm_${module}_read`,
      module: module.toUpperCase() as Uppercase<typeof module>,
      action: "read",
      description: `${module} read access`,
    },
    {
      id: `perm_${module}_write`,
      module: module.toUpperCase() as Uppercase<typeof module>,
      action: "write",
      description: `${module} write access`,
    },
  ]);

  await prisma.permission.createMany({ data: permissionRows });

  await prisma.role.createMany({
    data: modules.map((module) => ({
      id: `role_${module}`,
      tenantId: TENANT_ID,
      name: `${module.toUpperCase()} Role`,
      key: module,
      module: module.toUpperCase() as Uppercase<typeof module>,
      isSystem: true,
    })),
  });

  await prisma.rolePermission.createMany({
    data: modules.flatMap((module) => [
      { roleId: `role_${module}`, permissionId: `perm_${module}_read` },
      { roleId: `role_${module}`, permissionId: `perm_${module}_write` },
    ]),
  });

  const passwordMap: Record<string, string> = {
    "staff@navayu.in": "demo2026",
    "frontdesk@navayu.in": "demo2026",
    "nurse@navayu.in": "demo2026",
    "doctor@navayu.in": "demo2026",
    "pharmacy@navayu.in": "pharma2026",
    "opd@navayu.in": "opd2026",
    "purchase@navayu.in": "purchase2026",
    "priya@navayu.in": "priya2026",
    "anita@navayu.in": "anita2026",
    "counsellor@navayu.in": "priya2026",
    "crm@navayu.in": "crm2026",
    "rahul@navayu.in": "rahul2026",
    "hr@navayu.in": "hr2026",
    "kavita.hr@navayu.in": "kavita2026",
    "admin@navayu.in": "admin2026",
  };

  const users = [
    { id: "user_staff", name: "Demo Staff", email: "staff@navayu.in", role: "frontdesk", branchId: "branch_gurgaon" },
    { id: "user_frontdesk", name: "Front Desk User", email: "frontdesk@navayu.in", role: "frontdesk", branchId: "branch_gurgaon" },
    { id: "user_nurse", name: "Nurse User", email: "nurse@navayu.in", role: "nurse", branchId: "branch_gurgaon" },
    { id: "user_doctor", name: "Doctor User", email: "doctor@navayu.in", role: "doctor", branchId: "branch_gurgaon" },
    { id: "user_pharmacy", name: "Pharmacy Manager", email: "pharmacy@navayu.in", role: "pharmacy", branchId: "branch_gurgaon" },
    { id: "user_pharmacy_opd", name: "Kavita Nair", email: "opd@navayu.in", role: "pharmacy", branchId: "branch_gurgaon" },
    { id: "user_pharmacy_pur", name: "Rajesh Patel", email: "purchase@navayu.in", role: "pharmacy", branchId: "branch_gurgaon" },
    { id: "user_counsellor", name: "Priya Sharma", email: "priya@navayu.in", role: "counsellor", branchId: "branch_gurgaon" },
    { id: "user_counsellor_2", name: "Anita Desai", email: "anita@navayu.in", role: "counsellor", branchId: "branch_gurgaon" },
    { id: "user_crm", name: "CRM Manager", email: "crm@navayu.in", role: "crm", branchId: "branch_gurgaon" },
    { id: "user_crm_rahul", name: "Rahul Verma", email: "rahul@navayu.in", role: "crm", branchId: "branch_gurgaon" },
    { id: "user_hr", name: "HR Manager", email: "hr@navayu.in", role: "hr", branchId: "branch_gurgaon" },
    { id: "user_hr_exec", name: "Kavita Singh", email: "kavita.hr@navayu.in", role: "hr", branchId: "branch_gurgaon" },
    { id: "user_admin", name: "Admin User", email: "admin@navayu.in", role: "admin", branchId: "branch_gurgaon" },
  ];

  for (const user of users) {
    await prisma.user.create({
      data: {
        id: user.id,
        tenantId: TENANT_ID,
        branchId: user.branchId,
        email: user.email,
        name: user.name,
        passwordHash: await hash(passwordMap[user.email] ?? "demo2026", 10),
        status: "ACTIVE",
        activeRoleId: `role_${user.role}`,
      },
    });
  }

  await prisma.userRole.createMany({
    data: users.map((user) => ({
      userId: user.id,
      roleId: `role_${user.role}`,
      branchId: user.branchId,
    })),
  });

  await prisma.session.create({
    data: {
      userId: "user_staff",
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      sessionToken: "seed-session-navayu",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      status: "ACTIVE",
    },
  });
}

async function seedClinical() {
  await prisma.patient.createMany({
    data: PATIENTS.map((patient) => ({
      id: patient.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      uhid: patient.uhid,
      fullName: patient.name,
      phone: patient.phone,
      email: patient.email ?? null,
      age: patient.age,
      gender: patient.gender,
      departmentId: patient.departmentId,
      departmentLabel: patient.department,
      tags: patient.tags,
      balance: patient.balance,
      lastVisitAt: toDate(patient.lastVisit),
      referrer: patient.referrer ?? null,
    })),
  });

  await prisma.visit.createMany({
    data: VISITS.map((visit) => ({
      id: visit.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      patientId: visit.patientId,
      doctorId: visit.doctorId,
      doctorName: visit.doctorName,
      departmentId: visit.departmentId,
      token: visit.token ?? null,
      stage: visit.stage,
      billingStatus: visit.billing,
      examStatus: visit.exam,
      treatmentPath: visit.treatmentPath ?? null,
      billAmount: visit.billAmount ?? null,
      amountPaid: visit.amountPaid ?? null,
      balanceDue: visit.balanceDue ?? null,
      deferredReason: visit.deferredReason ?? null,
      routingNote: visit.routingNote ?? null,
      packageLabel: visit.counselPackageLabel ?? null,
    })),
  });

  await prisma.queue.createMany({
    data: VISITS.map((visit) => ({
      id: `queue_${visit.id}`,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      visitId: visit.id,
      patientId: visit.patientId,
      token: visit.token ?? null,
      stage: visit.stage,
      waitMin: visit.waitMin,
      billingStatus: visit.billing,
      examStatus: visit.exam,
      doctorName: visit.doctorName,
    })),
  });

  await prisma.opdVisit.createMany({
    data: VISITS.map((visit) => ({
      id: `opd_${visit.id}`,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      patientId: visit.patientId,
      visitId: visit.id,
      doctorId: visit.doctorId,
      doctorName: visit.doctorName,
      stage: visit.stage,
    })),
  });

  await prisma.appointment.createMany({
    data: VISITS.filter((visit) => visit.appointment).map((visit, idx) => ({
      id: `appt_${visit.id}`,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      patientId: visit.patientId,
      doctorId: visit.doctorId,
      doctorName: visit.doctorName,
      departmentId: visit.departmentId,
      appointmentDate: new Date(Date.now() + (idx + 1) * 3600000),
      durationMin: 30,
      status: "scheduled",
      source: "frontdesk",
    })),
  });

  await prisma.vitals.create({
    data: {
      visitId: "v7",
      branchId: "branch_gurgaon",
      bpSystolic: 124,
      bpDiastolic: 82,
      pulse: 78,
      spo2: 98,
      temperature: 98.6,
      weight: 74,
      painScore: 4,
      allergies: "Penicillin",
      redFlags: "None",
      notes: "Seeded from nurse flow",
      recordedAt: new Date(),
      recordedBy: "nurse_1",
    },
  });

  await prisma.nursingTask.create({
    data: {
      id: "nt_1",
      visitId: "v7",
      branchId: "branch_gurgaon",
      patientId: "p1",
      title: "Prepare patient for package session",
      status: "queued",
      priority: "high",
      assignedTo: "nurse_1",
      notes: "Collect required consents before treatment start.",
    },
  });

  await prisma.consent.createMany({
    data: CONSENT_TEMPLATES.map((template) => ({
      id: `consent_${template.id}`,
      visitId: "v7",
      branchId: "branch_gurgaon",
      patientId: "p1",
      templateId: template.id,
      templateVersion: template.version,
      label: template.label,
      status: template.required ? "presented" : "draft",
      required: template.required,
      language: template.language,
      consentData: template as unknown as object,
    })),
  });

  await prisma.consultNote.create({
    data: {
      visitId: "v7",
      branchId: "branch_gurgaon",
      doctorId: "dr_1",
      doctorName: "Dr. Rajesh Mehta",
      status: "completed",
      treatmentMode: "opd",
      recommendCounsellor: true,
      skipCounsellor: false,
      packageId: "pkg_basic",
      doctorAdvice: "Continue with physiotherapy package and review in 2 weeks.",
      examination: { tenderness: true, slr: "positive" },
      diagnosis: { primaryDiagnosis: "Lumbar disc disease with radiculopathy" },
      treatment: { plan: "Conservative MSK protocol" },
      notes: "Consultation seeded from doctor module defaults.",
    },
  });

  await prisma.documentTemplate.createMany({
    data: DEFAULT_DOCUMENT_TEMPLATES.map((template) => ({
      id: template.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      kind: template.kind,
      label: template.label,
      layout: template.layout,
      description: template.description,
      enabled: template.enabled,
      isSystem: template.isSystem,
    })),
  });
}

async function seedPharmacy() {
  await prisma.drug.createMany({
    data: SEED_DRUGS.map((drug) => ({
      id: drug.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      genericName: drug.genericName,
      brandName: drug.brandName,
      strength: drug.strength,
      form: drug.form,
      route: drug.route,
      therapeuticClass: drug.therapeuticClass,
      schedule: drug.schedule,
      hsn: drug.hsn,
      gstPercent: drug.gstPercent,
      unit: drug.unit,
      reorderLevel: drug.reorderLevel,
      requiresRx: drug.requiresRx,
      coldChain: drug.coldChain,
      substitutes: drug.substitutes,
      active: drug.active,
      defaultMrp: drug.defaultMrp,
    })),
  });

  await prisma.supplier.createMany({
    data: SEED_SUPPLIERS.map((supplier) => ({
      id: supplier.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      name: supplier.name,
      gstin: supplier.gstin,
      drugLicense: supplier.drugLicense,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      paymentTerms: supplier.paymentTerms,
      preferred: supplier.preferred,
      active: supplier.active,
    })),
  });

  await prisma.inventory.createMany({
    data: SEED_STOCK.map((stock) => ({
      id: stock.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      drugId: stock.drugId,
      supplierId: stock.supplierId ?? null,
      batchNo: stock.batchNo,
      expiryDate: toDate(stock.expiry),
      qtyOnHand: stock.qtyOnHand,
      reservedQty: stock.reserved,
      purchaseRate: stock.purchaseRate,
      mrp: stock.mrp,
      rack: stock.rack,
      quarantined: stock.quarantined,
    })),
  });

  await prisma.purchaseOrder.createMany({
    data: SEED_PURCHASE_ORDERS.map((order) => ({
      id: order.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      supplierId: order.supplierId,
      status: order.status,
      expectedAt: toDate(order.expectedAt),
      lines: order.lines as unknown as object,
      notes: order.notes ?? null,
    })),
  });

  await prisma.prescription.createMany({
    data: SEED_PRESCRIPTIONS.map((rx, idx) => ({
      id: rx.id,
      visitId: VISITS[idx % VISITS.length].id,
      branchId: "branch_gurgaon",
      patientId: PATIENTS[idx % PATIENTS.length].id,
      doctorName: rx.doctorName,
      source: rx.source,
      priority: rx.priority,
      status: rx.status,
      assigneeId: rx.assigneeId ?? null,
      rejectReason: rx.rejectReason ?? null,
      counselingNotes: rx.counselingNotes ?? null,
      witnessName: rx.witnessName ?? null,
      prescriptionDate: new Date(rx.createdAt),
      verifiedAt: toDate(rx.verifiedAt),
      dispensedAt: toDate(rx.dispensedAt),
      lines: rx.lines as unknown as object,
      meta: { uhid: rx.uhid, patientName: rx.patientName, allergies: rx.allergies ?? [] },
    })),
  });

  await prisma.prescriptionFulfillment.create({
    data: {
      id: "fulfill_1",
      branchId: "branch_gurgaon",
      visitId: "v1",
      prescriptionId: "rx_4",
      status: "dispensed",
      lineItems: [{ drugId: "dr_para", qty: 6, rate: 35 }] as unknown as object,
      subtotal: 210,
      gstTotal: 25.2,
      discount: 0,
      total: 235.2,
      paymentMode: "cash",
      paid: true,
      fulfilledBy: "phm_opd",
      fulfilledAt: new Date(),
    },
  });

  await prisma.stockMovement.createMany({
    data: SEED_STOCK.map((stock) => ({
      id: `move_${stock.id}`,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      drugId: stock.drugId,
      inventoryId: stock.id,
      movementType: "opening_balance",
      qty: stock.qtyOnHand,
      reason: "Seed opening inventory",
      movedAt: new Date(),
    })),
  });
}

async function seedCounsellorAndCrm() {
  await prisma.package.createMany({
    data: CARE_PACKAGES.map((pkg) => ({
      id: pkg.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      label: pkg.label,
      amount: pkg.amount,
      sessions: pkg.sessions,
      dept: pkg.dept,
      active: true,
    })),
  });

  await prisma.counsellorSession.create({
    data: {
      id: "cs_1",
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      visitId: "v7",
      patientId: "p1",
      packageId: "pkg_basic",
      counsellorId: "counsellor_1",
      counsellorName: "Priya Sharma",
      startedAt: new Date(),
      completedAt: new Date(),
      outcome: "converted",
      quote: {
        visitId: "v7",
        patientId: "p1",
        packageId: "pkg_basic",
        packageLabel: "Basic MSK Care — 6 sessions",
        netAmount: 32000,
      } as object,
      internalNotes: "Patient agreed after family discussion.",
      patientObjections: ["Needs family approval"],
      sentToBilling: true,
      billingSentAt: new Date(),
    },
  });

  await prisma.approval.create({
    data: {
      id: "approval_1",
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      visitId: "v7",
      patientId: "p1",
      packageId: "pkg_basic",
      approvalType: "discount",
      requestedPercent: 10,
      reason: "Corporate patient concession",
      status: "approved",
      requestedAt: new Date(),
      resolvedAt: new Date(),
      quoteSnapshot: { netAmount: 32000, discountPercent: 10 } as object,
    },
  });

  await prisma.billingHandoff.create({
    data: {
      id: "billing_handoff_1",
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      visitId: "v7",
      patientId: "p1",
      packageId: "pkg_basic",
      quote: {
        packageLabel: "Basic MSK Care — 6 sessions",
        netAmount: 32000,
      } as object,
      counsellorName: "Priya Sharma",
      counselNotes: COUNSELLOR_HANDOFF.advice,
      doctorName: "Dr. Rajesh Mehta",
      doctorId: "dr_1",
      paymentExpectation: "pay_now",
      treatmentMode: "opd",
      diagnosisSummary: COUNSELLOR_HANDOFF.diagnosis,
      sentAt: new Date(),
    },
  });

  await prisma.agent.createMany({
    data: SEED_CRM_AGENTS.map((agent) => ({
      id: agent.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      name: agent.name,
      email: agent.email,
      role: agent.role,
      active: agent.active,
      specialtyTags: agent.specialtyTags,
      maxOpenLeads: agent.maxOpenLeads,
      unavailableUntil: toDate(agent.unavailableUntil),
      unavailableReason: agent.unavailableReason ?? null,
      backupAgentId: agent.backupAgentId ?? null,
      leadWeightPercent: agent.leadWeightPercent ?? null,
    })),
  });

  await prisma.pipeline.create({
    data: {
      id: PIPELINE_ID,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      label: "Navayu Revenue Pipeline",
      description: "Default CRM pipeline for incoming leads.",
      active: true,
    },
  });

  await prisma.stage.createMany({
    data: DEFAULT_CRM_STAGES.map((stage) => ({
      id: stage.id,
      pipelineId: PIPELINE_ID,
      branchId: "branch_gurgaon",
      label: stage.label,
      color: stage.color,
      order: stage.order,
      slaHours: stage.slaHours ?? null,
    })),
  });

  await prisma.integration.createMany({
    data: SEED_CRM_INTEGRATIONS.map((integration) => ({
      id: integration.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      kind: integration.id,
      label: integration.label,
      description: integration.description,
      icon: integration.icon,
      connected: integration.connected,
      webhookUrl: integration.webhookUrl,
      lastEventAt: toDate(integration.lastEventAt),
      leadsToday: integration.leadsToday,
    })),
  });

  await prisma.lead.createMany({
    data: SEED_CRM_LEADS.map((lead) => ({
      id: lead.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      pipelineId: PIPELINE_ID,
      stageId: lead.stageId,
      assigneeId: lead.assigneeId ?? null,
      patientId: lead.patientId ?? null,
      fullName: lead.fullName,
      phone: lead.phone,
      alternatePhone: lead.alternatePhone ?? null,
      email: lead.email ?? null,
      age: lead.age ?? null,
      gender: lead.gender ?? null,
      city: lead.city ?? null,
      district: lead.district ?? null,
      state: lead.state ?? null,
      country: lead.country ?? null,
      doctorName: lead.doctorName ?? null,
      appointmentDate: toDate(lead.appointmentDate),
      source: lead.source,
      sourceDetail: lead.sourceDetail ?? null,
      integrationId: lead.integrationId ?? null,
      specialty: lead.specialty ?? null,
      valueEstimate: lead.valueEstimate,
      priority: lead.priority,
      tags: lead.tags,
      notes: lead.notes,
      convertedVisitId: lead.convertedVisitId ?? null,
      uhid: lead.uhid ?? null,
      lostReason: lead.lostReason ?? null,
      createdAt: new Date(lead.createdAt),
      updatedAt: new Date(lead.updatedAt),
      lastContactAt: toDate(lead.lastContactAt),
      nextFollowUpAt: toDate(lead.nextFollowUpAt),
    })),
  });

  await prisma.followUp.createMany({
    data: SEED_CRM_FOLLOWUPS.map((followUp) => ({
      id: followUp.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      leadId: followUp.leadId,
      assigneeId: followUp.assigneeId,
      scheduledAt: new Date(followUp.scheduledAt),
      channel: followUp.channel,
      status: followUp.status,
      outcome: followUp.outcome ?? null,
      notes: followUp.notes ?? null,
    })),
  });

  await prisma.activity.createMany({
    data: SEED_CRM_ACTIVITIES.map((activity) => ({
      id: activity.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      leadId: activity.leadId,
      actor: activity.actor,
      type: activity.type,
      summary: activity.summary,
      at: new Date(activity.at),
    })),
  });

  await prisma.rule.createMany({
    data: SEED_ASSIGNMENT_RULES.map((rule) => ({
      id: rule.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      label: rule.label,
      active: rule.active,
      strategy: rule.strategy,
      source: rule.source ?? null,
      specialty: rule.specialty ?? null,
      assignToAgentIds: rule.assignToAgentIds,
      agentWeights: rule.agentWeights ? (rule.agentWeights as object) : Prisma.JsonNull,
    })),
  });
}

async function seedHrAdminBilling() {
  await prisma.department.createMany({
    data: [
      ...SEED_HR_DEPARTMENTS.map((department) => ({
        id: department.id,
        tenantId: TENANT_ID,
        branchId: "branch_gurgaon",
        label: department.name,
        headEmployeeId: department.headId ?? null,
        doctorIds: [],
        defaultPackageIds: [],
        bays: [],
        active: true,
      })),
      ...SEED_DEPARTMENTS.map((department) => ({
        id: `cfg_${department.id}`,
        tenantId: TENANT_ID,
        branchId: "branch_gurgaon",
        label: department.label,
        headEmployeeId: department.headStaffId ?? null,
        doctorIds: department.doctorIds,
        defaultPackageIds: department.defaultPackageIds,
        revenuePolicyId: department.revenuePolicyId ?? null,
        bays: department.bays,
        active: department.active,
        config: department as unknown as object,
      })),
    ],
  });

  await prisma.employee.createMany({
    data: SEED_HR_EMPLOYEES.map((employee) => ({
      id: employee.id,
      tenantId: TENANT_ID,
      branchId: employee.branchId,
      departmentId: employee.departmentId,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      designation: employee.designation,
      managerId: employee.managerId ?? null,
      joinDate: new Date(employee.joinDate),
      employmentType: employee.employmentType,
      active: employee.active,
      role: employee.role,
      crmAgentId: employee.crmAgentId ?? null,
      salaryMonthly: employee.salaryMonthly,
    })),
  });

  await prisma.shift.createMany({
    data: SEED_HR_SHIFTS.map((shift) => ({
      id: shift.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      employeeId: shift.employeeId,
      date: new Date(shift.date),
      startTime: shift.startTime,
      endTime: shift.endTime,
      location: shift.location,
      role: shift.role,
    })),
  });

  await prisma.leaveRequest.createMany({
    data: SEED_HR_LEAVE.map((leave) => ({
      id: leave.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      employeeId: leave.employeeId,
      type: leave.type,
      fromDate: new Date(leave.fromDate),
      toDate: new Date(leave.toDate),
      reason: leave.reason,
      status: leave.status,
      requestedAt: new Date(leave.requestedAt),
      resolvedAt: toDate(leave.resolvedAt),
      approverId: leave.approverId ?? null,
      syncCrmAbsence: leave.syncCrmAbsence ?? false,
    })),
  });

  await prisma.attendance.createMany({
    data: SEED_HR_ATTENDANCE.map((row) => ({
      id: row.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      employeeId: row.employeeId,
      date: new Date(row.date),
      checkIn: row.checkIn ?? null,
      checkOut: row.checkOut ?? null,
      status: row.status,
      notes: row.notes ?? null,
    })),
  });

  await prisma.payrollLine.createMany({
    data: SEED_HR_PAYROLL.map((payroll) => ({
      id: payroll.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      employeeId: payroll.employeeId,
      period: payroll.period,
      basic: payroll.basic,
      allowances: payroll.allowances,
      deductions: payroll.deductions,
      net: payroll.net,
      status: payroll.status,
    })),
  });

  await prisma.auditLog.createMany({
    data: [
      {
        id: "audit_1",
        tenantId: TENANT_ID,
        branchId: "branch_gurgaon",
        actorUserId: "user_admin",
        actor: "Admin User",
        actorRole: "super_admin",
        module: "admin",
        action: "seed_init",
        entityType: "system",
        entityId: "seed",
        summary: "Initialized backend foundation seed.",
        severity: "info",
      },
      {
        id: "audit_2",
        tenantId: TENANT_ID,
        branchId: "branch_gurgaon",
        actorUserId: "user_crm",
        actor: "CRM Manager",
        actorRole: "manager",
        module: "crm",
        action: "lead_routed",
        entityType: "lead",
        entityId: "ld_2",
        summary: "Auto-routed lead from Google Forms to caller queue.",
        severity: "info",
      },
    ],
  });

  await prisma.formSchema.createMany({
    data: [
      { id: REGISTRATION_SCHEMA.id, tenantId: TENANT_ID, branchId: "branch_gurgaon", module: "frontdesk", title: REGISTRATION_SCHEMA.title, schema: REGISTRATION_SCHEMA as unknown as object, version: "v1" },
      { id: BILLING_SCHEMA.id, tenantId: TENANT_ID, branchId: "branch_gurgaon", module: "frontdesk", title: BILLING_SCHEMA.title, schema: BILLING_SCHEMA as unknown as object, version: "v1" },
      { id: CHECKIN_SCHEMA.id, tenantId: TENANT_ID, branchId: "branch_gurgaon", module: "frontdesk", title: CHECKIN_SCHEMA.title, schema: CHECKIN_SCHEMA as unknown as object, version: "v1" },
      { id: JUNIOR_EXAM_SCHEMA.id, tenantId: TENANT_ID, branchId: "branch_gurgaon", module: "frontdesk", title: JUNIOR_EXAM_SCHEMA.title, schema: JUNIOR_EXAM_SCHEMA as unknown as object, version: "v1" },
    ],
  });

  await prisma.staffAccess.createMany({
    data: SEED_STAFF.map((staff, idx) => ({
      tenantId: TENANT_ID,
      branchId: staff.branchId,
      userId: idx === 0 ? "user_admin" : "user_staff",
      departmentId: staff.departmentIds[0] ?? null,
      module: idx === 0 ? "admin" : "frontdesk",
      scope: staff as unknown as object,
      active: true,
    })),
  });

  await prisma.geoPin.createMany({
    data: SEED_GEO.map((geo) => ({
      id: geo.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      pincode: geo.pincode,
      city: geo.city,
      lat: geo.lat,
      lng: geo.lng,
      patientCount: geo.patientCount,
      opdCount: geo.opdCount,
      ipdCount: geo.ipdCount,
      revenue: geo.revenue,
      topDiagnosis: geo.topDiagnosis,
      severity: geo.severity ?? null,
    })),
  });

  await prisma.misAggregate.createMany({
    data: SEED_MIS.map((mis) => ({
      id: mis.id,
      tenantId: TENANT_ID,
      branchId: "branch_gurgaon",
      metric: mis.label,
      category: mis.category,
      bucketDate: toDate(mis.lastRun),
      payload: mis as unknown as object,
    })),
  });

  await prisma.invoice.createMany({
    data: [
      {
        id: "inv_v1",
        tenantId: TENANT_ID,
        branchId: "branch_gurgaon",
        patientId: "p1",
        visitId: "v1",
        invoiceNumber: "NV-INV-1001",
        status: "paid",
        subtotal: 1500,
        discount: 0,
        taxAmount: 180,
        totalAmount: 1680,
        amountPaid: 1680,
        balanceAmount: 0,
        paymentScope: "full",
      },
      {
        id: "inv_v2",
        tenantId: TENANT_ID,
        branchId: "branch_gurgaon",
        patientId: "p2",
        visitId: "v2",
        invoiceNumber: "NV-INV-1002",
        status: "partial",
        subtotal: 1500,
        discount: 100,
        taxAmount: 168,
        totalAmount: 1568,
        amountPaid: 800,
        balanceAmount: 768,
        paymentScope: "partial",
      },
    ],
  });

  await prisma.invoiceLine.createMany({
    data: [
      { id: "invl_1", invoiceId: "inv_v1", label: "Spine OPD Consult", category: "consult", quantity: 1, unitPrice: 1500, discount: 0, taxPercent: 12, lineTotal: 1680 },
      { id: "invl_2", invoiceId: "inv_v2", label: "Spine OPD Consult", category: "consult", quantity: 1, unitPrice: 1500, discount: 100, taxPercent: 12, lineTotal: 1568 },
    ],
  });

  await prisma.payment.createMany({
    data: [
      { id: "pay_v1", tenantId: TENANT_ID, branchId: "branch_gurgaon", invoiceId: "inv_v1", amount: 1680, mode: "upi", status: "captured", paidAt: new Date(), collectedBy: "frontdesk_1" },
      { id: "pay_v2", tenantId: TENANT_ID, branchId: "branch_gurgaon", invoiceId: "inv_v2", amount: 800, mode: "cash", status: "captured", paidAt: new Date(), collectedBy: "frontdesk_1" },
    ],
  });
}

async function main() {
  await clearData();
  await seedAccessAndUsers();
  await seedClinical();
  await seedPharmacy();
  await seedCounsellorAndCrm();
  await seedHrAdminBilling();
  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log("Candela seed completed for Navayu demo tenant.");
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
