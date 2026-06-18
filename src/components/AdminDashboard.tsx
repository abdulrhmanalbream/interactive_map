"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MEDINA_CENTER,
  type Place,
  type PlaceCategory,
} from "@/lib/places";

type FormState = {
  name: string;
  nameEn: string;
  category: PlaceCategory;
  lng: string;
  lat: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  nameEn: "",
  category: "mosque",
  lng: String(MEDINA_CENTER[0]),
  lat: String(MEDINA_CENTER[1]),
  description: "",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadPlaces() {
    setLoading(true);
    const res = await fetch("/api/places");
    const data = await res.json();
    setPlaces(data.places ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/places")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setPlaces(d.places ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(p: Place) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      nameEn: p.nameEn,
      category: p.category,
      lng: String(p.lng),
      lat: String(p.lat),
      description: p.description,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      nameEn: form.nameEn,
      category: form.category,
      lng: Number(form.lng),
      lat: Number(form.lat),
      description: form.description,
    };
    const url = editingId ? `/api/places/${editingId}` : "/api/places";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError(
        res.status === 400
          ? "تحقّق من الحقول (الاسم والإحداثيات مطلوبة وصحيحة)."
          : "فشلت العملية. حاول مجددًا.",
      );
      return;
    }
    startCreate();
    loadPlaces();
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا المكان؟")) return;
    const res = await fetch(`/api/places/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) startCreate();
      loadPlaces();
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">لوحة الأدمن</h1>
          <p className="text-sm text-slate-500">إدارة معالم الخريطة</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            عرض الخريطة
          </Link>
          <button
            onClick={logout}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            خروج
          </button>
        </div>
      </header>

      {/* النموذج */}
      <form
        onSubmit={submit}
        className="mb-8 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <h2 className="col-span-full font-semibold text-slate-700">
          {editingId ? "تعديل مكان" : "إضافة مكان جديد"}
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
          <span className="mb-1 block text-slate-500">التصنيف</span>
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value as PlaceCategory)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="mb-1 block text-slate-500">خط الطول (lng) *</span>
            <input
              value={form.lng}
              onChange={(e) => set("lng", e.target.value)}
              inputMode="decimal"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>
          <label>
            <span className="mb-1 block text-slate-500">خط العرض (lat) *</span>
            <input
              value={form.lat}
              onChange={(e) => set("lat", e.target.value)}
              inputMode="decimal"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>
        </div>

        <label className="col-span-full text-sm">
          <span className="mb-1 block text-slate-500">الوصف</span>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
          />
        </label>

        {error && (
          <p className="col-span-full text-sm text-red-600">{error}</p>
        )}

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

      {/* الجدول */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="font-semibold text-slate-700">
            المعالم ({places.length})
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
            {places.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">
                    {p.name}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {CATEGORY_LABELS[p.category]} · {p.lat.toFixed(4)},{" "}
                    {p.lng.toFixed(4)}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="rounded-md px-2 py-1 text-teal-600 hover:bg-teal-50"
                >
                  تعديل
                </button>
                <button
                  onClick={() => remove(p.id)}
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
