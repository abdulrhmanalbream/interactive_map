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
 * يصغّر قيمة خاصية رقمية (عرض/شفافية الخط) بمعامل، مع الحفاظ على بنية التعبير.
 * لا نغلّف interpolate بـ * لأن تعبيرات zoom يجب أن تكون في القمة — بل نضرب
 * قيم المخرجات داخل interpolate/step نفسها.
 */
function scaleNumeric(value: unknown, factor: number, fallback: number): unknown {
  if (value == null) return fallback * factor;
  if (typeof value === "number") return value * factor;
  if (Array.isArray(value)) {
    const op = value[0];
    const out = value.slice();
    if (op === "interpolate" || op === "interpolate-hcl" || op === "interpolate-lab") {
      // [op, interpolation, input, in0, out0, in1, out1, ...] — المخرجات من الفهرس 4
      for (let i = 4; i < out.length; i += 2) {
        if (typeof out[i] === "number") out[i] = (out[i] as number) * factor;
      }
      return out;
    }
    if (op === "step") {
      // [step, input, out0, stop1, out1, ...] — المخرجات من الفهرس 2
      for (let i = 2; i < out.length; i += 2) {
        if (typeof out[i] === "number") out[i] = (out[i] as number) * factor;
      }
      return out;
    }
  }
  return value; // تعبير غير معروف — نتركه كما هو
}

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
      // نُبقي التسميات والطرق فقط، ونُخفّف شفافية الخطوط كي لا تطغى على صور
      // القمر الصناعي. أمّا تنحيف عرض الطرق فيُطبَّق لاحقًا عبر thinRoadLines
      // على جميع الأنماط بشكل موحّد.
      const overlay = (base.layers ?? [])
        .filter((l) => l.type === "symbol" || l.type === "line")
        .map((l) => {
          if (l.type !== "line") return l;
          const paint = {
            ...(l.paint as Record<string, unknown> | undefined),
          } as Record<string, unknown>;
          paint["line-opacity"] = scaleNumeric(paint["line-opacity"], 0.8, 1);
          return { ...l, paint } as unknown as typeof l;
        });
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

/** معامل تنحيف عرض خطوط الطرق (0.5 = نصف العرض الأصلي). */
const ROAD_WIDTH_FACTOR = 0.5;

/**
 * يُنحّف عرض خطوط الطرق (الأبيض/الأصفر…) في النمط الأساسي كي لا تطغى على الخريطة.
 * يستهدف طبقات الخطوط ذات source-layer = "transportation" (مخطط OpenMapTiles)،
 * ويصغّر تعبير line-width مع الحفاظ على بنية التدرّج حسب الزووم.
 */
export function thinRoadLines(map: MapLibreMap, factor = ROAD_WIDTH_FACTOR) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "line") continue;
    const sourceLayer = (layer as { "source-layer"?: string })["source-layer"];
    if (sourceLayer !== "transportation") continue;
    try {
      const width = map.getPaintProperty(layer.id, "line-width");
      map.setPaintProperty(
        layer.id,
        "line-width",
        scaleNumeric(width, factor, 1) as never,
      );
    } catch {
      // بعض الطبقات قد لا تقبل التعديل — نتجاهلها بأمان
    }
  }
}

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
