import type { Metadata } from "next";
// خط Cairo مستضاف محليًا (لا اتصال بـ Google Fonts وقت البناء)
import "@fontsource-variable/cairo/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "خريطة المدينة المنورة التفاعلية",
  description: "خريطة تفاعلية خفيفة مبنية على MapLibre و OpenStreetMap",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
