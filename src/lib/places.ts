export type PlaceCategory = "mosque" | "landmark" | "transport" | "commercial";

export type Place = {
  id: string;
  name: string;
  nameEn: string;
  category: PlaceCategory;
  lng: number;
  lat: number;
  description: string;
};

/** مركز المدينة المنورة الافتراضي للخريطة [خط الطول، خط العرض] */
export const MEDINA_CENTER: [number, number] = [39.6142, 24.4686];
export const DEFAULT_ZOOM = 12;

/**
 * نقاط تجريبية لمعالم المدينة المنورة.
 * ملاحظة: بعض الإحداثيات تقريبية لأغراض العرض التجريبي.
 */
export const PLACES: Place[] = [
  // --- مساجد ---
  {
    id: "nabawi",
    name: "المسجد النبوي الشريف",
    nameEn: "Al-Masjid an-Nabawi",
    category: "mosque",
    lng: 39.6111,
    lat: 24.4672,
    description: "ثاني الحرمين الشريفين وقلب المدينة المنورة.",
  },
  {
    id: "quba",
    name: "مسجد قباء",
    nameEn: "Quba Mosque",
    category: "mosque",
    lng: 39.6169,
    lat: 24.4395,
    description: "أول مسجد بُني في الإسلام.",
  },
  {
    id: "qiblatain",
    name: "مسجد القبلتين",
    nameEn: "Masjid al-Qiblatain",
    category: "mosque",
    lng: 39.5786,
    lat: 24.4842,
    description: "المسجد الذي تحوّلت فيه القبلة نحو الكعبة.",
  },
  {
    id: "ghamama",
    name: "مسجد الغمامة",
    nameEn: "Al-Ghamama Mosque",
    category: "mosque",
    lng: 39.6097,
    lat: 24.4661,
    description: "مسجد تاريخي قريب من المسجد النبوي.",
  },
  {
    id: "abubakr",
    name: "مسجد أبي بكر الصديق",
    nameEn: "Abu Bakr Mosque",
    category: "mosque",
    lng: 39.609,
    lat: 24.4655,
    description: "من المساجد التاريخية وسط المدينة.",
  },
  {
    id: "jumuah",
    name: "مسجد الجمعة",
    nameEn: "Al-Jumuah Mosque",
    category: "mosque",
    lng: 39.6047,
    lat: 24.4535,
    description: "موضع أول صلاة جمعة في الإسلام.",
  },
  {
    id: "fath",
    name: "مسجد الفتح",
    nameEn: "Al-Fath Mosque",
    category: "mosque",
    lng: 39.6018,
    lat: 24.4772,
    description: "أحد مساجد جبل سلع التاريخية.",
  },

  // --- معالم ---
  {
    id: "uhud",
    name: "جبل أُحد",
    nameEn: "Mount Uhud",
    category: "landmark",
    lng: 39.6147,
    lat: 24.5108,
    description: "موقع غزوة أُحد التاريخية شمال المدينة.",
  },
  {
    id: "baqi",
    name: "مقبرة البقيع",
    nameEn: "Al-Baqi Cemetery",
    category: "landmark",
    lng: 39.6169,
    lat: 24.4669,
    description: "أشهر مقابر المدينة المنورة بجوار المسجد النبوي.",
  },
  {
    id: "uhud-martyrs",
    name: "مقبرة شهداء أُحد",
    nameEn: "Uhud Martyrs Cemetery",
    category: "landmark",
    lng: 39.6128,
    lat: 24.5045,
    description: "مدفن شهداء غزوة أُحد عند سفح الجبل.",
  },
  {
    id: "jabal-sala",
    name: "جبل سلع",
    nameEn: "Mount Sala",
    category: "landmark",
    lng: 39.6005,
    lat: 24.4755,
    description: "جبل تاريخي وسط المدينة المنورة.",
  },
  {
    id: "seerah-museum",
    name: "متحف دار المدينة (السيرة النبوية)",
    nameEn: "Dar Al Madinah Museum",
    category: "landmark",
    lng: 39.6041,
    lat: 24.4693,
    description: "متحف يوثّق تاريخ وعمارة المدينة المنورة.",
  },
  {
    id: "quran-complex",
    name: "مجمع الملك فهد لطباعة المصحف",
    nameEn: "King Fahd Quran Printing Complex",
    category: "landmark",
    lng: 39.556,
    lat: 24.4998,
    description: "أكبر مجمع لطباعة المصحف الشريف في العالم.",
  },
  {
    id: "taibah-university",
    name: "جامعة طيبة",
    nameEn: "Taibah University",
    category: "landmark",
    lng: 39.7,
    lat: 24.539,
    description: "الجامعة الحكومية الرئيسية في المدينة المنورة.",
  },

  // --- مواصلات ---
  {
    id: "haramain",
    name: "محطة قطار الحرمين السريع",
    nameEn: "Haramain High Speed Railway Station",
    category: "transport",
    lng: 39.7041,
    lat: 24.5497,
    description: "محطة القطار الرابطة بين المدينة ومكة وجدة.",
  },
  {
    id: "airport",
    name: "مطار الأمير محمد بن عبدالعزيز",
    nameEn: "Prince Mohammad bin Abdulaziz Airport",
    category: "transport",
    lng: 39.7051,
    lat: 24.5534,
    description: "المطار الدولي الذي يخدم المدينة المنورة.",
  },
  {
    id: "central-bus",
    name: "محطة النقل الجماعي المركزية",
    nameEn: "Central Bus Station",
    category: "transport",
    lng: 39.6155,
    lat: 24.4762,
    description: "محطة الحافلات الرئيسية وسط المدينة.",
  },

  // --- تجاري ---
  {
    id: "alnoor-mall",
    name: "النور مول",
    nameEn: "Al Noor Mall",
    category: "commercial",
    lng: 39.6357,
    lat: 24.4808,
    description: "أحد أكبر المراكز التجارية في المدينة.",
  },
  {
    id: "rashid-mall",
    name: "الراشد ميجا مول",
    nameEn: "Al Rashid Mega Mall",
    category: "commercial",
    lng: 39.6298,
    lat: 24.4628,
    description: "مركز تسوّق كبير شرق المدينة.",
  },
  {
    id: "dates-market",
    name: "سوق التمور المركزي",
    nameEn: "Central Dates Market",
    category: "commercial",
    lng: 39.6122,
    lat: 24.4702,
    description: "سوق شهير لبيع تمور المدينة المنورة.",
  },
  {
    id: "taibah-mall",
    name: "طيبة مول",
    nameEn: "Taibah Mall",
    category: "commercial",
    lng: 39.5985,
    lat: 24.4585,
    description: "مركز تسوّق غرب المدينة المنورة.",
  },
];

export const CATEGORY_COLORS: Record<PlaceCategory, string> = {
  mosque: "#0d9488",
  landmark: "#d97706",
  transport: "#2563eb",
  commercial: "#7c3aed",
};

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  mosque: "مساجد",
  landmark: "معالم",
  transport: "مواصلات",
  commercial: "تجاري",
};

export const CATEGORY_ORDER: PlaceCategory[] = [
  "mosque",
  "landmark",
  "transport",
  "commercial",
];
