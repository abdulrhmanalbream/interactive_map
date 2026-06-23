import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  extForType,
  isR2Configured,
  MAX_IMAGE_BYTES,
  uploadImage,
} from "@/lib/r2";

// رفع صورة مكان إلى Cloudflare R2 — للأدمن فقط
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json({ error: "r2_not_configured" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!extForType(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  try {
    const url = await uploadImage(await file.arrayBuffer(), file.type);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[upload] R2 upload failed:", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
}
