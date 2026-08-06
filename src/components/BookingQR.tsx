"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  value: string;
  size?: number;
};

/** يرسم رمز QR محليًا بالكامل (بدون أي طلب شبكي) لتمثيل رقم الحجز المرجعي. */
export default function BookingQR({ value, size = 176 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => {
      /* تجاهل فشل الرسم — الرقم المرجعي النصي يبقى معروضًا بجانبه */
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl ring-1 ring-slate-200"
    />
  );
}
