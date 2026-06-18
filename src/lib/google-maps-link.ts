/**
 * استخراج الإحداثيات من روابط خرائط جوجل (وكذلك إحداثيات ملصقة مباشرة).
 *
 * يدعم الصيغ الشائعة — جميعها بترتيب (خط العرض، خط الطول) كما تستخدمه جوجل:
 *   - .../maps/place/الاسم/@24.4395,39.6169,17z/data=...!3d24.4395!4d39.6169
 *   - .../maps/@24.4672,39.6111,15z
 *   - .../maps?q=24.4672,39.6111   و   ?q=loc:24.46,39.61   و   ll= / query= / center=
 *   - .../maps/place/24.4672,39.6111
 *   - إحداثيات مجردة منسوخة: "24.4672, 39.6111"
 *
 * أما الروابط المختصرة (maps.app.goo.gl / goo.gl) فلا يمكن فكّها هنا لأنها تتطلب
 * تتبّع التحويل عبر الخادم — استخدم isShortGoogleMapsLink ثم نقطة API لفكّها.
 */

export type LatLng = { lat: number; lng: number };

function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

// رقم عشري موجب أو سالب
const NUM = "(-?\\d+(?:\\.\\d+)?)";

/** يحاول استخراج (lat,lng) من نص رابط أو إحداثيات. يعيد null عند الفشل. */
export function parseGoogleMapsUrl(raw: string): LatLng | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  // 1) دبوس الموقع الدقيق: !3d<lat>!4d<lng> — الأدقّ لأنه موضع العلامة نفسها
  const pin = input.match(new RegExp(`!3d${NUM}!4d${NUM}`));
  if (pin) {
    const lat = Number(pin[1]);
    const lng = Number(pin[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 2) معاملات الاستعلام: q / query / ll / destination / center / daddr / saddr
  const param = input.match(
    new RegExp(
      `[?&](?:q|query|ll|destination|center|daddr|saddr)=(?:loc:)?${NUM},\\s*${NUM}`,
      "i",
    ),
  );
  if (param) {
    const lat = Number(param[1]);
    const lng = Number(param[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 3) مركز الكاميرا في الرابط: @<lat>,<lng>
  const at = input.match(new RegExp(`@${NUM},${NUM}`));
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 4) مسار يحوي الإحداثيات مباشرة: /place|search|dir/<lat>,<lng>
  const path = input.match(new RegExp(`/(?:place|search|dir)/${NUM},${NUM}`));
  if (path) {
    const lat = Number(path[1]);
    const lng = Number(path[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 5) إحداثيات مجردة ملصقة بالكامل: "lat, lng"
  const bare = input.match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  if (bare) {
    const lat = Number(bare[1]);
    const lng = Number(bare[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  return null;
}

const SHORT_LINK_RE =
  /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i;

/** هل الرابط مختصر يحتاج فكًّا عبر الخادم؟ */
export function isShortGoogleMapsLink(raw: string): boolean {
  return SHORT_LINK_RE.test((raw ?? "").trim());
}
