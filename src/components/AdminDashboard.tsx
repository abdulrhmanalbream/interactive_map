"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MEDINA_CENTER,
  type Place,
  type PlaceCategory,
} from "@/lib/places";
import { isShortGoogleMapsLink, parseGoogleMapsUrl } from "@/lib/google-maps-link";

// منتقي الموقع يعتمد على MapLibre (window) — نحمّله في المتصفح فقط
const LocationPicker = dynamic(() => import("./LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-500">
      جارٍ تحميل الخريطة…
    </div>
  ),
});

type LinkState = "idle" | "loading" | "ok" | "error";

type FormState = {
  name: string;
  nameEn: string;
  category: PlaceCategory;
  lng: string;
  lat: string;
  description: string;
  imageUrl: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  nameEn: "",
  category: "mosque",
  lng: String(MEDINA_CENTER[0]),
  lat: String(MEDINA_CENTER[1]),
  description: "",
  imageUrl: "",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // إدخال الموقع: رابط جوجل + منتقي الخريطة
  const [linkUrl, setLinkUrl] = useState("");
  const [linkState, setLinkState] = useState<LinkState>("idle");
  const [showPicker, setShowPicker] = useState(false);

  // رفع صورة المكان
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  function resetLinkState() {
    setLinkUrl("");
    setLinkState("idle");
    setUploadError(null);
  }

  /** رفع صورة إلى R2 ووضع رابطها في النموذج. */
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // اسمح بإعادة اختيار نفس الملف
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        set("imageUrl", data.url);
      } else {
        setUploadError(
          res.status === 503
            ? "التخزين غير مُهيّأ — أضف مفاتيح R2 في .env.local."
            : res.status === 413
              ? "حجم الصورة كبير (الحد 5 ميجابايت)."
              : res.status === 415
                ? "نوع الصورة غير مدعوم."
                : "فشل الرفع. حاول مجددًا.",
        );
      }
    } catch {
      setUploadError("خطأ في الاتصال.");
    } finally {
      setUploading(false);
    }
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    resetLinkState();
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
      imageUrl: p.imageUrl ?? "",
    });
    setError(null);
    resetLinkState();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** يحدّث حقلي الإحداثيات بدقّة معقولة (6 خانات ≈ 0.1م). */
  function setCoords(lng: number, lat: number) {
    setForm((f) => ({ ...f, lng: lng.toFixed(6), lat: lat.toFixed(6) }));
  }

  /** استخراج الإحداثيات من رابط جوجل ماب (محليًا، ثم عبر الخادم للروابط المختصرة). */
  async function extractFromLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinkState("loading");

    const local = parseGoogleMapsUrl(url);
    if (local) {
      setCoords(local.lng, local.lat);
      setLinkState("ok");
      return;
    }

    // الروابط المختصرة (maps.app.goo.gl) تُفكّ على الخادم
    try {
      const res = await fetch(
        `/api/resolve-map-link?url=${encodeURIComponent(url)}`,
      );
      const data = await res.json();
      if (res.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
        setCoords(Number(data.lng), Number(data.lat));
        setLinkState("ok");
      } else {
        setLinkState("error");
      }
    } catch {
      setLinkState("error");
    }
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
      imageUrl: form.imageUrl,
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

  // الإحداثيات الرقمية الحالية (null إذا كان الحقل فارغًا/غير صالح)
  const lngNum = form.lng.trim() === "" ? NaN : Number(form.lng);
  const latNum = form.lat.trim() === "" ? NaN : Number(form.lat);
  const coordsValid = Number.isFinite(lngNum) && Number.isFinite(latNum);

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

        {/* الموقع: ثلاث طرق — رابط جوجل، إدخال يدوي، أو تحديد من الخريطة */}
        <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="mb-2 block text-sm font-medium text-slate-600">
            الموقع *
          </span>

          {/* 1) رابط خرائط جوجل */}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">
              لصق رابط من خرائط جوجل
            </span>
            <div className="flex gap-2">
              <input
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  if (linkState !== "idle") setLinkState("idle");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    extractFromLink();
                  }
                }}
                placeholder="https://maps.app.goo.gl/…  أو  https://www.google.com/maps/@24.46,39.61…"
                dir="ltr"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-teal-500"
              />
              <button
                type="button"
                onClick={extractFromLink}
                disabled={linkState === "loading" || !linkUrl.trim()}
                className="shrink-0 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-40"
              >
                {linkState === "loading" ? "جارٍ…" : "استخراج"}
              </button>
            </div>
            {linkState === "ok" && (
              <span className="mt-1 block text-xs text-teal-600">
                ✓ تم استخراج الإحداثيات من الرابط.
              </span>
            )}
            {linkState === "error" && (
              <span className="mt-1 block text-xs text-red-600">
                تعذّر قراءة الإحداثيات من هذا الرابط. جرّب رابطًا آخر أو حدّد من
                الخريطة.
              </span>
            )}
            {linkState === "idle" && linkUrl.trim() !== "" &&
              isShortGoogleMapsLink(linkUrl) && (
                <span className="mt-1 block text-xs text-slate-400">
                  رابط مختصر — سيُفكّ عبر الخادم عند الضغط على «استخراج».
                </span>
              )}
          </label>

          {/* 2) إدخال يدوي */}
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="mb-1 block text-slate-500">خط الطول (lng)</span>
              <input
                value={form.lng}
                onChange={(e) => set("lng", e.target.value)}
                inputMode="decimal"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
              />
            </label>
            <label>
              <span className="mb-1 block text-slate-500">خط العرض (lat)</span>
              <input
                value={form.lat}
                onChange={(e) => set("lat", e.target.value)}
                inputMode="decimal"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-500"
              />
            </label>
          </div>

          {/* 3) تحديد من الخريطة */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              🗺️ {showPicker ? "إخفاء الخريطة" : "تحديد من الخريطة"}
            </button>
            {coordsValid && (
              <a
                href={`https://www.google.com/maps?q=${latNum},${lngNum}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-600 hover:underline"
              >
                معاينة على خرائط جوجل ↗
              </a>
            )}
          </div>

          {showPicker && (
            <div className="mt-2">
              <p className="mb-1.5 text-xs text-slate-500">
                اضغط على الخريطة أو اسحب الدبوس لتحديد الموقع.
              </p>
              <LocationPicker
                lng={coordsValid ? lngNum : null}
                lat={coordsValid ? latNum : null}
                onChange={setCoords}
              />
            </div>
          )}
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

        {/* صورة / لوقو المكان */}
        <div className="col-span-full text-sm">
          <span className="mb-1 block text-slate-500">صورة / لوقو (اختياري)</span>
          <div className="flex items-start gap-3">
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.imageUrl}
                alt="معاينة"
                className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                لا صورة
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  {uploading ? "جارٍ الرفع…" : "رفع صورة"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => set("imageUrl", "")}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    إزالة
                  </button>
                )}
              </div>
              <input
                value={form.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="أو الصق رابط صورة مباشر"
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-teal-500"
              />
              {uploadError && (
                <span className="block text-xs text-red-600">{uploadError}</span>
              )}
            </div>
          </div>
        </div>

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
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                  />
                )}
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
