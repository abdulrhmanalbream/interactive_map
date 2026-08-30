"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { applyArabicLabels } from "@/lib/mapStyle";
import { MEDINA_CENTER } from "@/lib/places";
import type { TransitStop } from "@/lib/transit";
import { isShortGoogleMapsLink, parseGoogleMapsUrl } from "@/lib/google-maps-link";

const PICKER_STYLE = "https://tiles.openfreemap.org/styles/bright";

function ensureRTLPlugin() {
  if (maplibregl.getRTLTextPluginStatus() !== "unavailable") return;
  maplibregl.setRTLTextPlugin("/mapbox-gl-rtl-text.js", true).catch(() => {});
}

type DrawMode = "route" | "stop";

type Props = {
  path: [number, number][];
  onPathChange: (path: [number, number][]) => void;
  routeStopIds: string[];
  onRouteStopIdsChange: (ids: string[]) => void;
  allStops: TransitStop[];
  color: string;
  onCreateStop: (lng: number, lat: number, name: string) => Promise<TransitStop | null>;
};

const EMPTY_LINE_FC = {
  type: "FeatureCollection" as const,
  features: [] as GeoJSON.Feature[],
};

export default function RoutePicker({
  path,
  onPathChange,
  routeStopIds,
  onRouteStopIdsChange,
  allStops,
  color,
  onCreateStop,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const vertexMarkersRef = useRef<maplibregl.Marker[]>([]);
  const stopMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const [mode, setMode] = useState<DrawMode>("route");
  const [newStopName, setNewStopName] = useState("");
  const [pendingStopPoint, setPendingStopPoint] = useState<
    [number, number] | null
  >(null);
  const [stopLinkUrl, setStopLinkUrl] = useState("");
  const [stopLinkState, setStopLinkState] = useState<
    "idle" | "loading" | "error"
  >("idle");

  // مراجع حيّة لتفادي إعادة تثبيت معالجات الأحداث
  const pathRef = useRef(path);
  const routeStopIdsRef = useRef(routeStopIds);
  const modeRef = useRef(mode);
  const colorRef = useRef(color);
  const onPathChangeRef = useRef(onPathChange);
  const onRouteStopIdsChangeRef = useRef(onRouteStopIdsChange);
  useEffect(() => {
    pathRef.current = path;
    routeStopIdsRef.current = routeStopIds;
    modeRef.current = mode;
    colorRef.current = color;
    onPathChangeRef.current = onPathChange;
    onRouteStopIdsChangeRef.current = onRouteStopIdsChange;
  });

  // تهيئة الخريطة مرة واحدة
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureRTLPlugin();

    const start: [number, number] =
      path.length > 0 ? path[0] : MEDINA_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: PICKER_STYLE,
      center: start,
      zoom: 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({}), "top-left");

    map.on("load", () => {
      applyArabicLabels(map);
      map.addSource("draft-route", { type: "geojson", data: EMPTY_LINE_FC });
      map.addLayer({
        id: "draft-route-line",
        type: "line",
        source: "draft-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": colorRef.current || "#2563eb",
          "line-width": 4,
          "line-dasharray": [2, 1.5],
        },
      });
    });

    map.on("click", (e) => {
      if (modeRef.current === "route") {
        const next: [number, number][] = [
          ...pathRef.current,
          [e.lngLat.lng, e.lngLat.lat],
        ];
        onPathChangeRef.current(next);
      } else {
        setPendingStopPoint([e.lngLat.lng, e.lngLat.lat]);
      }
    });

    return () => {
      for (const m of vertexMarkersRef.current) m.remove();
      vertexMarkersRef.current = [];
      for (const m of Object.values(stopMarkersRef.current)) m.remove();
      stopMarkersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // رسم خط المسودة + نقاط الرؤوس عند تغيّر المسار
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      const source = map.getSource("draft-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (source) {
        source.setData(
          path.length >= 2
            ? {
                type: "Feature",
                geometry: { type: "LineString", coordinates: path },
                properties: {},
              }
            : EMPTY_LINE_FC,
        );
      }
      for (const m of vertexMarkersRef.current) m.remove();
      vertexMarkersRef.current = path.map(([lng, lat], i) => {
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700`;
        el.textContent = String(i + 1);
        return new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
      });
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [path, color]);

  // مزامنة علامات المحطات المرتبطة بالخط
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = stopMarkersRef.current;
    const present = new Set<string>();
    routeStopIds.forEach((stopId, i) => {
      const stop = allStops.find((s) => s.id === stopId);
      if (!stop) return;
      present.add(stopId);
      const existing = markers[stopId];
      if (existing) {
        existing.setLngLat([stop.lng, stop.lat]);
        return;
      }
      const el = document.createElement("div");
      el.style.cssText =
        "width:22px;height:22px;border-radius:50%;background:#0ea5e9;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;cursor:pointer";
      el.title = "اضغط لإزالة المحطة من الخط";
      el.textContent = String(i + 1);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onRouteStopIdsChangeRef.current(
          routeStopIdsRef.current.filter((id) => id !== stopId),
        );
      });
      markers[stopId] = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
    });
    for (const id of Object.keys(markers)) {
      if (!present.has(id)) {
        markers[id].remove();
        delete markers[id];
      }
    }
    // إعادة كتابة الأرقام على العلامات المتبقية بعد أي حذف/إضافة
    routeStopIds.forEach((stopId, i) => {
      const marker = markers[stopId];
      if (marker) marker.getElement().textContent = String(i + 1);
    });
  }, [routeStopIds, allStops]);

  function undoLastPoint() {
    onPathChange(path.slice(0, -1));
  }

  function clearPath() {
    onPathChange([]);
  }

  /** يستخرج إحداثيات محطة من رابط خرائط جوجل بدل الضغط على الخريطة. */
  async function extractStopFromLink() {
    const url = stopLinkUrl.trim();
    if (!url) return;
    setStopLinkState("loading");

    const local = parseGoogleMapsUrl(url);
    if (local) {
      setPendingStopPoint([local.lng, local.lat]);
      setStopLinkState("idle");
      setStopLinkUrl("");
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [local.lng, local.lat], zoom: 16 });
      }
      return;
    }

    try {
      const res = await fetch(
        `/api/resolve-map-link?url=${encodeURIComponent(url)}`,
      );
      const data = await res.json();
      if (res.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
        setPendingStopPoint([Number(data.lng), Number(data.lat)]);
        setStopLinkState("idle");
        setStopLinkUrl("");
        mapRef.current?.flyTo({
          center: [Number(data.lng), Number(data.lat)],
          zoom: 16,
        });
      } else {
        setStopLinkState("error");
      }
    } catch {
      setStopLinkState("error");
    }
  }

  async function confirmNewStop() {
    if (!pendingStopPoint || !newStopName.trim()) return;
    const stop = await onCreateStop(
      pendingStopPoint[0],
      pendingStopPoint[1],
      newStopName.trim(),
    );
    if (stop) {
      onRouteStopIdsChange([...routeStopIds, stop.id]);
    }
    setPendingStopPoint(null);
    setNewStopName("");
  }

  function attachExistingStop(stopId: string) {
    if (routeStopIds.includes(stopId)) return;
    onRouteStopIdsChange([...routeStopIds, stopId]);
  }

  const unattachedStops = allStops.filter((s) => !routeStopIds.includes(s.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("route")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === "route"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500"
            }`}
          >
            رسم المسار
          </button>
          <button
            type="button"
            onClick={() => setMode("stop")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === "stop"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500"
            }`}
          >
            إضافة محطة
          </button>
        </div>
        {mode === "route" && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={undoLastPoint}
              disabled={path.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={clearPath}
              disabled={path.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              مسح الكل
            </button>
          </div>
        )}
        <span className="text-xs text-slate-400">
          {mode === "route"
            ? "اضغط على الخريطة لإضافة نقاط المسار بالترتيب."
            : "اضغط على الخريطة، أو الصق رابط خرائط جوجل، لوضع محطة جديدة."}
        </span>
      </div>

      {mode === "stop" && (
        <div className="flex items-center gap-2">
          <input
            value={stopLinkUrl}
            onChange={(e) => {
              setStopLinkUrl(e.target.value);
              if (stopLinkState !== "idle") setStopLinkState("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                extractStopFromLink();
              }
            }}
            placeholder="أو الصق رابط خرائط جوجل لموقع المحطة"
            dir="ltr"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-left outline-none focus:border-sky-500"
          />
          <button
            type="button"
            onClick={extractStopFromLink}
            disabled={stopLinkState === "loading" || !stopLinkUrl.trim()}
            className="shrink-0 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-40"
          >
            {stopLinkState === "loading" ? "جارٍ…" : "استخراج"}
          </button>
        </div>
      )}
      {mode === "stop" && stopLinkState === "error" && (
        <p className="text-xs text-red-600">
          تعذّر قراءة الإحداثيات من هذا الرابط. جرّب رابطًا آخر أو اضغط على
          الخريطة مباشرة.
        </p>
      )}
      {mode === "stop" &&
        stopLinkState === "idle" &&
        stopLinkUrl.trim() !== "" &&
        isShortGoogleMapsLink(stopLinkUrl) && (
          <p className="text-xs text-slate-400">
            رابط مختصر — سيُفكّ عبر الخادم عند الضغط على «استخراج».
          </p>
        )}

      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-lg border border-slate-200"
      />

      {pendingStopPoint && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
          <input
            autoFocus
            value={newStopName}
            onChange={(e) => setNewStopName(e.target.value)}
            placeholder="اسم المحطة"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
          />
          <button
            type="button"
            onClick={confirmNewStop}
            disabled={!newStopName.trim()}
            className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            إضافة
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingStopPoint(null);
              setNewStopName("");
            }}
            className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-white"
          >
            إلغاء
          </button>
        </div>
      )}

      {unattachedStops.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-slate-400">إرفاق محطة موجودة:</span>
          {unattachedStops.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => attachExistingStop(s.id)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}

      {routeStopIds.length > 0 && (
        <ol className="space-y-1 text-sm">
          {routeStopIds.map((stopId, i) => {
            const stop = allStops.find((s) => s.id === stopId);
            return (
              <li
                key={stopId}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5"
              >
                <span>
                  {i + 1}. {stop?.name ?? stopId}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (i === 0) return;
                      const next = [...routeStopIds];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      onRouteStopIdsChange(next);
                    }}
                    disabled={i === 0}
                    className="rounded px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (i === routeStopIds.length - 1) return;
                      const next = [...routeStopIds];
                      [next[i + 1], next[i]] = [next[i], next[i + 1]];
                      onRouteStopIdsChange(next);
                    }}
                    disabled={i === routeStopIds.length - 1}
                    className="rounded px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRouteStopIdsChange(
                        routeStopIds.filter((id) => id !== stopId),
                      )
                    }
                    className="rounded px-1.5 text-red-500 hover:text-red-700"
                  >
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
