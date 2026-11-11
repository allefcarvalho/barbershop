import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// Regra: o banco guarda UTC; "data" e "hora" de negócio (grade, slots) estão no fuso do tenant.
// Nada aqui depende do TZ do servidor.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-11-12" + "09:30" no fuso tz → instante UTC. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  return fromZonedTime(`${date}T${time}:00`, tz);
}

/** Instante UTC → { date: "YYYY-MM-DD", time: "HH:mm" } no fuso tz. */
export function utcToZoned(instant: Date, tz: string) {
  return { date: formatInTimeZone(instant, tz, 'yyyy-MM-dd'), time: formatInTimeZone(instant, tz, 'HH:mm') };
}

/** 0 = domingo … 6 = sábado, da data de calendário (independe de fuso). */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** [início, fim) do dia de calendário no fuso tz, em UTC. */
export function dayRangeUtc(date: string, tz: string) {
  return { start: zonedToUtc(date, '00:00', tz), end: zonedToUtc(addDays(date, 1), '00:00', tz) };
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface SlotInput {
  date: string;
  tz: string;
  workStart: string;
  workEnd: string;
  stepMinutes: number;
  durationMinutes: number;
  busy: { start: Date; end: Date }[];
  notBefore: Date;
}

/**
 * Horários de início livres em que o serviço INTEIRO cabe: dentro da jornada,
 * sem sobrepor nada em `busy` e não antes de `notBefore`.
 */
export function computeSlots(i: SlotInput): string[] {
  const out: string[] = [];
  for (let m = toMin(i.workStart); m + i.durationMinutes <= toMin(i.workEnd); m += i.stepMinutes) {
    const time = toTime(m);
    const start = zonedToUtc(i.date, time, i.tz);
    const end = addMinutes(start, i.durationMinutes);
    if (start < i.notBefore) continue;
    if (i.busy.some((b) => start < b.end && b.start < end)) continue;
    out.push(time);
  }
  return out;
}
