"use client";

import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { applyArabicLabels, thinRoadLines } from "@/lib/mapStyle";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  DEFAULT_ZOOM,
  MEDINA_CENTER,
  type Place,
} from "@/lib/places";
import { CATEGORY_ICON } from "@/lib/category-icons";
import type { PlaceCategory } from "@/lib/places";

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
const CUSTOM_SOURCE_IDS = ["places", "places-heat", "route"];
const CUSTOM_LAYER_IDS = [
  "route-line",
  "places-heatmap",
  "clusters",
  "cluster-count",
  "unclustered-label",
];
const CUSTOM_LAYER_SET = new Set(CUSTOM_LAYER_IDS);

type Props = {
  places: Place[];
  mapStyle: string | StyleSpecification;
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
        image: p.imageUrl ?? "",
      },
    })),
  };
}

// محتوى نافذة المكان (popup) — يتضمّن الصورة إن وُجدت
function placePopupHTML(props: Record<string, string>) {
  const img = props.image
    ? `<img src="${props.image.replace(/"/g, "%22")}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:6px" />`
    : "";
  const cat =
    CATEGORY_LABELS[props.category as keyof typeof CATEGORY_LABELS] ?? "";
  return `<div style="text-align:right;max-width:220px">
     ${img}
     <strong>${props.name}</strong>
     <div style="font-size:12px;color:#64748b">${cat}</div>
     <div style="font-size:13px;margin-top:4px">${props.description ?? ""}</div>
   </div>`;
}

// عنصر العلامة:
// - مع صورة: دائرة كبيرة (50px) بإطار بلون التصنيف تعرض لوقو/صورة المكان.
// - بلا صورة: دائرة أصغر (32px) بلون التصنيف وأيقونة في الوسط — أنظف وأقل ازدحامًا.
function createBoardElement(props: Record<string, string>) {
  const color =
    CATEGORY_COLORS[props.category as keyof typeof CATEGORY_COLORS] ??
    "#64748b";
  const el = document.createElement("div");
  if (props.image) {
    el.style.cssText = `width:50px;height:50px;border-radius:50%;border:3px solid ${color};background:${color};box-shadow:0 2px 6px rgba(0,0,0,.35);overflow:hidden;cursor:pointer;display:block`;
    const img = document.createElement("img");
    img.src = props.image;
    img.alt = "";
    img.style.cssText =
      "width:100%;height:100%;object-fit:cover;display:block";
    // عند فشل تحميل الصورة نُظهر الأيقونة البديلة بدل الصورة المكسورة
    img.addEventListener("error", () => {
      img.remove();
      el.style.cssText = noImageStyle(color);
      el.innerHTML = categoryIconSvg(props.category);
    });
    el.appendChild(img);
  } else {
    el.style.cssText = noImageStyle(color);
    el.innerHTML = categoryIconSvg(props.category);
  }
  return el;
}

function noImageStyle(color: string) {
  return `width:32px;height:32px;border-radius:50%;border:2px solid #fff;background:${color};box-shadow:0 2px 5px rgba(0,0,0,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1`;
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
  mapStyle,
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
  // علامات اللوقو (HTML) للنقاط المفردة، مفهرسة بمعرّف المكان
  const placeMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const styleRef = useRef(mapStyle);
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
      thinRoadLines(map);
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
            new maplibregl.Popup({ offset: 32 })
              .setLngLat(coords)
              .setHTML(placePopupHTML(props))
              .addTo(map);
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

      // مؤشّر اليد فوق التجميعات
      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      setReady(true);
    });

    return () => {
      for (const m of Object.values(placeMarkersRef.current)) m.remove();
      placeMarkersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
