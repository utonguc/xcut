/**
 * Timezone utilities for Europe/Istanbul (UTC+3)
 * Pure math — no Intl required for core formatting.
 */

const TZ_OFFSET = 180; // Europe/Istanbul = UTC+3 = 180 minutes

/** Convert a UTC ISO string to Istanbul local minutes since midnight */
export function toIstMins(utcIso: string): number {
  const d = new Date(utcIso);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + TZ_OFFSET) % (24 * 60);
}

/** Format a UTC ISO string as HH:MM in Istanbul time */
export function fmtTime(utcIso: string): string {
  const d = new Date(utcIso);
  const totalMins = d.getUTCHours() * 60 + d.getUTCMinutes() + TZ_OFFSET;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format a UTC ISO string as "15.01.2025" */
export function fmtDate(utcIso: string): string {
  const d = new Date(utcIso);
  const offsetMs = TZ_OFFSET * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  return `${String(local.getUTCDate()).padStart(2, "0")}.${String(local.getUTCMonth() + 1).padStart(2, "0")}.${local.getUTCFullYear()}`;
}

/** Format a UTC ISO string as "15 Oca 2025" */
export function fmtDateLong(utcIso: string): string {
  const d = new Date(utcIso);
  const offsetMs = TZ_OFFSET * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  return fmtDateObjLong(local);
}

/** Format a Date object as "15 Oca 2025, 14:30" */
export function fmtDateTime(utcIso: string): string {
  const d = new Date(utcIso);
  const offsetMs = TZ_OFFSET * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  const MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
  const h = String(local.getUTCHours()).padStart(2, "0");
  const m = String(local.getUTCMinutes()).padStart(2, "0");
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${h}:${m}`;
}

const MONTHS_LONG = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const MONTHS_SHORT = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const DAYS = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

/** Format a local Date object as "Pazartesi, 15 Ocak 2025" */
export function fmtDateObjLong(d: Date): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Convert a UTC ISO string to a local Istanbul Date string "YYYY-MM-DD" */
export function toIstDate(utcIso: string): string {
  const d = new Date(utcIso);
  const offsetMs = TZ_OFFSET * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Convert a local "YYYY-MM-DDTHH:MM" string (assumed Istanbul) to UTC ISO.
 * e.g. "2025-01-15T14:30" → "2025-01-15T11:30:00.000Z"
 */
export function localToUtc(localIso: string): string {
  const d = new Date(localIso + ":00Z");
  return new Date(d.getTime() - TZ_OFFSET * 60 * 1000).toISOString();
}

/** Convert UTC ISO → local display string "HH:MM" */
export function utcToLocal(utcIso: string): string {
  return fmtTime(utcIso);
}

/** Convert local display string "HH:MM" → UTC ISO on a given date "YYYY-MM-DD" */
export function localToDisplay(timeStr: string): string {
  return timeStr;
}
