"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { TransitRoute, TransitStop } from "@/lib/transit";

const RoutePicker = dynamic(() => import("./RoutePicker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-500">
      جارٍ تحميل الخريطة…
    </div>
  ),
});

type FormState = {
  name: string;
  nameEn: string;
  color: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  nameEn: "",
  color: "#2563eb",
  description: "",
};

export default function TransitAdmin() {
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [path, setPath] = useState<[number, number][]>([]);
  const [routeStopIds, setRouteStopIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [routesRes, stopsRes] = await Promise.all([
      fetch("/api/transit/routes").then((r) => r.json()),
      fetch("/api/transit/stops").then((r) => r.json()),
    ]);
    setRoutes(routesRes.routes ?? []);
    setStops(stopsRes.stops ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/transit/routes").then((r) => r.json()),
      fetch("/api/transit/stops").then((r) => r.json()),
    ]).then(([routesRes, stopsRes]) => {
      if (!active) return;
      setRoutes(routesRes.routes ?? []);
      setStops(stopsRes.stops ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPath([]);
    setRouteStopIds([]);
    setError(null);
  }

  async function startEdit(route: TransitRoute) {
    setEditingId(route.id);
    setForm({
      name: route.name,
      nameEn: route.nameEn,
      color: route.color,
      description: route.description,
    });
    setPath(route.path);
    setError(null);
    try {
      const res = await fetch(`/api/transit/routes/${route.id}/stops`);
      const data = await res.json();
      setRouteStopIds(data.stopIds ?? []);
    } catch {
      setRouteStopIds([]);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createStopOnMap(
    lng: number,
    lat: number,
    name: string,
  ): Promise<TransitStop | null> {
    const res = await fetch("/api/transit/stops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, lng, lat }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const stop = data.stop as TransitStop;
    setStops((list) => [...list, stop]);
    return stop;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (path.length < 2) {
      setError("ارسم مسار الخط بنقطتين على الأقل.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      nameEn: form.nameEn,
      color: form.color,
      description: form.description,
      path,
    };
    const url = editingId
      ? `/api/transit/routes/${editingId}`
      : "/api/transit/routes";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setSaving(false);
      setError("تحقّق من الحقول (الاسم واللون والمسار مطلوبة).");
      return;
    }
    const data = await res.json();
    const routeId = editingId ?? data.route.id;
    await fetch(`/api/transit/routes/${routeId}/stops`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopIds: routeStopIds }),
    });
    setSaving(false);
    startCreate();
    loadAll();
  }

  async function removeRoute(id: string) {
    if (!confirm("حذف هذا الخط؟")) return;
    const res = await fetch(`/api/transit/routes/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) startCreate();
      loadAll();
    }
  }

  async function removeStop(id: string) {
    if (!confirm("حذف هذه المحطة نهائيًا؟ سيُزال ارتباطها بكل الخطوط.")) return;
    const res = await fetch(`/api/transit/stops/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRouteStopIds((ids) => ids.filter((sid) => sid !== id));
      loadAll();
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <h2 className="col-span-full font-semibold text-slate-700">
          {editingId ? "تعديل خط نقل" : "إضافة خط نقل جديد"}
        </h2>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">الاسم (عربي) *</span>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">الاسم (إنجليزي)</span>
          <input
            value={form.nameEn}
            onChange={(e) => set("nameEn", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">لون الخط</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              className="h-9 w-14 shrink-0 rounded border border-slate-300"
            />
            <input
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              dir="ltr"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-teal-500"
            />
          </div>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">الوصف</span>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
          />
        </label>

        <div className="col-span-full">
          <span className="mb-1 block text-sm text-slate-500">
            رسم المسار والمحطات *
          </span>
          <RoutePicker
            path={path}
            onPathChange={setPath}
            routeStopIds={routeStopIds}
            onRouteStopIdsChange={setRouteStopIds}
            allStops={stops}
            color={form.color}
            onCreateStop={createStopOnMap}
          />
        </div>

        {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

        <div className="col-span-full flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40"
          >
            {saving ? "جارٍ الحفظ…" : editingId ? "حفظ التعديل" : "إضافة"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              إلغاء
            </button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="font-semibold text-slate-700">
            خطوط النقل ({routes.length})
          </h2>
          <button
            onClick={startCreate}
            className="text-sm text-teal-600 hover:underline"
          >
            + جديد
          </button>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">جارٍ التحميل…</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {routes.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{r.name}</div>
                  <div className="truncate text-xs text-slate-400">
                    {r.path.length} نقطة مسار
                  </div>
                </div>
                <button
                  onClick={() => startEdit(r)}
                  className="rounded-md px-2 py-1 text-teal-600 hover:bg-teal-50"
                >
                  تعديل
                </button>
                <button
                  onClick={() => removeRoute(r.id)}
                  className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h2 className="font-semibold text-slate-700">
            كل المحطات ({stops.length})
          </h2>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">جارٍ التحميل…</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stops.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{s.name}</div>
                  <div className="truncate text-xs text-slate-400">
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)} · يخدمها{" "}
                    {s.routeIds.length} خط
                  </div>
                </div>
                <button
                  onClick={() => removeStop(s.id)}
                  className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
