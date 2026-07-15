# Nexus Switcher

تطبيق سطح مكتب (Electron) لإدارة حسابات Steam وتبديلها، مع دعم منصات أخرى ومكتبة ألعاب ومراقبة أداء.

## المتطلبات

- Windows 10/11
- [Node.js](https://nodejs.org/) 18+
- Steam مثبت (للميزات الخاصة بستيم)

## التثبيت والتشغيل

```bash
npm install
npm start
```

`npm install` ينسخ Font Awesome محلياً ويُنشئ `icon.png` إن لم يكن موجوداً.

## البناء (مثبت Windows)

```bash
npm run build
```

المخرجات في مجلد `dist/`.

## حفظ البيانات

إعدادات الحسابات والملاحظات وأوقات اللعب تُحفظ في:

`%APPDATA%/nexus-switcher/nexus-data/`

عند الترقية من إصدار قديم، يتم نسخ الملفات تلقائياً من مجلد التطبيق إن وُجدت.

## الميزات الرئيسية

- تبديل حسابات Steam (VDF + Registry)
- جلسات Epic / EA / Riot / Ubisoft / Battle.net
- مكتبة ألعاب موحدة
- نسخ احتياطي JSON + نسخ مجلدات Steam
- مراقبة أداء، VRAM optimizer، حالة خوادم Steam
- عربي / English

## الترخيص

مشروع شخصي — Copyright © DarkG
