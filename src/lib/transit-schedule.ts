import type { TransitRoute } from "./transit";

/** يحوّل "HH:MM" إلى عدد دقائق منذ منتصف الليل. */
function timeToMinutes(t: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export type NextDeparture = {
  /** دقائق منذ الآن حتى الرحلة القادمة. */
  waitMinutes: number;
  /** "HH:MM" للرحلة القادمة (إن كانت معروفة من مواعيد ثابتة). */
  label: string | null;
};

/**
 * يحسب الرحلة القادمة لخط ما اعتمادًا على مواعيده الثابتة أو تردده.
 * يعيد null إن لم يكن للخط أي جدول زمني مُعرَّف.
 */
export function nextDeparture(
  route: Pick<
    TransitRoute,
    "fixedTimes" | "frequencyMinutes" | "scheduleStart" | "scheduleEnd"
  >,
  from: Date = new Date(),
): NextDeparture | null {
  const nowMinutes = from.getHours() * 60 + from.getMinutes();

  if (route.fixedTimes.length > 0) {
    const times = route.fixedTimes
      .map(timeToMinutes)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);
    if (times.length === 0) return null;
    const next = times.find((t) => t >= nowMinutes);
    if (next !== undefined) {
      return { waitMinutes: next - nowMinutes, label: minutesToTime(next) };
    }
    // كل المواعيد فاتت اليوم — أقرب رحلة هي أول موعد غدًا
    const first = times[0];
    return { waitMinutes: 24 * 60 - nowMinutes + first, label: minutesToTime(first) };
  }

  if (route.frequencyMinutes > 0) {
    const start = timeToMinutes(route.scheduleStart);
    const end = timeToMinutes(route.scheduleEnd);
    // خارج فترة التشغيل المُعلنة (إن وُجدت) — لا رحلات
    if (start !== null && end !== null) {
      const inWindow =
        start <= end
          ? nowMinutes >= start && nowMinutes <= end
          : nowMinutes >= start || nowMinutes <= end; // فترة تمتد عبر منتصف الليل
      if (!inWindow) return null;
    }
    const sinceStart = nowMinutes - (start ?? 0);
    const intoInterval = ((sinceStart % route.frequencyMinutes) + route.frequencyMinutes) %
      route.frequencyMinutes;
    const wait = intoInterval === 0 ? 0 : route.frequencyMinutes - intoInterval;
    return { waitMinutes: wait, label: null };
  }

  return null;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** هل يملك الخط أي معلومة جدول زمني (تردد أو مواعيد ثابتة)؟ */
export function hasSchedule(
  route: Pick<TransitRoute, "fixedTimes" | "frequencyMinutes">,
): boolean {
  return route.fixedTimes.length > 0 || route.frequencyMinutes > 0;
}

const ASSUMED_BUS_SPEED_MPS = 6.5; // ~23 كم/س — تقدير متوسط يشمل الوقوف

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * موعد وصول الرحلة القادمة عند محطة مُحدَّدة على الخط (لا عند بداية الخط فقط) —
 * يضيف زمن السير المقدَّر من أول محطة حتى هذه المحطة إلى موعد انطلاق الخط.
 * يعيد null إن لم يكن للخط جدول، أو لم تُعرف إحداثيات المحطات اللازمة.
 */
export function nextDepartureAtStop(
  route: Pick<
    TransitRoute,
    "fixedTimes" | "frequencyMinutes" | "scheduleStart" | "scheduleEnd" | "stopIds"
  >,
  stopId: string,
  stopCoords: Map<string, [number, number]>,
  from: Date = new Date(),
): NextDeparture | null {
  const base = nextDeparture(route, from);
  if (!base) return null;
  const idx = route.stopIds.indexOf(stopId);
  if (idx <= 0) return base;

  let seconds = 0;
  for (let i = 0; i < idx; i++) {
    const a = stopCoords.get(route.stopIds[i]);
    const b = stopCoords.get(route.stopIds[i + 1]);
    if (!a || !b) continue;
    seconds += haversineMeters(a, b) / ASSUMED_BUS_SPEED_MPS;
  }
  const travelMinutes = Math.round(seconds / 60);
  const waitMinutes = base.waitMinutes + travelMinutes;
  let label: string | null = null;
  if (base.label) {
    const [h, m] = base.label.split(":").map(Number);
    const total = (h * 60 + m + travelMinutes) % (24 * 60);
    label = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  return { waitMinutes, label };
}
