export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type HorarioLaboral = {
  timezone: string;
  mon: [string, string][];
  tue: [string, string][];
  wed: [string, string][];
  thu: [string, string][];
  fri: [string, string][];
  sat: [string, string][];
  sun: [string, string][];
};

export const DEFAULT_HORARIO: HorarioLaboral = {
  timezone: "America/Argentina/Buenos_Aires",
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
  sat: [],
  sun: [],
};

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function dayKeyFromDate(date: Date, timeZone: string): DayKey {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, DayKey> = {
    Sun: "sun",
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
  };
  return map[weekday] ?? DAY_KEYS[date.getUTCDay()];
}

/** "09:00" → minutos desde medianoche */
export function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function formatSlotLabel(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Devuelve instantes UTC de inicio de slot dentro de una ventana,
 * respetando horario laboral en la timezone del negocio.
 */
export function generateCandidateSlots(params: {
  from: Date;
  to: Date;
  durationMinutes: number;
  intervalMinutes: number;
  horario: HorarioLaboral;
}): Date[] {
  const { from, to, durationMinutes, intervalMinutes, horario } = params;
  const tz = horario.timezone || "America/Argentina/Buenos_Aires";
  const slots: Date[] = [];

  // Iterar día a día en la timezone del negocio aproximando por UTC medianoche offsets
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor < to) {
    const dayKey = dayKeyFromDate(cursor, tz);
    const windows = horario[dayKey] ?? [];

    for (const [startHm, endHm] of windows) {
      const startMin = parseHm(startHm);
      const endMin = parseHm(endHm);

      for (
        let minute = startMin;
        minute + durationMinutes <= endMin;
        minute += intervalMinutes
      ) {
        const slot = zonedLocalToUtc(cursor, tz, minute);
        if (slot >= from && slot < to) {
          slots.push(slot);
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}

/** Interpreta YYYY-MM-DD + minutos locales en `timeZone` como Date UTC. */
function zonedLocalToUtc(dayAnchor: Date, timeZone: string, minutesFromMidnight: number): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dayAnchor);

  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, "0");
  const mm = String(minutesFromMidnight % 60).padStart(2, "0");
  const localIso = `${ymd}T${hh}:${mm}:00`;

  // Resolver offset de esa zona en esa fecha
  const asUtcGuess = new Date(localIso + "Z");
  const inTz = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asUtcGuess);

  const get = (type: string) =>
    Number(inTz.find((p) => p.type === type)?.value ?? "0");
  const asIfLocal = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  const offset = asIfLocal - asUtcGuess.getTime();
  return new Date(Date.parse(localIso + "Z") - offset);
}

export function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB;
}
