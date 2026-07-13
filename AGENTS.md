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

## 6.1 Current sprint — 2026-07-12 (in progress)

A new batch of 11 user-reported issues is being worked on. This section tracks the state of that work so the next agent can pick up exactly where the previous one left off.

### 11 open tasks

1. **Pharmacy — Add drug not saving** ✅
   - Fixed by relaxing the guard: any active pharmacy staff can now add/update drugs (`assertPharmacyStaff`).
   - Changed files: `src/server/pharmacy/guards.ts`, `src/server/pharmacy/index.ts`.

2. **Pharmacy — Medicine dispense / "Dispense & create bill"** ✅
   - The modal now tracks the live prescription status from the store so the dispense button is enabled after verification. The free-text "Add medicine" input was replaced with a formulary dropdown so added lines map to real drugs/batches.
   - Changed files: `src/components/pharmacy/rx-workspace.tsx`.

3. **Frontdesk patient profile — IPD records** ✅
   - Added an IPD tab showing the patient’s admission history using the existing `getIpdAdmissionsByPatientAction`.
   - Changed files: `src/app/app/frontdesk/patients/[id]/page.tsx`.

4. **Frontdesk IPD — discharge summary patient-specific** ✅
   - `saveDischargeSummary` now writes the summary to the corresponding `IpdAdmission` row by `visitId`, so the frontdesk discharge summary is tied to the correct admission.
   - Changed files: `src/server/nurse/index.ts`.

5. **Frontdesk IPD admit — remove patient type field** ✅
   - Removed the dropdown from the modal and made `patientType` optional on `IpdAdmissionInput`, defaulting to `"general"` on the server.
   - Changed files: `src/app/app/frontdesk/ipd/page.tsx`, `src/design-system/ipd-data.ts`, `src/server/ipd/index.ts`.

6. **Frontdesk billing — IPD partial payment calculation** ✅
   - Removed the erroneous subtraction of `previousPaid` from the full-payment amount so full payments actually clear the total due. Balance payments now default to the current subtotal, allowing partial payments to pay only new charges.
   - Changed files: `src/components/frontdesk/opd-billing-form.tsx`.

7. **Nurse execution queue — discharged patients** ✅
   - When `updateIpdAdmission` marks a patient as `discharged`, the linked `NursingEpisode` is set to `completed` and the `OpdVisit` stage is set to `completed`, removing the patient from the nurse queue.
   - Changed files: `src/server/ipd/index.ts`.

8. **Nurse sidebar — remove Treatment Bays** ✅
   - Removed the "Treatment bays" section and its `DEPARTMENTS` import.
   - Changed files: `src/components/nurse/sidebar.tsx`.

9. **Nurse handoff — billing closure sync** ✅
   - `NursingHandoffView` now uses live `Visit` totals (`billAmount`, `amountPaid`, `balanceDue`) when available, so the full care handoff reflects real payment state.
   - Changed files: `src/components/nurse/nursing-handoff-view.tsx`.

10. **Nurse session execution — remove bay/procedure & save button** ✅
    - Removed the "Treatment bay" select and the "Procedure" display from the treatment panel. Made the bay parameter optional on the server and added a "Save session notes" button.
    - Changed files: `src/components/nurse/execution-workspace.tsx`, `src/components/nurse/nurse-store.tsx`, `src/lib/nurse-validation.ts`, `src/server/nurse/index.ts`.

11. **Validation & commit** ✅
    - `npx tsc --noEmit --project tsconfig.json` passed with 0 errors.
    - `npm run build` reaches the production CSV import step, which fails because the local PostgreSQL server at `localhost:5432` is not running. This is an environment issue, not a code/TypeScript issue. All code changes have been committed.

### Key files already changed in the previous session (2026-07-11)

- `src/app/api/crm/appointments/route.ts` — CRM appointments now generate real IDs.
- `src/server/crm/online-counsellor.ts` — lead conversion uses shared `bookAppointment`.
- `src/app/app/crm/leads/[id]/page.tsx` — doctor dropdown for CRM appointment booking.
- `src/server/whatsapp/service.ts` — new pharmacy WhatsApp templates.
- `src/app/api/pharmacy/whatsapp/route.ts` — new WhatsApp endpoint for bills and POs.
- `src/app/app/pharmacy/billing/page.tsx` and `purchase-orders/page.tsx` — WhatsApp buttons wired.
- `src/app/api/crm/patient/[id]/route.ts` and `src/app/app/crm/patients/[id]/page.tsx` — pharmacy data surfaced in CRM patient profile.
- `src/server/crm/visit-bridge.ts`, `src/server/nurse/index.ts`, `src/server/counsellor/index.ts` — lead status sync on visit complete.
- `src/app/api/crm/offline-lead/route.ts` and `src/app/app/frontdesk/leads/page.tsx` — offline lead creation.

## 6.2 Pharmacy-connected prescriptions & IPD pharmacy billing — completed 2026-07-12

A follow-up sprint integrated the doctor module with pharmacy inventory and made IPD pharmacy charges bill separately from IPD services.

### Completed

- **Doctor drug search now pharmacy-aware**
  - New `DoctorDrugSearch` component (`src/components/doctor/doctor-drug-search.tsx`) lets doctors search formulary drugs by brand/generic name with live stock, or add a manual medicine when the drug is not in stock.
  - New server action `getPharmacyDrugsForDoctorAction` (`src/app/actions/pharmacy-actions.ts`) returns branch drugs with current stock and pricing.
  - `PrescriptionLine` type extended with optional `drugId`, `genericName`, and `isManual` (`src/design-system/doctor-data.ts`).
  - `PrescriptionEditor` (`src/components/doctor/prescription-editor.tsx`) replaced free-text drug input with `DoctorDrugSearch`.

- **IPD rounds push structured medication orders to pharmacy**
  - `IpdRoundWorkspace` (`src/components/doctor/ipd-round-workspace.tsx`) now collects structured medication lines via `DoctorDrugSearch`.
  - `saveIpdRound` (store, API route, server action, and server function) accepts an optional `medicationLines` array and pushes a source=`ipd` prescription to pharmacy.
  - `src/server/doctor/index.ts` `saveIpdRound` falls back to parsing legacy medicine text if no structured lines are provided.

- **IPD pharmacy charges get their own invoice**
  - `src/server/ipd/index.ts` gained `getIpdPharmacyCharges`, which reads dispensed/partially-dispensed IPD prescriptions from the pharmacy workspace and computes taxable amounts and profit.
  - `processBilling` in `src/server/clinical/index.ts` now:
    - Calculates IPD pharmacy GST separately from service GST.
    - Combines service and pharmacy net amounts for visit totals.
    - Splits the collected payment proportionally between services and pharmacy.
    - Creates a separate "IPD pharmacy supplies" invoice with `category=pharmacy`.
  - `createVisitInvoice` (`src/server/invoicing.ts`) and `computeGstInvoice` (`src/lib/gst-invoicing.ts`) now support per-line `category` and `gstRatePercent`.

- **Patient profile surfaces pharmacy invoices**
  - `getPatientInvoices` returns a `hasPharmacy` flag.
  - Patient profile billing tab shows a "Pharmacy" badge on invoices that contain pharmacy lines.

- **Pharmacy profit KPI**
  - `computePharmacyKpis` (`src/lib/pharmacy-platform.ts`) now includes a "Today's Profit" metric calculated as `qty × (rate − purchaseRate)` for paid pharmacy bills.

### Validation & commit

- `npx tsc --noEmit` passed with 0 errors.
- Changes committed as `5f4629f` and pushed to `origin/master`.

### Changed files (this sprint)

- `src/app/actions/pharmacy-actions.ts` (new)
- `src/app/actions/doctor-actions.ts`
- `src/app/api/doctor/mutate/route.ts`
- `src/app/app/doctor/ipd/page.tsx`
- `src/app/app/frontdesk/patients/[id]/page.tsx`
- `src/components/doctor/doctor-drug-search.tsx` (new)
- `src/components/doctor/doctor-store.tsx`
- `src/components/doctor/ipd-round-workspace.tsx`
- `src/components/doctor/prescription-editor.tsx`
- `src/design-system/doctor-data.ts`
- `src/lib/gst-invoicing.ts`
- `src/lib/pharmacy-platform.ts`
- `src/server/clinical/index.ts`
- `src/server/doctor/index.ts`
- `src/server/invoicing.ts`
- `src/server/ipd/index.ts`
- `src/server/pharmacy-rx-bridge.ts`
- `src/server/pharmacy/index.ts`

---

## 6.3 Counsellor error, direct IPD discharge, and billing/consult UI fixes — completed 2026-07-13

### Completed

- **Offline counsellor error fixed**
  - `BillingHandoff` creation now validates the quote's `packageId` against the `Package` table before writing.
  - Invalid or missing package IDs are stored as `null`, preventing Prisma foreign-key violations while keeping the full quote JSON intact.
  - Changed files: `src/server/counsellor/index.ts`.

- **Frontdesk direct IPD discharge**
  - Frontdesk users can discharge IPD patients directly from the admission update dialog without requiring the patient to be marked `doctor_ready`.
  - Payment clearance and empty service-cart checks are still enforced; a confirmation prompt is shown before discharge.
  - Changed files: `src/app/app/frontdesk/ipd/page.tsx`, `src/server/ipd/index.ts`.

- **Doctor consultation services/packages cart UI**
  - Refactored the selection panel for better readability and usability.
  - Right-hand sidebar now fills remaining width instead of being capped at 18rem, so the panel is no longer squeezed.
  - Internal layout uses a single column on laptop screens and only splits into two columns on extra-wide (`xl`) screens.
  - Cart panel is sticky, shows an item-count badge, and displays an empty state when nothing is selected.
  - Selected services/packages are highlighted with colored borders and "Added" badges.
  - Add/remove buttons are `shrink-0` so they stay on the right.
  - Changed files: `src/components/doctor/consultation-workspace.tsx`.

- **Billing separation of previous balance from new bills**
  - The OPD/IPD billing form now shows only the **current bill** in "Net payable".
  - Previous balance is surfaced only in the warning banner and can be collected separately (or by leaving lines empty and submitting a balance payment).
  - Invoices are generated **only when the current bill is fully paid**; partial payments update the visit balance without creating an invoice.
  - Removed the "Balance payment" receipt that bundled previous balance + current bill.
  - Changed files: `src/components/frontdesk/opd-billing-form.tsx`, `src/server/clinical/index.ts`.

### Validation & commit

- `npx tsc --noEmit` passed with 0 errors.
- Changes committed and pushed to `origin/master` as `857fc7d`.

### Changed files

- `src/server/counsellor/index.ts`
- `src/server/ipd/index.ts`
- `src/app/app/frontdesk/ipd/page.tsx`
- `src/components/doctor/consultation-workspace.tsx`
- `src/components/frontdesk/opd-billing-form.tsx`
- `src/server/clinical/index.ts`

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

## 9. Tenant-wise scenario testing (in progress)

Automated end-to-end audits are being executed on the live staging tenant `os.candela.adrine.in` using Playwright. Test data uses branch-specific role credentials and synthetic patients (`AutoTest`, `AutoTest2`, etc.).

### Gurgaon Center progress

- **Tenant login & branch isolation**: OK. Selecting `Gurgaon Center` after `/tenant` login routes to Gurgaon-specific data and price list.
- **Frontdesk registration → check-in → billing**: OK. New patient `AutoTest2` (UHID `NV-GU-2026-0070`, token #79) registered, assigned to `Parth`, billed for `OPD Spine` ₹500, receipt generated.
- **Junior exam handoff**: OK. Vitals, chief complaint, impression and handoff note saved and visible to doctor.
- **Doctor consultation + pharmacy-linked Rx**: OK after filling required `Primary diagnosis`. `Calpol` (Paracetamol 650mg) selected from pharmacy stock and completed successfully. Patient removed from doctor queue; prescription pushed to pharmacy module.
- **Findings / blockers**:
  - `Complete consult` silently does nothing unless the Diagnosis section has a value for the required `Primary diagnosis` field. UX issue: no visible guidance that diagnosis is missing.
  - `navyaupharmacy1@gmail.com / navyaupharmacy1` (the credentials provided for Gurgaon pharmacy) fails with "Invalid email or password for this branch". Pharmacy dispense + billing cannot be verified until the correct password is supplied.
  - Earlier patient `AutoTest` (assigned to `Dr. Sunil Saini`) could not be completed because his password is not in the provided credential list.

### Pataudi Center progress

- **Tenant login & branch selection**: OK. `Pataudi Center` can be selected independently.
- **Frontdesk login**: Blocked. `fdp1@gmail.com` password is truncated in the provided credential sheet; attempted guesses (`fdp1@p`, `fdp1@pataudi`) failed. Admin account can log in to Pataudi but is redirected away from `/app/frontdesk` (admin is not authorized for frontdesk operations).
- **Next steps**: Need correct Pataudi frontdesk password and Gurgaon pharmacy password to complete pharmacy, IPD, and cross-branch isolation tests.

---

*Last updated: 2026-07-13 — counsellor BillingHandoff FK validation, frontdesk direct IPD discharge, doctor consult services/packages cart UI, and billing previous-balance separation completed; TypeScript clean; deploy pending for live verification.*
