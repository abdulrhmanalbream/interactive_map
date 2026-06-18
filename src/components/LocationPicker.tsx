"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { applyArabicLabels, MAP_STYLES } from "@/lib/mapStyle";
import { MEDINA_CENTER } from "@/lib/places";

// نمط خريطة مجاني بالكامل من OpenFreeMap (بدون مفتاح/بطاقة)
const PICKER_STYLE = "https://tiles.openfreemap.org/styles/bright";

// خيارات تبديل النمط داخل المنتقي — خريطة عادية أو صور قمر صناعي
const PICKER_OPTIONS = [
  { id: "bright", label: "خريطة" },
  { id: "satellite", label: "قمر صناعي" },
];

// تشكيل وترتيب النص العربي في طبقة WebGL — حالة عامة لا نعيد تثبيتها
function ensureRTLPlugin() {
  if (maplibregl.getRTLTextPluginStatus() !== "unavailable") return;
  maplibregl.setRTLTextPlugin("/mapbox-gl-rtl-text.js", true).catch(() => {});
}

type Props = {
  lng: number | null;
  lat: number | null;
  onChange: (lng: number, lat: number) => void;
};

// فرق ضئيل يُعدّ "نفس النقطة" — يمنع قفز الدبوس بعد كل تحديث للحقول
const EPS = 1e-6;

export default function LocationPicker({ lng, lat, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [styleId, setStyleId] = useState("bright");
  const styleRef = useRef("bright");

  // مرجع حيّ كي يقرأ المعالج المرتبط مرة واحدة أحدث دالة onChange
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // تهيئة الخريطة مرة واحدة (نلتقط الإحداثيات الابتدائية عند الإنشاء)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureRTLPlugin();

    const start: [number, number] =
      lng != null && lat != null ? [lng, lat] : MEDINA_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: PICKER_STYLE,
      center: start,
      zoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({}), "top-left");

    const marker = new maplibregl.Marker({
      color: "#0d9488",
      draggable: true,
    })
      .setLngLat(start)
      .addTo(map);
    markerRef.current = marker;

    // سحب الدبوس → تحديث الإحداثيات
    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      onChangeRef.current(ll.lng, ll.lat);
    });

    // الضغط على الخريطة → نقل الدبوس وتحديث الإحداثيات
    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      onChangeRef.current(e.lngLat.lng, e.lngLat.lat);
    });

    map.on("load", () => applyArabicLabels(map));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // التهيئة مرة واحدة فقط — التغييرات اللاحقة تُعالج في التأثير أدناه
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مزامنة موضع الدبوس عند تغيّر الإحداثيات من الخارج (الرابط/الإدخال اليدوي)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || lng == null || lat == null) return;
    const cur = marker.getLngLat();
    if (Math.abs(cur.lng - lng) < EPS && Math.abs(cur.lat - lat) < EPS) return;
    marker.setLngLat([lng, lat]);
    map.easeTo({ center: [lng, lat], duration: 600 });
  }, [lng, lat]);

  // تبديل نمط المنتقي (العلامة تبقى لأنها DOM وليست طبقة)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === styleId) return;
    styleRef.current = styleId;
    const def = MAP_STYLES.find((s) => s.id === styleId);
    if (!def?.style) return;
    map.setStyle(def.style);
    map.once("style.load", () => applyArabicLabels(map));
  }, [styleId]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-lg border border-slate-200"
      />
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg bg-white/90 p-1 shadow ring-1 ring-black/5">
        {PICKER_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setStyleId(o.id)}
            className={`rounded-md px-2 py-1 text-xs transition ${
              styleId === o.id
                ? "bg-slate-800 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
