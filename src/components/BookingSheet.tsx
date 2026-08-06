"use client";

import { useState } from "react";
import { FaCheck, FaTicket, FaXmark } from "react-icons/fa6";
import BookingQR from "./BookingQR";

type Props = {
  placeId: string;
  placeName: string;
  price: number;
  onClose: () => void;
};

type Confirmation = {
  referenceCode: string;
  partySize: number;
};

export default function BookingSheet({
  placeId,
  placeName,
  price,
  onClose,
}: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId,
          name,
          phone,
          partySize: Number(partySize) || 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.booking) {
        setError("تعذّر إتمام الحجز. حاول مجددًا.");
        return;
      }
      setConfirmation({
        referenceCode: data.booking.referenceCode,
        partySize: data.booking.partySize,
      });
    } catch {
      setError("خطأ في الاتصال. حاول مجددًا.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-white p-4 pb-6 shadow-2xl ring-1 ring-black/5 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[390px] sm:rounded-3xl">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

      {!confirmation ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
                <FaTicket className="text-amber-500" />
                حجز {placeName}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                السعر: {price} ريال للحجز الواحد
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <FaXmark />
            </button>
          </div>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">الاسم *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">الجوال *</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                required
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-amber-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">عدد الأفراد</span>
              <input
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                type="number"
                min={1}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "جارٍ الحجز…" : "تأكيد الحجز"}
            </button>
            <p className="text-center text-xs text-slate-400">
              حجز تجريبي بدون دفع فعلي — سيُولَّد رقم مرجعي وباركود عند التأكيد.
            </p>
          </form>
        </>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <FaCheck className="text-xl" />
          </div>
          <h2 className="text-base font-bold text-slate-800">تم الحجز بنجاح</h2>
          <p className="mt-1 text-sm text-slate-500">
            {placeName} · {confirmation.partySize}{" "}
            {confirmation.partySize === 1 ? "فرد" : "أفراد"}
          </p>
          <div className="mt-4 flex justify-center">
            <BookingQR value={confirmation.referenceCode} />
          </div>
          <p className="mt-3 font-mono text-lg tracking-widest text-slate-800">
            {confirmation.referenceCode}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            احتفظ بهذا الرقم أو الباركود عند الوصول.
          </p>
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            إغلاق
          </button>
        </div>
      )}
    </div>
  );
}
