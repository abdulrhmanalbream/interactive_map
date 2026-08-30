export type TransitRoute = {
  id: string;
  name: string;
  nameEn: string;
  /** لون خط المسار (hex) — يُستخدم أيضًا كلون افتراضي لمحطاته. */
  color: string;
  description: string;
  /** مسار الخط كمصفوفة إحداثيات [خط الطول، خط العرض] بالترتيب. */
  path: [number, number][];
  /** معرّفات محطات الخط بترتيب مرورها (فارغة إن لم تُربط محطات). */
  stopIds: string[];
  /** بداية ونهاية فترة تشغيل الخط بصيغة "HH:MM" (اختياري). */
  scheduleStart: string;
  scheduleEnd: string;
  /** التردد بالدقائق بين رحلة وأخرى (0 = غير مُستخدم). */
  frequencyMinutes: number;
  /** مواعيد ثابتة "HH:MM" بدل التردد (فارغة = غير مُستخدمة). */
  fixedTimes: string[];
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
