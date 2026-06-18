"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { applyArabicLabels } from "@/lib/mapStyle";
import { MEDINA_CENTER } from "@/lib/places";

// نمط خريطة مجاني بالكامل من OpenFreeMap (بدون مفتاح/بطاقة)
const PICKER_STYLE = "https://tiles.openfreemap.org/styles/bright";

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

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-lg border border-slate-200"
    />
  );
}
