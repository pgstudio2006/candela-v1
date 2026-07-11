<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Candela by Adrine — Agent Onboarding & Current State

**Product:** Navayu Healthcare Operating System (HOS). A full-stack web app for multi-branch hospitals that unifies frontdesk, nurses, doctors, pharmacy, counsellors, CRM, HR, admin, and inpatient (IPD) workflows in a single dark, utilitarian UI shell.

**Important context for any agent touching this code:**

- This is a real codebase, not a mock prototype. Data flows through Prisma + a PostgreSQL/SQLite-compatible database and is surfaced via Next.js Server Actions.
- There is a separate legacy/in-memory "design-system" data layer (`src/design-system/*-data.ts`) that originally powered UI mocks; new features should use real Prisma-backed server logic.
- The app is multi-tenant (`tenant`/`branch`) and role-based; almost every server function receives a `ServerContext` and must scope queries to `branchId`/`tenantId`.

---

## 1. Tech stack & runtime

| Layer | Tech |
|-------|------|
| Framework | Next.js App Router (canary-like 16.x). Server Actions are primary for mutations. |
| Language | TypeScript 5.x. Strict mode expected. |
| Styling | Tailwind CSS v4 + `tw-animate-css`. Unified dark palette in `design/CANDELA_DESIGN.md`; no per-module accent colors. |
| UI components | `shadcn/ui` + `@base-ui/react` + custom `src/components/ui`, `src/components/candela`. |
| Database | Prisma ORM (`@prisma/client`). Main schema: `prisma/schema.prisma`. Local dev may use SQLite via `DATABASE_URL`. |
| Auth | Auth.js v5 (`next-auth` beta). Credentials provider in `src/auth.ts` / `src/lib/auth/config.ts`. bcrypt password validation. Session stored in JWT + `Session` table. |
| Tenancy | Every server action resolves `ServerContext` from session (`src/server/context.ts`). Use `branchScope(ctx)` from `src/server/tenancy.ts` in queries. |
| Forms | Custom `SchemaForm` (`src/components/candela/schema-form.tsx`) drives dynamic doctor/consent/registration forms. It was recently fixed so typing no longer resets values. |
| Payments / Billing | Custom GST invoice computation (`src/lib/gst-invoicing.ts`) + `Invoice`/`InvoiceLine`/`Payment` Prisma models. |
| Audit | `src/server/platform-audit.ts` writes to `PlatformAudit`. |
| Notifications | `src/server/notifications.ts`, WhatsApp helpers in `src/server/whatsapp/`. |

**Prisma clients:** both `src/lib/prisma.ts` (`export const prisma`) and `src/lib/db.ts` (`export const db`) exist and are equivalent singletons. Code currently imports either; prefer `@/lib/prisma` for consistency.

---

## 2. Repository layout

```
candela/
├── design/
│   └── CANDELA_DESIGN.md          # Visual constitution — color, typography, shell
├── prisma/
│   ├── schema.prisma               # Single source of truth DB schema
│   ├── seed.ts                     # Navayu demo seed (tenant, branches, roles, users, sample data)
│   └── migrations/                 # Prisma migrations
├── src/
│   ├── app/
│   │   ├── actions/                # Server-action thin wrappers (clinical-actions, ipd-actions, nurse-actions, etc.)
│   │   ├── api/                    # REST/compat endpoints (session compat, etc.)
│   │   ├── app/                    # Authenticated module pages
│   │   │   ├── admin/
│   │   │   ├── frontdesk/
│   │   │   ├── doctor/
│   │   │   ├── nurse/
│   │   │   ├── pharmacy/
│   │   │   ├── counsellor/
│   │   │   ├── crm/
│   │   │   └── hr/
│   │   ├── auth/                   # Login, tenant select, branch select (Auth.js pages)
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── candela/                # Reusable app primitives (SchemaForm, briefing, queue-split, etc.)
│   │   ├── ui/                     # shadcn/ui base components
│   │   └── {admin,frontdesk,doctor,nurse,pharmacy,counsellor,crm,hr}/  # module-specific screens
│   ├── design-system/              # Legacy mock-data + canonical TypeScript types for domain models
│   ├── hooks/                      # React hooks
│   ├── lib/                        # Utility libs (prisma, auth, gst, billing helpers, validation, etc.)
│   ├── server/                     # Business logic — the heart of the app
│   │   ├── clinical/               # Visits, patient workflow, billing, OPD routing
│   │   ├── ipd/                    # IPD admissions, ward/bed, cart, final billing, round logs
│   │   ├── nurse/                  # Nurse episodes, vitals, consent, tasks
│   │   ├── doctor/                 # Consultation completion, IPD round save, prescriptions
│   │   ├── pharmacy/               # Inventory, prescriptions, fulfillment
│   │   ├── counsellor/             # Packages, sessions, approvals
│   │   ├── admin/, crm/, hr/       # Domain modules
│   │   ├── context.ts              # ServerContext resolver
│   │   ├── tenancy.ts              # branchScope helpers
│   │   ├── invoicing.ts            # createVisitInvoice, getVisitInvoiceForBilling, getVisitReceipt
│   │   └── platform-audit.ts       # Audit writer
│   └── types/                      # Shared TypeScript types
├── package.json
├── README.md
├── BACKEND.md
└── AGENTS.md (this file)
```

---

## 3. Core data model snapshot

**Patient flow models**

- `Patient` — master patient record (name, fullName, uhid, phone, demographics, meta JSON).
- `OpdVisit` — the operational visit record. Has `stage`, `billing`, `billAmount`, `amountPaid`, `balanceDue`, `treatmentPath` (`opd`|`ipd`|`daycare`), `ipdAdmissionId`.
- `Visit` — sync mirror of `OpdVisit` used for cross-module snapshots and `Invoice.visitId` foreign key. Created/updated by `src/server/visit-sync.ts`.

**IPD models**

- `IpdWard`, `IpdBed` — relational ward/bed master data.
- `IpdAdmission` — one per IPD stay; `visitId` is unique; linked to ward/bed/patient.
- `IpdRoundConfig` — admin-configured round templates (vitals fields, note prompts).
- `IpdRoundLog` — unified doctor + nurse round entries per admission (`kind`, `actorRole`, `content`, `payload`).

**Nursing models**

- `NursingHandoff` — single handoff per `visitId`; carries billing/consult payload from doctor/counsellor to nurse.
- `NursingEpisode` — per-visit episode a nurse claims; holds vitals, consents, sessions, tasks, discharge summary.

**Billing models**

- `Invoice` — per-transaction invoice. As of the current sprint, `visitId` is **no longer unique**; a visit can have multiple invoices (one per payment event).
- `InvoiceLine` — line items of an invoice.
- `Payment` — captured payment split tied to an `Invoice`.
- `BillingHandoff` — counsellor-generated quote/advance handoff.

**Users / RBAC**

- `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Session`, `AdminStaff` (staff roster with `role`, `ward`, `onDuty`).

---

## 4. Module routes & responsibilities

| Module | Base route | What lives here |
|--------|-----------|-----------------|
| Admin | `/app/admin` | Dashboard, master data, ward/bed CRUD (`/app/admin/ipd`), IPD round config (`/app/admin/ipd-rounds`), finance, MIS, staff, roles, geo pins |
| Front Desk | `/app/frontdesk` | Patient registration, appointments, OPD billing, queue, closure, junior intake/MSK, IPD bed map (`/app/frontdesk/ipd`) |
| Nurse | `/app/nurse` | Queue, episode workspace, vitals, consent capture, treatment sessions |
| Doctor | `/app/doctor` | Queue, consultation workspace (`consultation-workspace.tsx`), IPD round view (`/app/doctor/ipd`) |
| Pharmacy | `/app/pharmacy` | Dispensary, inventory, prescriptions, POs |
| Counsellor | `/app/counsellor` | Package quotes, approvals, billing handoff, conversion to IPD |
| CRM | `/app/crm` | Leads, follow-ups, referrals |
| HR | `/app/hr` | Staff, shifts, leave, attendance, payroll |

Shell rule: top bar has 8 module links only; sub-navigation happens **inside** pages (query params like `?view=`), not as a second global tab row.

---

## 5. Key business flows

### 5.1 OPD flow

1. Frontdesk registers a `Patient` and creates an `OpdVisit` (stage `registered`/`billing`).
2. Junior exam / MSK data is captured in `OpdVisit.juniorExam`.
3. Doctor completes consult in `src/server/doctor/index.ts` → `completeConsultation`. It saves `ConsultNote`, `Prescription`, may route to counselling, pharmacy, or discharge.
4. Billing in `src/server/clinical/index.ts` → `processBilling`. Computes GST, updates `OpdVisit.billAmount/amountPaid/balanceDue`, creates a new `Invoice` + `Payment` records.
5. Route helper `src/lib/billing-routing.ts` decides next stage based on payment scope (`full`/`partial`/`defer`).

### 5.2 Counsellor → IPD conversion

1. Counsellor builds a package quote; on approval `processCounselBilling` in `src/server/clinical/index.ts` creates/updates `BillingHandoff`, `NursingHandoff`, optionally creates an `IpdAdmission`, and creates an `Invoice`.
2. If `convertToIpd` is true, an `IpdAdmission` row is upserted by `visitId` and the `OpdVisit` stage is set to `ipd_admitted`.

### 5.3 Direct IPD admission (frontdesk)

1. `/app/frontdesk/ipd` bed map → `admitPatient` in `src/server/ipd/index.ts`.
2. Creates `OpdVisit` with `treatmentPath="ipd"`, `ipdAdmissionId`, stage `ipd_admitted`.
3. Creates `IpdAdmission` linked to `IpdWard`/`IpdBed`.
4. Upserts `NursingHandoff` with `treatmentPath="ipd"`, ward/bed.
5. If an `AdminStaff` with `role="nurse"`, `onDuty=true`, and matching `ward` exists, creates `NursingEpisode` for auto-assignment.
6. `syncVisitFromOpdVisit` mirrors the visit into the `Visit` table.

### 5.4 Doctor → IPD (from consultation)

1. When `completeConsultation` is called with `treatmentMode="ipd"`, it ensures ward/bed via `ensureIpdWardBed` and upserts `IpdAdmission` by `visitId`.
2. It **always** upserts `NursingHandoff` (recent fix) so the patient appears in the nurse queue even if no specific nurse is on duty.
3. If an assigned nurse exists, it also creates `NursingEpisode`.

### 5.5 Nurse workflow

1. Nurse queue loads `getNurseSnapshot` (`src/server/nurse/index.ts`) from `NursingHandoff` + `NursingEpisode`.
2. Nurse claims an episode via `claimEpisode`.
3. Vitals/consent/sessions/tasks are saved inside `saveVitals`, `signConsent`, `startSession`, `completeSession`, etc. These also write to `IpdRoundLog` when the patient is IPD (`writeIpdRoundLog`).
4. IPD nursing notes can be logged via `saveNurseIpdNote` and are visible in the doctor IPD round history.

### 5.6 IPD billing (postpaid / cart-based)

1. IPD services/packages are added to `IpdAdmission.cart` (JSON array of `IpdCartItem`) through `src/components/frontdesk/ipd-service-cart-panel.tsx`.
2. Cart can be billed in two ways:
   - **Frontdesk billing page**: `/app/frontdesk/billing?visit=<id>` loads the cart into `OpdBillingForm`. Submit calls `processBilling`, which clears the cart and creates a new invoice.
   - **Generate final bill**: `generateIpdFinalBill` in `src/server/ipd/index.ts` invoices the entire remaining cart.
3. **Critical recent change:** `Invoice.visitId` is no longer `@unique`. Each billing event creates a **new** invoice record (`createVisitInvoice`) rather than overwriting the previous one. `OpdVisit.billAmount/amountPaid/balanceDue` accumulate across invoices.
4. The billing form no longer preloads previous invoice line items when a partial invoice exists; it only keeps the previous payment splits for reference and lets the user add **new** services for the next payment. This prevents previous services from being re-billed on second payment.

---

## 6. Current state & recent work

Last sprint focus: **Nurse ↔ IPD integration + IPD billing integrity + doctor form UX.**

### Completed

- **Doctor form reset bug fixed** (`src/components/candela/schema-form.tsx`): removed `initialValues` from `resetKey`, added an effect to update values only when the form is untouched so typing is no longer lost.
- **Nurse module connected to IPD**:
  - Direct IPD admissions now create a `NursingHandoff` and optionally a `NursingEpisode`.
  - Doctor IPD handoff creation is now unconditional (patient always appears in nurse queue).
  - Nurse vitals and IPD nursing notes are written to `IpdRoundLog` and shown in doctor IPD rounds.
- **IPD round configuration admin page** created at `/app/app/admin/ipd-rounds/page.tsx`; exposed via `src/app/actions/ipd-actions.ts`.
- **IPD billing duplicate-service bug fixed**:
  - Schema: removed `@unique` from `Invoice.visitId`.
  - `src/server/invoicing.ts`: `upsertVisitInvoice` replaced with `createVisitInvoice`, generating a new invoice record per billing event with a unique timestamped `invoiceNumber`.
  - `src/server/clinical/index.ts` `processBilling` and `src/server/ipd/index.ts` `generateIpdFinalBill` updated to accumulate visit totals but create per-transaction invoices.
  - `src/components/frontdesk/opd-billing-form.tsx` no longer loads previous `packageLines` for second payments; it loads IPD cart items for new billing and keeps previous payments for reference only.
- **Receipt generation** (`getVisitReceipt`) now reads the latest invoice for the visit.

### Still open / known next items

- Agent should run `npx prisma db push` (or create a migration) and `npm run build` to validate the schema/TypeScript changes.
- Receipt modal currently shows the **latest** invoice; if users need a consolidated cumulative receipt, add a separate endpoint that sums all invoices for a visit.
- Doctor IPD round history UI was updated to show unified logs; further polish may be needed.
- The emergency module (`src/server/emergency/`, `/app/frontdesk/emergency`) is scaffolded and may need additional wiring.

---

## 7. Developer commands

Run everything from repo root (`candela/`):

```bash
# Install deps
npm install

# Regenerate Prisma client after schema changes
npx prisma generate
# or
npm run db:generate

# Push schema changes to the database
npx prisma db push
# or
npm run db:push

# Create/run migrations
npm run db:migrate

# Seed demo data (tenant, branches, roles, users, sample patients)
npm run db:seed

# Start dev server
npm run dev

# Production build (includes a CSV import step)
npm run build

# Lint
npm run lint
```

**Typical post-change validation:**

```bash
npx prisma generate
npm run build
```

If build fails because of DB schema mismatch, run `npx prisma db push` first (requires a valid `DATABASE_URL` in `.env`).

---

## 8. Agent guidelines & common gotchas

1. **Always scope Prisma queries.** Use `branchScope(ctx)` or `branchClinicalWhere(ctx)` from `src/server/tenancy.ts`. Never query across branches.
2. **Use server actions, not API routes.** Mutations live in `src/server/<module>/index.ts` and are exposed through `src/app/actions/*-actions.ts`. UI components import from `@/app/actions/*-actions`.
3. **Respect the `Visit` sync.** After changing `OpdVisit`, call `syncVisitFromOpdVisit(ctx, opdVisit)` so the mirror `Visit` row and snapshots stay consistent.
4. **One invoice per transaction.** Do not reintroduce `Invoice.visitId @unique`. If you need the historical total, sum across invoices; if you need a single consolidated receipt, build it explicitly.
5. **IPD round logs are append-only.** Doctor rounds and nurse notes both write `IpdRoundLog`; ensure `actorRole` is accurate (`doctor`, `nurse`, etc.).
6. **Do not add per-module colors.** Refer to `design/CANDELA_DESIGN.md`; the palette is intentionally clinical/dark with a single vermillion accent.
7. **Form state discipline.** When editing `SchemaForm`, do not put `initialValues` into the reset key. Use the existing untouched-guard pattern if you need to sync external value changes.
8. **Check both `prisma` and `db` imports.** Some files import `prisma` from `@/lib/prisma`, some import `db` from `@/lib/db`. They point to the same singleton, but keep imports consistent within a file.
9. **Error handling.** Use `ServerActionError` from `src/server/errors.ts` for expected domain errors. Map Prisma errors through `withPrismaError` / `throwIfPrismaError` where appropriate.
10. **Before finishing any task:** run `npx prisma generate` and `npm run build` and fix TypeScript errors. Do not leave the codebase in a non-compiling state.

---

*Last updated: 2026-07-11 — IPD/Nurse integration + multi-invoice billing fix.*
