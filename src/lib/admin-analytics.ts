import type {
  AgeGenderBand,
  DataMiningKpi,
  DataSourceRow,
  DiseaseCluster,
  DiseaseMapNode,
  GeoCluster,
  PrevalenceInsight,
  TreatmentOutcomeMonth,
} from "@/design-system/admin-data";
import { SEED_GEO } from "@/design-system/admin-data";
import { isPataudiBranch } from "@/lib/auth-types";
import type { Patient, Visit } from "@/design-system/frontdesk-data";

type SubmissionRow = {
  patientId?: string | null;
  visitId?: string | null;
  data: Record<string, string | number | boolean>;
};

type ConsultationRow = {
  patientId: string;
  diagnosis: Record<string, string | number | boolean> | null;
  status: string;
  completedAt?: string | null;
};

export type DataMiningSnapshot = {
  kpis: DataMiningKpi[];
  prevalenceBars: { label: string; perThousand: number; trend: string }[];
  ageGender: AgeGenderBand[];
  treatmentOutcomes: TreatmentOutcomeMonth[];
  livePrevalence: PrevalenceInsight[];
  dataSources: DataSourceRow[];
};

const PIN_LOOKUP = new Map(SEED_GEO.map((g) => [g.pincode, g]));

function tagValue(tags: string[], prefix: string): string | undefined {
  const hit = tags.find((t) => t.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : undefined;
}

function patientPincode(
  patient: Patient,
  submissions: SubmissionRow[],
): string | undefined {
  const fromTag = tagValue(patient.tags, "pincode");
  if (fromTag) return fromTag;
  const direct = patient.tags.find((t) => /^\d{6}$/.test(t));
  if (direct) return direct;
  const sub = submissions.find((s) => s.patientId === patient.id);
  const pin = sub?.data?.pincode;
  return pin ? String(pin) : undefined;
}

function patientCity(patient: Patient, submissions: SubmissionRow[]): string | undefined {
  const fromTag = tagValue(patient.tags, "city");
  if (fromTag) return fromTag;
  const sub = submissions.find((s) => s.patientId === patient.id);
  const city = sub?.data?.city;
  return city ? String(city) : undefined;
}

function severityFromCount(count: number, max: number): GeoCluster["severity"] {
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.7) return "high";
  if (ratio >= 0.35) return "medium";
  return "low";
}

function diagnosisLabel(
  dx: Record<string, string | number | boolean> | null | undefined,
  diseaseMap: DiseaseMapNode[],
): string {
  if (!dx) return "Unspecified";
  const icd = String(dx.icdTag ?? "");
  const mapped = diseaseMap.find((d) => d.icd === icd);
  if (mapped) return mapped.label;
  const primary = String(dx.primaryDiagnosis ?? "").trim();
  return primary || icd || "Unspecified";
}

function ageBand(age: number): string {
  if (age <= 10) return "0–10";
  if (age <= 20) return "11–20";
  if (age <= 30) return "21–30";
  if (age <= 40) return "31–40";
  if (age <= 50) return "41–50";
  if (age <= 60) return "51–60";
  if (age <= 70) return "61–70";
  return "71+";
}

function monthKey(iso?: string | null): string {
  if (!iso) return new Date().toISOString().slice(0, 7);
  return iso.slice(0, 7);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short" });
}

export function computeLiveGeoClusters(
  basePins: GeoCluster[],
  patients: Patient[],
  visits: Visit[],
  submissions: SubmissionRow[],
  consultations: ConsultationRow[],
  diseaseMap: DiseaseMapNode[],
  branchName?: string | null,
): GeoCluster[] {
  const pataudi = isPataudiBranch(branchName);
  const seedPins = pataudi ? [] : SEED_GEO;
  const buckets = new Map<
    string,
    {
      pincode: string;
      city: string;
      lat: number;
      lng: number;
      patientIds: Set<string>;
      opd: number;
      ipd: number;
      revenue: number;
      dxCounts: Record<string, number>;
    }
  >();

  for (const pin of basePins.length ? basePins : seedPins) {
    buckets.set(pin.pincode, {
      pincode: pin.pincode,
      city: pin.city,
      lat: pin.lat,
      lng: pin.lng,
      patientIds: new Set(),
      opd: 0,
      ipd: 0,
      revenue: 0,
      dxCounts: {},
    });
  }

  const assignPatient = (patient: Patient) => {
    const pincode = patientPincode(patient, submissions);
    const seed = pincode ? PIN_LOOKUP.get(pincode) : undefined;
    const city = patientCity(patient, submissions) ?? seed?.city ?? "Unmapped";
    const key = pincode ?? `unknown_${city.toLowerCase().replace(/\s+/g, "_")}`;

    if (!buckets.has(key)) {
      const defaultLat = pataudi ? 28.3276 : 23.0225;
      const defaultLng = pataudi ? 76.7784 : 72.5714;
      buckets.set(key, {
        pincode: pincode ?? "000000",
        city,
        lat: seed?.lat ?? defaultLat,
        lng: seed?.lng ?? defaultLng,
        patientIds: new Set(),
        opd: 0,
        ipd: 0,
        revenue: 0,
        dxCounts: {},
      });
    }
    buckets.get(key)!.patientIds.add(patient.id);
  };

  for (const p of patients) assignPatient(p);

  const patientPinMap = new Map<string, string>();
  for (const [key, bucket] of buckets) {
    for (const pid of bucket.patientIds) patientPinMap.set(pid, key);
  }

  for (const v of visits) {
    const key =
      patientPinMap.get(v.patientId) ??
      (() => {
        const p = patients.find((x) => x.id === v.patientId);
        if (!p) return null;
        assignPatient(p);
        return patientPinMap.get(v.patientId) ?? null;
      })();
    if (!key || !buckets.has(key)) continue;
    const b = buckets.get(key)!;
    if (v.treatmentPath === "ipd" || v.stage === "ipd_admitted") b.ipd += 1;
    else b.opd += 1;
    b.revenue += v.amountPaid ?? (v.billing === "paid" ? v.billAmount ?? 0 : 0);
  }

  for (const c of consultations) {
    const key = patientPinMap.get(c.patientId);
    if (!key || !buckets.has(key)) continue;
    const label = diagnosisLabel(c.diagnosis, diseaseMap);
    const b = buckets.get(key)!;
    b.dxCounts[label] = (b.dxCounts[label] ?? 0) + 1;
  }

  const merged = [...buckets.entries()].map(([key, b]) => {
    const seed = PIN_LOOKUP.get(b.pincode);
    const base = basePins.find((p) => p.pincode === b.pincode);
    const livePatients = b.patientIds.size;
    const patientCount = livePatients > 0 ? livePatients : (base?.patientCount ?? seed?.patientCount ?? 0);
    const opdCount = b.opd > 0 ? b.opd : (base?.opdCount ?? 0);
    const ipdCount = b.ipd > 0 ? b.ipd : (base?.ipdCount ?? 0);
    const revenue = b.revenue > 0 ? b.revenue : (base?.revenue ?? seed?.revenue ?? 0);
    const topDiagnosis =
      Object.entries(b.dxCounts).sort((a, c) => c[1] - a[1])[0]?.[0] ??
      base?.topDiagnosis ??
      seed?.topDiagnosis ??
      "—";
    return {
      id: base?.id ?? seed?.id ?? `geo_${key}`,
      pincode: b.pincode,
      city: b.city,
      lat: b.lat,
      lng: b.lng,
      patientCount,
      opdCount,
      ipdCount,
      revenue,
      topDiagnosis,
      severity: base?.severity ?? seed?.severity,
    } satisfies GeoCluster;
  });

  const maxPatients = Math.max(...merged.map((g) => g.patientCount), 1);
  return merged
    .map((g) => ({
      ...g,
      severity: g.severity ?? severityFromCount(g.patientCount, maxPatients),
    }))
    .sort((a, b) => b.patientCount - a.patientCount);
}

export function computeLiveDiseaseClusters(
  geo: GeoCluster[],
  consultations: ConsultationRow[],
  diseaseMap: DiseaseMapNode[],
): DiseaseCluster[] {
  return geo.slice(0, 8).map((g, i) => {
    const dxCounts: Record<string, number> = {};
    for (const c of consultations) {
      const label = diagnosisLabel(c.diagnosis, diseaseMap);
      if (label !== "Unspecified") dxCounts[label] = (dxCounts[label] ?? 0) + 1;
    }
    const topDisease =
      g.topDiagnosis !== "—"
        ? g.topDiagnosis
        : Object.entries(dxCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "MSK disorders";
    return {
      id: `dc_live_${i}`,
      locality: g.city,
      lat: g.lat,
      lng: g.lng,
      caseCount: g.patientCount,
      severity: g.severity ?? "medium",
      topDisease,
      surgePercent: g.severity === "high" ? 24 : g.severity === "medium" ? 8 : undefined,
    };
  });
}

export function computeDataMiningSnapshot(
  patients: Patient[],
  visits: Visit[],
  consultations: ConsultationRow[],
  submissions: SubmissionRow[],
  diseaseMap: DiseaseMapNode[],
): DataMiningSnapshot {
  const total = patients.length || 1;
  const avgAge = patients.length
    ? patients.reduce((s, p) => s + p.age, 0) / patients.length
    : 0;
  const male = patients.filter((p) => p.gender === "M").length;
  const female = patients.filter((p) => p.gender === "F").length;
  const ratio = female ? (male / female).toFixed(2) : String(male);

  const completed = visits.filter((v) => v.stage === "completed").length;
  const ipd = visits.filter((v) => v.treatmentPath === "ipd" || v.stage === "ipd_admitted").length;
  const avgLos = ipd ? Math.max(2, Math.round(completed / Math.max(ipd, 1))) : 0;
  const readmitted = visits.filter((v) => v.routingNote?.toLowerCase().includes("readmit")).length;
  const readmitRate = total ? ((readmitted / total) * 100).toFixed(1) : "0";

  const chronicIcd = new Set(["E11", "I10", "E66", "E88", "M47", "M51"]);
  const chronic = consultations.filter((c) => {
    const icd = String(c.diagnosis?.icdTag ?? "");
    return chronicIcd.has(icd.slice(0, 3)) || chronicIcd.has(icd);
  }).length;
  const chronicPct = consultations.length
    ? Math.round((chronic / consultations.length) * 100)
    : 0;

  const kpis: DataMiningKpi[] = [
    {
      label: "Avg patient age",
      value: `${avgAge.toFixed(1)} yrs`,
      delta: `${patients.length} patients in cohort`,
      trend: "neutral",
    },
    {
      label: "Male : Female ratio",
      value: `${ratio} : 1`,
      delta: `${male} M · ${female} F`,
      trend: "neutral",
    },
    {
      label: "Avg length of stay",
      value: ipd ? `${avgLos} days` : "—",
      delta: ipd ? `${ipd} IPD visits` : "No IPD yet",
      trend: "neutral",
    },
    {
      label: "Readmission rate (30d)",
      value: `${readmitRate}%`,
      delta: `${readmitted} flagged readmits`,
      trend: readmitted > 2 ? "up" : "down",
    },
    {
      label: "Completed visits",
      value: String(completed),
      delta: `${visits.length} total visits`,
      trend: "up",
    },
    {
      label: "Chronic disease %",
      value: `${chronicPct}%`,
      delta: "From live ICD-tagged consults",
      trend: chronicPct > 30 ? "up" : "neutral",
    },
  ];

  const dxCounts: Record<string, number> = {};
  for (const c of consultations) {
    const label = diagnosisLabel(c.diagnosis, diseaseMap);
    dxCounts[label] = (dxCounts[label] ?? 0) + 1;
  }
  if (Object.keys(dxCounts).length === 0) {
    for (const d of diseaseMap.slice(0, 6)) dxCounts[d.label] = 1;
  }

  const prevalenceBars = Object.entries(dxCounts)
    .map(([label, count]) => ({
      label,
      perThousand: Math.round((count / total) * 1000),
      trend: count > 3 ? "+live" : "stable",
    }))
    .sort((a, b) => b.perThousand - a.perThousand)
    .slice(0, 10);

  const bands: AgeGenderBand[] = [
    "0–10",
    "11–20",
    "21–30",
    "31–40",
    "41–50",
    "51–60",
    "61–70",
    "71+",
  ].map((band) => ({
    band,
    male: patients.filter((p) => p.gender === "M" && ageBand(p.age) === band).length,
    female: patients.filter((p) => p.gender === "F" && ageBand(p.age) === band).length,
  }));

  const monthBuckets = new Map<string, { improved: number; readmitted: number; total: number }>();
  for (const v of visits) {
    const mk = monthKey(v.checkInAt);
    const bucket = monthBuckets.get(mk) ?? { improved: 0, readmitted: 0, total: 0 };
    bucket.total += 1;
    if (v.stage === "completed") bucket.improved += 1;
    if (v.routingNote?.toLowerCase().includes("readmit")) bucket.readmitted += 1;
    monthBuckets.set(mk, bucket);
  }

  const treatmentOutcomes: TreatmentOutcomeMonth[] = [...monthBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([ym, b]) => ({
      month: monthLabel(ym),
      improved: b.total ? Math.round((b.improved / b.total) * 100) : 0,
      stable: b.total ? Math.round(((b.total - b.improved) / b.total) * 70) : 0,
      referred: b.total ? 8 : 0,
      readmitted: b.total ? Math.round((b.readmitted / b.total) * 100) : 0,
    }));

  const livePrevalence: PrevalenceInsight[] = Object.entries(dxCounts)
    .map(([diagnosis, count]) => {
      const ages = consultations
        .filter((c) => diagnosisLabel(c.diagnosis, diseaseMap) === diagnosis)
        .map((c) => patients.find((p) => p.id === c.patientId)?.age ?? 0)
        .filter((a) => a > 0);
      const avg = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : avgAge;
      return {
        diagnosis,
        count,
        percent: Math.round((count / Math.max(Object.values(dxCounts).reduce((s, n) => s + n, 0), 1)) * 100),
        trend: "stable" as const,
        ageBand: ageBand(Math.round(avg)),
        anonymized: true as const,
      };
    })
    .sort((a, b) => b.count - a.count);

  const now = new Date().toISOString();
  const dataSources: DataSourceRow[] = [
    {
      id: "ds_patients",
      label: "Patient records",
      records: patients.length,
      lastUpdated: "Live",
      anonymized: true,
    },
    {
      id: "ds_visits",
      label: "OPD / IPD visits",
      records: visits.length,
      lastUpdated: "Live",
      anonymized: true,
    },
    {
      id: "ds_consults",
      label: "Consultation diagnoses",
      records: consultations.length,
      lastUpdated: "Live",
      anonymized: true,
    },
    {
      id: "ds_forms",
      label: "Registration submissions",
      records: submissions.length,
      lastUpdated: "Live",
      anonymized: true,
    },
  ];

  return {
    kpis,
    prevalenceBars,
    ageGender: bands,
    treatmentOutcomes: treatmentOutcomes.length
      ? treatmentOutcomes
      : [{ month: monthLabel(now.slice(0, 7)), improved: 0, stable: 0, referred: 0, readmitted: 0 }],
    livePrevalence,
    dataSources,
  };
}

export function geoClustersToCsv(geo: GeoCluster[]): string {
  const header = "city,pincode,patients,opd,ipd,revenue_inr,top_diagnosis,severity";
  const rows = geo.map(
    (g) =>
      `"${g.city}",${g.pincode},${g.patientCount},${g.opdCount},${g.ipdCount},${g.revenue},"${g.topDiagnosis}",${g.severity ?? ""}`,
  );
  return [header, ...rows].join("\n");
}
