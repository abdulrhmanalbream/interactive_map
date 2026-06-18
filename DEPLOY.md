# دليل النشر — Vercel + Turso (مجاني بدون بطاقة)

## 1) رفع الكود إلى GitHub
```bash
git add -A
git commit -m "Map app with backend, DB and admin"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```
> الأسرار (`.env.local`) وقاعدة البيانات المحلية (`local.db`) **محجوبة** ولن تُرفع. يُرفع `.env.example` فقط كقالب.

## 2) إنشاء قاعدة بيانات Turso
1. ادخل **https://turso.tech** وسجّل (عبر GitHub — مجاني بدون بطاقة).
2. أنشئ قاعدة بيانات (Create Database) واختر أقرب منطقة.
3. انسخ **Database URL** (يبدأ بـ `libsql://...`).
4. أنشئ **Auth Token** للقاعدة وانسخه.

## 3) ربط المشروع بـ Vercel
1. ادخل **https://vercel.com** وسجّل عبر GitHub (مجاني).
2. **Add New → Project** ثم استورد مستودع GitHub.
3. سيُكتشف Next.js تلقائيًا — لا تغيّر شيئًا.
4. أضِف **Environment Variables**:

| المتغير | القيمة |
|---------|--------|
| `ADMIN_PASSWORD` | كلمة مرور لوحة الأدمن (اختر واحدة) |
| `AUTH_SECRET` | سلسلة عشوائية طويلة (انظر أدناه) |
| `DATABASE_URL` | رابط Turso (`libsql://...`) |
| `DATABASE_AUTH_TOKEN` | توكن Turso |

5. اضغط **Deploy**.

### توليد AUTH_SECRET
```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 4) بعد النشر
- افتح رابط Vercel → الخريطة تشتغل.
- أول طلب يُنشئ الجدول ويعبّئ البيانات التجريبية في Turso **تلقائيًا** (بدون migration).
- لوحة الأدمن على `<your-url>/admin`.

## ملاحظات
- لتحديث الموقع لاحقًا: ادفع لـ GitHub (`git push`) وVercel ينشر تلقائيًا.
- لتغيير كلمة مرور الأدمن: عدّل `ADMIN_PASSWORD` في إعدادات Vercel ثم أعد النشر (Redeploy).
