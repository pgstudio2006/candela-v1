type RegistrationInput = Record<string, string | number | boolean>;

export type PatientRegistrationMeta = {
  referrerSource?: string;
  referrerName?: string;
  corporateId?: string;
  consentTreatment?: boolean;
  consentData?: boolean;
  registrationNotes?: string;
  fullName?: string;
  alternatePhone?: string;
  appointmentCentre?: string;
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  society?: string;
  houseNumber?: string;
  street?: string;
  locality?: string;
  landmark?: string;
  address?: string;
  pincode?: string;
};

export function buildPatientRegistrationPayload(data: RegistrationInput) {
  const tags: string[] = [String(data.visitType ?? "opd")];

  if (data.pincode) tags.push(`pincode:${String(data.pincode)}`);
  if (data.city) tags.push(`city:${String(data.city)}`);
  if (data.society) tags.push(`society:${String(data.society)}`);
  if (data.state) tags.push(`state:${String(data.state)}`);
  if (data.district) tags.push(`district:${String(data.district)}`);
  if (data.referrer) tags.push(`ref:${String(data.referrer)}`);
  if (data.corporateId) tags.push(`corporate:${String(data.corporateId)}`);
  if (data.consentTreatment) tags.push("consent:treatment");
  if (data.consentData) tags.push("consent:data");

  const referrerParts = [
    data.referrer ? String(data.referrer) : "",
    data.referrerName ? String(data.referrerName) : "",
  ].filter(Boolean);

  const meta: PatientRegistrationMeta = {
    fullName: data.fullName ? String(data.fullName) : undefined,
    alternatePhone: data.alternatePhone ? String(data.alternatePhone) : undefined,
    appointmentCentre: data.appointmentCentre ? String(data.appointmentCentre) : undefined,
    country: data.country ? String(data.country) : undefined,
    state: data.state ? String(data.state) : undefined,
    district: data.district ? String(data.district) : undefined,
    referrerSource: data.referrer ? String(data.referrer) : undefined,
    referrerName: data.referrerName ? String(data.referrerName) : undefined,
    corporateId: data.corporateId ? String(data.corporateId) : undefined,
    consentTreatment: Boolean(data.consentTreatment),
    consentData: Boolean(data.consentData),
    registrationNotes: data.notes ? String(data.notes) : undefined,
    city: data.city ? String(data.city) : undefined,
    society: data.society ? String(data.society) : undefined,
    houseNumber: data.houseNumber ? String(data.houseNumber) : undefined,
    street: data.street ? String(data.street) : undefined,
    locality: data.locality ? String(data.locality) : undefined,
    landmark: data.landmark ? String(data.landmark) : undefined,
    address: data.address ? String(data.address) : undefined,
    pincode: data.pincode ? String(data.pincode) : undefined,
  };

  return {
    tags,
    meta,
    referrer: referrerParts.length ? referrerParts.join(" · ") : null,
  };
}

export function parsePatientRegistrationMeta(meta: unknown): PatientRegistrationMeta {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const row = meta as Record<string, unknown>;
  return {
    fullName: row.fullName ? String(row.fullName) : undefined,
    alternatePhone: row.alternatePhone ? String(row.alternatePhone) : undefined,
    appointmentCentre: row.appointmentCentre ? String(row.appointmentCentre) : undefined,
    country: row.country ? String(row.country) : undefined,
    state: row.state ? String(row.state) : undefined,
    district: row.district ? String(row.district) : undefined,
    referrerSource: row.referrerSource ? String(row.referrerSource) : undefined,
    referrerName: row.referrerName ? String(row.referrerName) : undefined,
    corporateId: row.corporateId ? String(row.corporateId) : undefined,
    consentTreatment: row.consentTreatment === true,
    consentData: row.consentData === true,
    registrationNotes: row.registrationNotes ? String(row.registrationNotes) : undefined,
    city: row.city ? String(row.city) : undefined,
    society: row.society ? String(row.society) : undefined,
    houseNumber: row.houseNumber ? String(row.houseNumber) : undefined,
    street: row.street ? String(row.street) : undefined,
    locality: row.locality ? String(row.locality) : undefined,
    landmark: row.landmark ? String(row.landmark) : undefined,
    address: row.address ? String(row.address) : undefined,
    pincode: row.pincode ? String(row.pincode) : undefined,
  };
}
