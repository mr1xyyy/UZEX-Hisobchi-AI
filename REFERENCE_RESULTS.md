# Beshta nazorat savolining tekshiruvi

Manba: loyihadagi CSV’lar. Standart qamrov: barcha savdo shakllari, `Аннулирован...` statuslarisiz. Javoblar bot kodi bilan bir xil SQL kompilyatori orqali CSV’dan tuzilgan 500 000 yozuvli lokal SQLite bazasida tekshirildi. Jonli Neon tekshiruvi uchun `DATABASE_URL` kerak.

| Savol | SQL natijasi |
|---|---|
| 2024-yilda eng ko‘p xarid qilgan kompaniya | `"Zoket Invest" OK`, STIR `983531029`; **1 169 958 734 081,17 so‘m**, yaxlitlaganda 1 169 958 734 081 |
| 2025-yilda Samarqandda sotilgan bug‘doy | **36 943 tonna**, **143 bitim** |
| 2025-yilda paxta xomashyosi 1-sort, o‘rtacha narx | **9 755,48 so‘m/kg**, **13 407 bitim** |
| 2025-yilda eksportning summa bo‘yicha ulushi | **4,87%** (SQL: 4,8673439337650715%) |
| 2023-yilda Namangan bitimlari | **11 346 ta**; bekor qilinganlar bilan **12 223 ta** |

## Oldingi farqlarning sabablari

1. Oldingi import faqat 456 724 spot bitimni olgan. Birinchi, uchinchi, to‘rtinchi va beshinchi nazorat savoli barcha savdo shakllarini talab qiladi.
2. Oldingi hisoblash bekor qilinganlarni ham qo‘shgan. Nazorat javoblari ularni chiqarib tashlaydi.
3. Oldingi sort sharti `сорт 1` iborasini `2 сорт 1 класс` ichidan ham topgan. Endi mahsulot nomidan birinchi haqiqiy sort ajratilib, `product_grade` ustuniga yoziladi; klass raqami sort o‘rniga olinmaydi.
4. Hudud va eksport ulushi oldingi JSON reja formatida yo‘q edi. Endi hudud ikki tildan umumiy kodga normalizatsiya qilinadi; eksport ulushining surat va maxraji bir xil filtrlar bilan hisoblanadi.

## Neon’ni yangilash

Eski DB’ni o‘chirish kerak emas. Quyidagi tartibda bajaring:

```powershell
node scripts/import_neon.js ../uzex_spot_data
node scripts/import_neon.js --check
node scripts/verify_queries.js --neon
npx tgcloud push
```

v2 import yangi ustunlarni o‘zi qo‘shadi va primary key bo‘yicha bitimlarni yangilaydi. Kutilgan qamrov: `deals=500000`, `active_deals=466281`. Eski spot import progressi qayta ishlatilmaydi; yangi v2 progress tasdiqlangan batchdan davom etadi.

## Lokal regressiyani takrorlash

```powershell
npm test
node scripts/verify_queries.js
```

`verify_queries.js` modelga murojaat qilmaydi: CSV → lokal baza → haqiqiy kompilyatsiya qilingan SQL. `REGRESSION_RESULTS.json` dagi sonlar bazadan chiqarilgan; ular bot javobiga hardcode qilinmagan. Savolning DeepSeek tomonidan rejaga aylantirilishi alohida `scripts/check_bot.js --answer "..."` orqali jonli tekshiriladi.
