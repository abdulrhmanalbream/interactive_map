"use client";

import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { applyArabicLabels, thinRoadLines } from "@/lib/mapStyle";
import { darkenColor } from "@/lib/color";
import {
  CATEGORY_COLORS,
  DEFAULT_ZOOM,
  MEDINA_CENTER,
  type Place,
} from "@/lib/places";
import { CATEGORY_ICON } from "@/lib/category-icons";
import type { PlaceCategory } from "@/lib/places";
import type { TransitRoute, TransitStop } from "@/lib/transit";
import type { RouteSegment } from "@/lib/route-segment";

// نخزّن نص الـ SVG لأيقونة كل تصنيف كي لا نُعيد التحويل مع كل علامة.
const iconSvgCache = new Map<string, string>();

/** أيقونة التصنيف كسلسلة SVG لإدراجها داخل عنصر DOM (علامات MapLibre ليست React). */
function categoryIconSvg(category: string, color = "#fff", size = 15) {
  const cached = iconSvgCache.get(category);
  if (cached) return cached;
  const Icon = CATEGORY_ICON[category as PlaceCategory];
  if (!Icon) return "";
  const svg = renderToStaticMarkup(<Icon size={size} color={color} />);
  iconSvgCache.set(category, svg);
  return svg;
}

export type LngLat = { lng: number; lat: number };

// إضافة دعم تشكيل وترتيب النصوص العربية (RTL) في طبقة WebGL.
// نعتمد على حالة MapLibre العامة كي لا نعيد التثبيت بعد إعادة تحميل HMR.
function ensureRTLPlugin() {
  if (maplibregl.getRTLTextPluginStatus() !== "unavailable") return;
  maplibregl.setRTLTextPlugin("/mapbox-gl-rtl-text.js", true).catch(() => {
    // نتجاهل أخطاء التحميل أو التثبيت المكرر
  });
}

// طبقاتنا ومصادرنا المخصّصة — نحافظ عليها عند تبديل نمط الخريطة
const CUSTOM_SOURCE_IDS = ["places", "places-heat", "route", "transit-lines"];
const CUSTOM_LAYER_IDS = [
  "route-line-solid",
  "route-line-walk",
  "places-heatmap",
  "transit-lines-layer",
  "transit-lines-hit",
  "clusters",
  "cluster-count",
  "unclustered-label",
];
const CUSTOM_LAYER_SET = new Set(CUSTOM_LAYER_IDS);

const DEFAULT_STOP_COLOR = "#0ea5e9";

type Props = {
  places: Place[];
  transitRoutes: TransitRoute[];
  transitStops: TransitStop[];
  showTransit: boolean;
  isolatedRouteIds: Set<string> | null;
  mapStyle: string | StyleSpecification;
  focus: { lng: number; lat: number; zoom?: number } | null;
  searchMarker: LngLat | null;
  origin: LngLat | null;
  routeSegments: RouteSegment[] | null;
  showHeatmap: boolean;
  selectedKind: "place" | "stop" | null;
  selectedId: string | null;
  onSelectPlace: (place: Place) => void;
  onSelectStop: (stop: TransitStop) => void;
  onSelectRoute: (route: TransitRoute) => void;
  onClearSelection: () => void;
};

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function toFeatureCollection(places: Place[]) {
  return {
    type: "FeatureCollection" as const,
    features: places.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        image: p.imageUrl ?? "",
      },
    })),
  };
}

const SEGMENT_DEFAULT_COLOR: Record<RouteSegment["mode"], string> = {
  drive: "#1d4ed8",
  walk: "#475569",
  bus: "#0ea5e9",
};

function toSegmentsFeatureCollection(segments: RouteSegment[]) {
  return {
    type: "FeatureCollection" as const,
    features: segments
      .filter((s) => s.coordinates.length >= 2)
      .map((s) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: s.coordinates },
        properties: {
          mode: s.mode,
          color: s.color ?? SEGMENT_DEFAULT_COLOR[s.mode],
        },
      })),
  };
}

function toRoutesFeatureCollection(routes: TransitRoute[]) {
  return {
    type: "FeatureCollection" as const,
    features: routes
      .filter((r) => r.path.length >= 2)
      .map((r) => ({
        type: "Feature" as const,
        id: r.id,
        geometry: { type: "LineString" as const, coordinates: r.path },
        properties: { id: r.id, name: r.name, color: r.color },
      })),
  };
}

// عنصر العلامة:
// - مع صورة: دائرة كبيرة (50px) بإطار بلون التصنيف تعرض لوقو/صورة المكان.
// - بلا صورة: دائرة أصغر (32px) بلون التصنيف وأيقونة في الوسط — أنظف وأقل ازدحامًا.
function createBoardElement(props: Record<string, string>) {
  const color =
    CATEGORY_COLORS[props.category as keyof typeof CATEGORY_COLORS] ??
    "#64748b";
  const el = document.createElement("div");
  el.dataset.baseColor = color;
  el.dataset.hasImage = props.image ? "1" : "0";
  applySelectableStyle(el);
  if (props.image) {
    const img = document.createElement("img");
    img.src = props.image;
    img.alt = "";
    img.style.cssText =
      "width:100%;height:100%;object-fit:cover;display:block;border-radius:50%";
    // عند فشل تحميل الصورة نُظهر الأيقونة البديلة بدل الصورة المكسورة
    img.addEventListener("error", () => {
      img.remove();
      el.dataset.hasImage = "0";
      el.innerHTML = categoryIconSvg(props.category);
      applyMarkerVisualState(el, el.dataset.selected === "1");
    });
    el.appendChild(img);
  } else {
    el.innerHTML = categoryIconSvg(props.category);
  }
  applyMarkerVisualState(el, false);
  return el;
}

/** عنصر محطة النقل — دائرة صغيرة بلون ثابت، بدون صورة. */
function createStopElement() {
  const el = document.createElement("div");
  el.dataset.baseColor = DEFAULT_STOP_COLOR;
  el.dataset.hasImage = "0";
  applySelectableStyle(el);
  applyMarkerVisualState(el, false);
  return el;
}

/** يهيّئ العنصر لدعم انتقال سلس عند التحديد (لا يُعاد استدعاؤها إلا عند الإنشاء). */
function applySelectableStyle(el: HTMLElement) {
  el.style.borderRadius = "50%";
  el.style.cursor = "pointer";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.lineHeight = "1";
  el.style.overflow = "hidden";
  el.style.transition =
    "width .18s ease, height .18s ease, background-color .18s ease, border-color .18s ease, box-shadow .18s ease";
}

/** يطبّق مقاس/لون العلامة حسب حالة التحديد — يُستدعى عند الإنشاء وعند تبديل التحديد. */
function applyMarkerVisualState(el: HTMLElement, selected: boolean) {
  const baseColor = el.dataset.baseColor ?? "#64748b";
  const hasImage = el.dataset.hasImage === "1";
  el.dataset.selected = selected ? "1" : "0";
  const color = selected ? darkenColor(baseColor, 0.28) : baseColor;

  if (hasImage) {
    const size = selected ? 62 : 50;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.border = `3px solid ${color}`;
    el.style.background = color;
    el.style.boxShadow = selected
      ? "0 4px 14px rgba(0,0,0,.45)"
      : "0 2px 6px rgba(0,0,0,.35)";
  } else {
    const isStop = el.dataset.stop === "1";
    const base = isStop ? 14 : 32;
    const grown = isStop ? 22 : 40;
    const size = selected ? grown : base;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.border = `2px solid #fff`;
    el.style.background = color;
    el.style.boxShadow = selected
      ? "0 3px 10px rgba(0,0,0,.45)"
      : "0 2px 5px rgba(0,0,0,.35)";
  }
}

// يضيف مصادرنا وطبقاتنا فوق نمط الخريطة الأساسي
function addAppLayers(map: maplibregl.Map) {
  // التجميع يحدث فقط عند التصغير الكبير (zoom ≤ 10)؛ من zoom 11 فأعلى
  // (يشمل الزووم الافتراضي) تظهر كل النقاط مفردة بأسمائها وصورها.
  map.addSource("places", {
    type: "geojson",
    data: EMPTY_FC,
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: 10,
    generateId: true,
  });
  map.addSource("places-heat", { type: "geojson", data: EMPTY_FC });
  map.addSource("route", { type: "geojson", data: EMPTY_FC });
  map.addSource("transit-lines", { type: "geojson", data: EMPTY_FC });

  // خط المسار (قيادة/باص): طبقة صلبة
  map.addLayer({
    id: "route-line-solid",
    type: "line",
    source: "route",
    filter: ["!=", ["get", "mode"], "walk"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["case", ["==", ["get", "mode"], "bus"], 5, 6],
      "line-opacity": 0.85,
    },
  });
  // خط المسار (مشي): طبقة متقطّعة
  map.addLayer({
    id: "route-line-walk",
    type: "line",
    source: "route",
    filter: ["==", ["get", "mode"], "walk"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-opacity": 0.85,
      "line-dasharray": [1, 1.6],
    },
  });

  map.addLayer({
    id: "places-heatmap",
    type: "heatmap",
    source: "places-heat",
    layout: { visibility: "none" },
    paint: {
      "heatmap-radius": 45,
      "heatmap-opacity": 0.75,
      "heatmap-intensity": 1,
    },
  });

  // خطوط النقل — طبقة رفيعة مرئية + طبقة أعرض شفافة لتسهيل الضغط عليها
  map.addLayer({
    id: "transit-lines-hit",
    type: "line",
    source: "transit-lines",
    layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
    paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 },
  });
  map.addLayer({
    id: "transit-lines-layer",
    type: "line",
    source: "transit-lines",
    layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-opacity": 0.9,
    },
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "places",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        [
          "step",
          ["get", "point_count"],
          "#0f766e",
          5,
          "#b45309",
          10,
          "#b91c1c",
        ],
        [
          "step",
          ["get", "point_count"],
          "#14b8a6",
          5,
          "#f59e0b",
          10,
          "#ef4444",
        ],
      ],
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        ["+", ["step", ["get", "point_count"], 16, 5, 22, 10, 28], 6],
        ["step", ["get", "point_count"], 16, 5, 22, 10, 28],
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "places",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 13,
    },
    paint: { "text-color": "#ffffff" },
  });

  // النقاط المفردة تُعرض كعلامات HTML (بادج اللوقو) — انظر updateMarkers.
  // نُبقي تسمية الاسم فقط، ونزيح إزاحتها كي لا تتداخل مع البادج.
  map.addLayer({
    id: "unclustered-label",
    type: "symbol",
    source: "places",
    filter: ["!", ["has", "point_count"]],
    minzoom: 11,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-offset": [0, 2.6],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });
}

export default function MapView({
  places,
  transitRoutes,
  transitStops,
  showTransit,
  isolatedRouteIds,
  mapStyle,
  focus,
  searchMarker,
  origin,
  routeSegments,
  showHeatmap,
  selectedKind,
  selectedId,
  onSelectPlace,
  onSelectStop,
  onSelectRoute,
  onClearSelection,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  // علامات اللوقو (HTML) للنقاط المفردة، مفهرسة بمعرّف المكان
  const placeMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  // علامات محطات النقل (HTML)، مفهرسة بمعرّف المحطة
  const stopMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const styleRef = useRef(mapStyle);
  const [ready, setReady] = useState(false);
  const selectedClusterIdRef = useRef<number | null>(null);

  // مراجع حيّة كي تقرأ معالجات الأحداث (المرتبطة مرة واحدة) أحدث القيم
  const placesRef = useRef(places);
  const transitStopsRef = useRef(transitStops);
  const onSelectRef = useRef(onSelectPlace);
  const onSelectStopRef = useRef(onSelectStop);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onClearSelectionRef = useRef(onClearSelection);
  useEffect(() => {
    placesRef.current = places;
    transitStopsRef.current = transitStops;
    onSelectRef.current = onSelectPlace;
    onSelectStopRef.current = onSelectStop;
    onSelectRouteRef.current = onSelectRoute;
    onClearSelectionRef.current = onClearSelection;
  });

  // تهيئة الخريطة مرة واحدة
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureRTLPlugin();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleRef.current,
      center: MEDINA_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({}), "top-left");

    // كتم تحذيرات أيقونات POI المفقودة من ستايل الخريطة الأساسي
    map.on("styleimagemissing", (e) => {
      if (map.hasImage(e.id)) return;
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on("load", () => {
      applyArabicLabels(map, CUSTOM_LAYER_SET);
      thinRoadLines(map);
      addAppLayers(map);

      // التقريب عند الضغط على تجميع (مع ومضة تحديد مؤقتة)
      map.on("click", "clusters", async (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = feats[0]?.properties?.cluster_id;
        const featureId = feats[0]?.id;
        if (clusterId == null) return;
        if (
          selectedClusterIdRef.current != null &&
          selectedClusterIdRef.current !== featureId
        ) {
          map.setFeatureState(
            { source: "places", id: selectedClusterIdRef.current },
            { selected: false },
          );
        }
        if (typeof featureId === "number") {
          map.setFeatureState(
            { source: "places", id: featureId },
            { selected: true },
          );
          selectedClusterIdRef.current = featureId;
        }
        const source = map.getSource("places") as maplibregl.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const center = (feats[0].geometry as GeoJSON.Point).coordinates;
        map.easeTo({ center: center as [number, number], zoom });
      });

      // الضغط على خط نقل — نمرّر المعرّف فقط عبر حدث DOM مخصّص
      // (MapApp يملك بيانات الخطوط الكاملة عبر transitRoutes)
      map.on("click", "transit-lines-hit", (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["transit-lines-hit"],
        });
        const id = feats[0]?.properties?.id;
        if (!id) return;
        const evt = new CustomEvent("transit-route-click", { detail: id });
        map.getContainer().dispatchEvent(evt);
      });

      // مزامنة علامات اللوقو مع النقاط المفردة الظاهرة (غير المُجمّعة)
      const updateMarkers = () => {
        if (!map.getSource("places")) return;
        let feats: maplibregl.GeoJSONFeature[];
        try {
          feats = map.querySourceFeatures("places", {
            filter: ["!", ["has", "point_count"]],
          });
        } catch {
          return;
        }
        const markers = placeMarkersRef.current;
        const present = new Set<string>();
        for (const f of feats) {
          const props = f.properties as Record<string, string>;
          const id = props.id;
          if (!id || present.has(id)) continue;
          present.add(id);
          const coords = (f.geometry as GeoJSON.Point).coordinates as [
            number,
            number,
          ];
          const existing = markers[id];
          if (existing) {
            existing.setLngLat(coords);
            continue;
          }
          const el = createBoardElement(props);
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const place = placesRef.current.find((p) => p.id === id);
            if (place) onSelectRef.current(place);
          });
          markers[id] = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);
        }
        // إزالة العلامات التي لم تعد ظاهرة
        for (const id of Object.keys(markers)) {
          if (!present.has(id)) {
            markers[id].remove();
            delete markers[id];
          }
        }
      };
      map.on("render", updateMarkers);
      updateMarkers();

      // مؤشّر اليد فوق التجمّعات وخطوط النقل
      for (const layer of ["clusters", "transit-lines-hit"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      // الضغط على مساحة فارغة يلغي التحديد الحالي
      map.on("click", (e) => {
        const hit = map.queryRenderedFeatures(e.point, {
          layers: [
            "clusters",
            "transit-lines-hit",
            "unclustered-label",
          ].filter((id) => map.getLayer(id)),
        });
        if (hit.length === 0) onClearSelectionRef.current();
      });

      setReady(true);
    });

    return () => {
      for (const m of Object.values(placeMarkersRef.current)) m.remove();
      placeMarkersRef.current = {};
      for (const m of Object.values(stopMarkersRef.current)) m.remove();
      stopMarkersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // معالج الضغط على خط نقل (مُرسَل كحدث DOM مخصّص من المعالج المرتبط مرة واحدة)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const route = transitRoutes.find((r) => r.id === id);
      if (route) onSelectRouteRef.current(route);
    };
    container.addEventListener("transit-route-click", handler);
    return () => container.removeEventListener("transit-route-click", handler);
  }, [transitRoutes, ready]);

  // تبديل نمط الخريطة مع الحفاظ على مصادرنا وطبقاتنا
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || styleRef.current === mapStyle) return;
    styleRef.current = mapStyle;

    map.setStyle(mapStyle, {
      transformStyle: (prev, next) => {
        if (!prev) return next;
        const sources = { ...next.sources };
        for (const id of CUSTOM_SOURCE_IDS) {
          if (prev.sources[id]) sources[id] = prev.sources[id];
        }
        const layers = [...next.layers];
        for (const id of CUSTOM_LAYER_IDS) {
          const layer = prev.layers.find((l) => l.id === id);
          if (layer) layers.push(layer);
        }
        return { ...next, sources, layers };
      },
    });
    map.once("style.load", () => {
      applyArabicLabels(map, CUSTOM_LAYER_SET);
      thinRoadLines(map);
    });
  }, [mapStyle, ready]);

  // تحديث بيانات النقاط (يشمل الفلترة) للمصدرين
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const fc = toFeatureCollection(places);
    (map.getSource("places") as maplibregl.GeoJSONSource | undefined)?.setData(
      fc,
    );
    (
      map.getSource("places-heat") as maplibregl.GeoJSONSource | undefined
    )?.setData(fc);
  }, [places, ready]);

  // تحديث بيانات خطوط النقل
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (
      map.getSource("transit-lines") as maplibregl.GeoJSONSource | undefined
    )?.setData(toRoutesFeatureCollection(transitRoutes));
  }, [transitRoutes, ready]);

  // تبديل ظهور طبقة النقل (خطوط + محطات)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = showTransit ? "visible" : "none";
    if (map.getLayer("transit-lines-layer"))
      map.setLayoutProperty("transit-lines-layer", "visibility", vis);
    if (map.getLayer("transit-lines-hit"))
      map.setLayoutProperty("transit-lines-hit", "visibility", vis);
    const markers = stopMarkersRef.current;
    if (!showTransit) {
      for (const m of Object.values(markers)) m.remove();
      stopMarkersRef.current = {};
    }
  }, [showTransit, ready]);

  // مزامنة علامات محطات النقل (DOM) — تُعرض فقط عند تفعيل الطبقة
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !showTransit) return;
    const markers = stopMarkersRef.current;
    const present = new Set<string>();
    for (const stop of transitStops) {
      present.add(stop.id);
      const existing = markers[stop.id];
      if (existing) {
        existing.setLngLat([stop.lng, stop.lat]);
        continue;
      }
      const el = createStopElement();
      el.dataset.stop = "1";
      applyMarkerVisualState(el, false);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const s = transitStopsRef.current.find((x) => x.id === stop.id);
        if (s) onSelectStopRef.current(s);
      });
      markers[stop.id] = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
    }
    for (const id of Object.keys(markers)) {
      if (!present.has(id)) {
        markers[id].remove();
        delete markers[id];
      }
    }
  }, [transitStops, showTransit, ready]);

  // تخفيت الخطوط غير المعزولة عند عزل خط/محطة
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("transit-lines-layer")) return;
    if (!isolatedRouteIds || isolatedRouteIds.size === 0) {
      map.setPaintProperty("transit-lines-layer", "line-opacity", 0.9);
      map.setPaintProperty("transit-lines-layer", "line-width", 4);
      return;
    }
    const ids = Array.from(isolatedRouteIds);
    map.setPaintProperty("transit-lines-layer", "line-opacity", [
      "case",
      ["in", ["get", "id"], ["literal", ids]],
      1,
      0.15,
    ]);
    map.setPaintProperty("transit-lines-layer", "line-width", [
      "case",
      ["in", ["get", "id"], ["literal", ids]],
      6,
      3,
    ]);
  }, [isolatedRouteIds, ready]);

  // تطبيق حالة التحديد (تكبير+تغميق) على علامة المكان/المحطة المختارة
  const prevSelectedRef = useRef<{ kind: string; id: string } | null>(null);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev) {
      const map =
        prev.kind === "place" ? placeMarkersRef.current : stopMarkersRef.current;
      const marker = map[prev.id];
      if (marker) applyMarkerVisualState(marker.getElement(), false);
    }
    if (selectedKind && selectedId) {
      const map =
        selectedKind === "place" ? placeMarkersRef.current : stopMarkersRef.current;
      const marker = map[selectedId];
      if (marker) applyMarkerVisualState(marker.getElement(), true);
      prevSelectedRef.current = { kind: selectedKind, id: selectedId };
    } else {
      prevSelectedRef.current = null;
    }
    // إلغاء تحديد التجمّع عند مسح التحديد العام
    if (!selectedKind) {
      const map = mapRef.current;
      if (map && selectedClusterIdRef.current != null) {
        map.setFeatureState(
          { source: "places", id: selectedClusterIdRef.current },
          { selected: false },
        );
        selectedClusterIdRef.current = null;
      }
    }
  }, [selectedKind, selectedId, places, transitStops]);

  // الانتقال السلس إلى نقطة التركيز
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 15,
      speed: 1.2,
      essential: true,
    });
  }, [focus]);

  // علامة نتيجة البحث / الوجهة
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!searchMarker) {
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      return;
    }
    if (!searchMarkerRef.current) {
      searchMarkerRef.current = new maplibregl.Marker({ color: "#dc2626" });
    }
    searchMarkerRef.current
      .setLngLat([searchMarker.lng, searchMarker.lat])
      .addTo(map);
  }, [searchMarker]);

  // علامة موقع المستخدم (نقطة البداية)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }
    if (!originMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "18px";
      el.style.height = "18px";
      el.style.borderRadius = "50%";
      el.style.background = "#2563eb";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 0 0 2px #2563eb";
      originMarkerRef.current = new maplibregl.Marker({ element: el });
    }
    originMarkerRef.current.setLngLat([origin.lng, origin.lat]).addTo(map);
  }, [origin]);

  // تحديث خط المسار (قد يتكوّن من عدّة أجزاء: مشي/قيادة/باص)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("route") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    if (!routeSegments || routeSegments.length === 0) {
      source.setData(EMPTY_FC);
      return;
    }
    source.setData(toSegmentsFeatureCollection(routeSegments));

    const allCoords = routeSegments.flatMap((s) => s.coordinates);
    if (allCoords.length > 1) {
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new maplibregl.LngLatBounds(
          allCoords[0] as [number, number],
          allCoords[0] as [number, number],
        ),
      );
      map.fitBounds(bounds, { padding: 80, duration: 800 });
    }
  }, [routeSegments, ready]);

  // تبديل ظهور الخريطة الحرارية
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("places-heatmap")) return;
    map.setLayoutProperty(
      "places-heatmap",
      "visibility",
      showHeatmap ? "visible" : "none",
    );
  }, [showHeatmap, ready]);

  return <div ref={containerRef} className="h-full w-full" />;
}
