import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * أنماط خرائط مجانية بالكامل من OpenFreeMap — بدون مفتاح API وبدون بطاقة.
 */
export const MAP_STYLES = [
  {
    id: "liberty",
    label: "ملوّن",
    url: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "bright",
    label: "ساطع",
    url: "https://tiles.openfreemap.org/styles/bright",
  },
  {
    id: "positron",
    label: "رمادي",
    url: "https://tiles.openfreemap.org/styles/positron",
  },
] as const;

export const MAP_STYLE_URL = MAP_STYLES[0].url;

/**
 * يجعل تسميات الخريطة عربية كلما توفّر الاسم العربي في بيانات OpenStreetMap،
 * مع الرجوع للاسم المحلي/اللاتيني عند عدم توفّره.
 *
 * @param skipLayerIds معرّفات طبقاتنا المخصّصة (نقاط/تجميع/مسار) لتجنّب العبث بنصوصها.
 */
export function applyArabicLabels(
  map: MapLibreMap,
  skipLayerIds?: Set<string>,
) {
  const arabicName = [
    "coalesce",
    ["get", "name:ar"],
    ["get", "name"],
    ["get", "name:latin"],
  ];

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    if (skipLayerIds?.has(layer.id)) continue;
    const textField = map.getLayoutProperty(layer.id, "text-field");
    if (textField == null) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", arabicName as never);
    } catch {
      // بعض الطبقات قد لا تقبل التعديل — نتجاهلها بأمان
    }
  }
}
