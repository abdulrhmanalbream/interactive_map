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
