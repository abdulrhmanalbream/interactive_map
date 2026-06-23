import type { IconType } from "react-icons";
import { FaBagShopping, FaBus, FaLandmark, FaMosque } from "react-icons/fa6";
import type { PlaceCategory } from "./places";

/** مكوّن أيقونة (SVG) لكل تصنيف — من Font Awesome عبر react-icons. */
export const CATEGORY_ICON: Record<PlaceCategory, IconType> = {
  mosque: FaMosque,
  landmark: FaLandmark,
  transport: FaBus,
  commercial: FaBagShopping,
};
