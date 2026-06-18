"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { applyArabicLabels } from "@/lib/mapStyle";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  DEFAULT_ZOOM,
  MEDINA_CENTER,
  type Place,
} from "@/lib/places";

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
const CUSTOM_SOURCE_IDS = ["places", "places-heat", "route"];
const CUSTOM_LAYER_IDS = [
  "route-line",
  "places-heatmap",
  "clusters",
  "cluster-count",
  "unclustered-point",
  "unclustered-label",
];
const CUSTOM_LAYER_SET = new Set(CUSTOM_LAYER_IDS);

type Props = {
  places: Place[];
  styleUrl: string;
  focus: { lng: number; lat: number; zoom?: number } | null;
  searchMarker: LngLat | null;
  origin: LngLat | null;
  routeGeometry: { type: "LineString"; coordinates: number[][] } | null;
  showHeatmap: boolean;
  onSelectPlace: (place: Place) => void;
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
      },
    })),
  };
}

// لون النقطة حسب التصنيف (تعبير معتمد على البيانات)
const categoryColorExpr = [
  "match",
  ["get", "category"],
  "mosque",
  CATEGORY_COLORS.mosque,
  "landmark",
  CATEGORY_COLORS.landmark,
  "transport",
  CATEGORY_COLORS.transport,
  "commercial",
  CATEGORY_COLORS.commercial,
  "#64748b",
];

// يضيف مصادرنا وطبقاتنا فوق نمط الخريطة الأساسي
function addAppLayers(map: maplibregl.Map) {
  map.addSource("places", {
    type: "geojson",
    data: EMPTY_FC,
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 13,
  });
  map.addSource("places-heat", { type: "geojson", data: EMPTY_FC });
  map.addSource("route", { type: "geojson", data: EMPTY_FC });

  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#1d4ed8", "line-width": 6, "line-opacity": 0.85 },
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

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "places",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#14b8a6",
        5,
        "#f59e0b",
        10,
        "#ef4444",
      ],
      "circle-radius": ["step", ["get", "point_count"], 16, 5, 22, 10, 28],
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

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "places",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": categoryColorExpr as never,
      "circle-radius": 8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: "unclustered-label",
    type: "symbol",
    source: "places",
    filter: ["!", ["has", "point_count"]],
    minzoom: 13,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-offset": [0, 1.4],
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
  styleUrl,
  focus,
  searchMarker,
  origin,
  routeGeometry,
  showHeatmap,
  onSelectPlace,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const searchMarkerRef = useRef<maplibregl.Marker | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const styleRef = useRef(styleUrl);
  const [ready, setReady] = useState(false);

  // مراجع حيّة كي تقرأ معالجات الأحداث (المرتبطة مرة واحدة) أحدث القيم
  const placesRef = useRef(places);
  const onSelectRef = useRef(onSelectPlace);
  useEffect(() => {
    placesRef.current = places;
    onSelectRef.current = onSelectPlace;
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
      addAppLayers(map);

      // التقريب عند الضغط على تجميع
      map.on("click", "clusters", async (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = feats[0]?.properties?.cluster_id;
        if (clusterId == null) return;
        const source = map.getSource("places") as maplibregl.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const center = (feats[0].geometry as GeoJSON.Point).coordinates;
        map.easeTo({ center: center as [number, number], zoom });
      });

      // اختيار نقطة مفردة: نافذة + تحديدها كوجهة
      map.on("click", "unclustered-point", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = f.properties as Record<string, string>;
        const coords = (f.geometry as GeoJSON.Point).coordinates as [
          number,
          number,
        ];
        new maplibregl.Popup({ offset: 14 })
          .setLngLat(coords)
          .setHTML(
            `<div style="text-align:right">
               <strong>${props.name}</strong>
               <div style="font-size:12px;color:#64748b">${
                 CATEGORY_LABELS[
                   props.category as keyof typeof CATEGORY_LABELS
                 ] ?? ""
               }</div>
               <div style="font-size:13px;margin-top:4px">${props.description ?? ""}</div>
             </div>`,
          )
          .addTo(map);
        const place = placesRef.current.find((p) => p.id === props.id);
        if (place) onSelectRef.current(place);
      });

      // مؤشّر اليد فوق العناصر القابلة للضغط
      for (const layer of ["clusters", "unclustered-point"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // تبديل نمط الخريطة مع الحفاظ على مصادرنا وطبقاتنا
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || styleRef.current === styleUrl) return;
    styleRef.current = styleUrl;

    map.setStyle(styleUrl, {
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
    map.once("style.load", () => applyArabicLabels(map, CUSTOM_LAYER_SET));
  }, [styleUrl, ready]);

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

  // تحديث خط المسار
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("route") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    if (!routeGeometry) {
      source.setData(EMPTY_FC);
      return;
    }
    source.setData({
      type: "Feature",
      geometry: routeGeometry,
      properties: {},
    });

    const coords = routeGeometry.coordinates;
    if (coords.length > 1) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new maplibregl.LngLatBounds(
          coords[0] as [number, number],
          coords[0] as [number, number],
        ),
      );
      map.fitBounds(bounds, { padding: 80, duration: 800 });
    }
  }, [routeGeometry, ready]);

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
