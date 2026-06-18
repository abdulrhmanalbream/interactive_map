import type {
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";

const OFM_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// صور الأقمار الصناعية المجانية (بدون مفتاح) من Esri World Imagery
const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "صور الأقمار الصناعية: Esri و Maxar و Earthstar Geographics ومجتمع مستخدمي GIS";

function satelliteSource() {
  return {
    type: "raster" as const,
    tiles: [ESRI_TILES],
    tileSize: 256,
    maxzoom: 19,
    attribution: ESRI_ATTRIBUTION,
  };
}

/**
 * نمط صور الأقمار الصناعية — Esri World Imagery المجاني (بدون مفتاح/بطاقة).
 * نضمّن glyphs كي تظهر نصوص طبقاتنا (أسماء المعالم وعدّاد التجميع) فوق الصور.
 */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: OFM_GLYPHS,
  sources: { satellite: satelliteSource() },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

// نخزّن الستايل الهجين بعد بنائه مرة واحدة (الجلب مكلف نسبيًا)
let hybridCache: Promise<StyleSpecification> | null = null;

/**
 * نمط هجين = صور الأقمار الصناعية + تسميات الشوارع/المعالم فوقها.
 * نجلب ستايل OpenFreeMap المتجهي ونبقي فقط طبقات النصوص والخطوط (symbol + line)
 * ونضع تحتها طبقة صور Esri. يُعرَّب تلقائيًا عبر applyArabicLabels لاحقًا.
 */
export function buildHybridStyle(): Promise<StyleSpecification> {
  if (!hybridCache) {
    hybridCache = (async () => {
      const res = await fetch("https://tiles.openfreemap.org/styles/bright");
      if (!res.ok) throw new Error("failed to load base style");
      const base = (await res.json()) as StyleSpecification;
      const overlay = (base.layers ?? []).filter(
        (l) => l.type === "symbol" || l.type === "line",
      );
      return {
        ...base,
        sources: { ...base.sources, satellite: satelliteSource() },
        layers: [
          { id: "satellite", type: "raster", source: "satellite" },
          ...overlay,
        ],
      } as StyleSpecification;
    })().catch((err) => {
      hybridCache = null; // اسمح بإعادة المحاولة عند الفشل
      throw err;
    });
  }
  return hybridCache;
}

export type MapStyleDef = {
  id: string;
  label: string;
  /** ستايل جاهز (رابط أو كائن). يُترك فارغًا عند الاعتماد على build. */
  style?: string | StyleSpecification;
  /** باني ستايل غير متزامن (مثل الهجين). */
  build?: () => Promise<StyleSpecification>;
};

/**
 * أنماط خرائط مجانية بالكامل — بدون مفتاح API وبدون بطاقة.
 * الثلاثة الأولى متجهيّة من OpenFreeMap، والرابع صور أقمار صناعية من Esri.
 */
export const MAP_STYLES: MapStyleDef[] = [
  {
    id: "liberty",
    label: "ملوّن",
    style: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "bright",
    label: "ساطع",
    style: "https://tiles.openfreemap.org/styles/bright",
  },
  {
    id: "positron",
    label: "رمادي",
    style: "https://tiles.openfreemap.org/styles/positron",
  },
  // {
  //   id: "satellite",
  //   label: "قمر صناعي",
  //   style: SATELLITE_STYLE,
  // },
  // {
  //   id: "hybrid",
  //   label: "هجين",
  //   build: buildHybridStyle,
  // },
  {
    id: "satellite",
    label: "قمر صناعي",
    build: buildHybridStyle,
  },
];

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
