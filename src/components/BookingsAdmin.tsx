"use client";

import { useEffect, useState } from "react";

type Booking = {
  id: string;
  placeId: string;
  placeName: string;
  name: string;
  phone: string;
  partySize: number;
  price: number;
  referenceCode: string;
  createdAt: number;
};

export default function BookingsAdmin() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setBookings(d.bookings ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5">
        <h2 className="font-semibold text-slate-700">
          الحجوزات ({bookings.length})
        </h2>
      </div>
      {loading ? (
        <p className="p-4 text-sm text-slate-500">جارٍ التحميل…</p>
      ) : bookings.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">لا توجد حجوزات بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                <th className="px-4 py-2 font-medium">المكان</th>
                <th className="px-4 py-2 font-medium">الاسم</th>
                <th className="px-4 py-2 font-medium">الجوال</th>
                <th className="px-4 py-2 font-medium">الأفراد</th>
                <th className="px-4 py-2 font-medium">السعر</th>
                <th className="px-4 py-2 font-medium">الرقم المرجعي</th>
                <th className="px-4 py-2 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {b.placeName}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{b.name}</td>
                  <td className="px-4 py-2.5 text-slate-600" dir="ltr">
                    {b.phone}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{b.partySize}</td>
                  <td className="px-4 py-2.5 text-slate-600">{b.price} ريال</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                    {b.referenceCode}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {new Date(b.createdAt).toLocaleString("ar")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
