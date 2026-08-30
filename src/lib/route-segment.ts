/** جزء واحد من مسار مُعروض على الخريطة (قيادة/مشي/باص) — يُستخدم لتلوين/تنسيق كل جزء بشكل مستقل. */
export type RouteSegment = {
  mode: "drive" | "walk" | "bus";
  coordinates: [number, number][];
  /** لون مخصّص (لخطوط الباص، يطابق لون الخط) — إن غاب يُستخدم لون افتراضي حسب mode. */
  color?: string;
};
