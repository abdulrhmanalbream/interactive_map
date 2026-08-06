export type TransitRoute = {
  id: string;
  name: string;
  nameEn: string;
  /** لون خط المسار (hex) — يُستخدم أيضًا كلون افتراضي لمحطاته. */
  color: string;
  description: string;
  /** مسار الخط كمصفوفة إحداثيات [خط الطول، خط العرض] بالترتيب. */
  path: [number, number][];
};

export type TransitStop = {
  id: string;
  name: string;
  nameEn: string;
  lng: number;
  lat: number;
  /** معرّفات الخطوط التي تخدمها هذه المحطة. */
  routeIds: string[];
};
