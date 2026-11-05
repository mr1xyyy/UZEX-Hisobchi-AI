# CSV ma’lumotlar auditi

Tekshirilgan manba: `../uzex_spot_data`. Audit barcha 500 000 bitimni, 6 616 shartnomani, 14 392 ishtirokchini, 120 brokerni va 1 765 kurs yozuvini qamrab oldi. Bu CSV auditi; Neon qiymatlari bilan satrma-satr solishtirish bajarilmadi. Asl CSV fayllar o‘zgartirilmadi.

## Standartlashtirish kerak bo‘lgan joylar

| Holat | Kuzatuv | Ta’siri |
|---|---|---|
| Mahsulotlarning turlicha yozilishi | 697 xil asl nom mavjud normalizatsiyada 388 xil matnga tushadi; 165 guruhda bir nechta yozilish bor | Bir xil mahsulot nom bo‘yicha guruhlanganda bo‘linib ketishi mumkin |
| Hudud nomlari ikki tilda | Bitim va shartnoma hududi matni barcha 500 000 bog‘lanishda farq qiladi; misol: `Namangan viloyati` va `Наманганская область` | Oddiy matn tengligi bo‘yicha solishtirish noto‘g‘ri nomuvofiqlik chiqaradi; umumiy region kodi kerak |
| Tovar atributlari alohida maydonlarda doim to‘ldirilmagan | `Сорт товара`: 4 161; `Марка товара`: 4 350; `Тип товара`: 5 024; `Класс товара`: 4 967; `Размер товара`: 6 105 ta bo‘sh | Ayrim atributlar mahsulot nomining ichida berilgan; faqat alohida ustun orqali filtr yetarli emas |
| O‘lchov birliklari turlicha | Tonna, kilogramm, metr, dona, kub metr, kvadrat metr, litr | Faqat mos birliklarni konvertatsiya qilish mumkin; turli fizik o‘lchamlar qo‘shilmaydi |

Normalizatsiya orqali bir xil matnga tushish barcha mahsulotlar biznes jihatidan bir xil ekanini isbotlamaydi. Hududdagi til farqi ham o‘z-o‘zidan noto‘g‘ri hudud yozilganini anglatmaydi.

## Talqin qilishda hisobga olinadigan holatlar

- `Поставлено` 46 291 ta bitimda bo‘sh. Buni avtomatik buzilgan son yoki 0 deb qabul qilish kerak emas; holat bilan birga talqin qilish kerak.
- 33 719 ta bitim `Аннулирован(Не оплачен)` holatida. Ularning summasini real tushum yoki yetkazilgan savdo deb ko‘rsatish noto‘g‘ri bo‘ladi.
- Dataset oralig‘i: **2022-01-03 — 2026-10-30**. 2026-yil to‘liq emas.
- Sof foyda hisoblash uchun tannarx, xarajat va kompaniyaning to‘liq moliyaviy hisoboti yo‘q.
- Manba README’siga ko‘ra ma’lumotlar sun’iy, haqiqiy UZEX statistikasi emas.

## Ushbu tekshiruvlarda topilmagan muammolar

Takroriy asosiy ID, mavjud bo‘lmagan shartnoma/ishtirokchi/broker havolasi, yaroqsiz sana yoki asosiy son, sotuvchi/xaridor roli nomuvofiqligi, shartnoma bilan lot/birlik/tur/sotuvchi nomuvofiqligi, shartnoma amalidan tashqaridagi bitim, eksport bitimi sanasiga yetishmagan USD kursi va tekshirilgan yetkazish xronologiyasi xatolari qayd etilmadi. Bu barcha mumkin bo‘lgan biznes xatolar yo‘qligiga kafolat emas.

## CSV va joriy import qamrovi

CSV’da 456 724 spot, 36 431 forvard va 6 845 fyuchers bitim bor. Oldingi v1 import faqat spot bitimlarni olgan; Neon v2 barchasini import qilib, standart hisoblashda bekor qilinganlarni chiqaradi. v2 yangilash hali bajarilmagan serverda eski qamrov saqlanadi. Bitimlarning ayrim ustunlari, jumladan yetkazilgan lotlar, DB sxemasiga olinmagan.

## Qayta tekshirish

Loyiha papkasida:

```powershell
node scripts/audit_data.js ../uzex_spot_data
```

Batafsil sonlar va misollar `DATA_AUDIT.json` fayliga yoziladi.
