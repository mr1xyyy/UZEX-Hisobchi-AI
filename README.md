# UZEX RAG Telegram bot

Bot tgcloud serverless runtime uchun yozilgan. Runtime importlari faqat `sdk`, `sdk/db` va nisbiy `.js` modullar. Foreign key ishlatilmaydi.

**Manba sun’iy:** `../uzex_spot_data/README.md` barcha kompaniya, bitim, narx va kurslar o‘ylab topilganini bildiradi. Bu haqiqiy UZEX statistikasi emas. Neon v2 importi **barcha 500 000 bitimni** oladi: spot, forvard va fyuchers. Hisoblashlarda odatda **bekor qilingan bitimlar chiqarib tashlanadi**; natijada 466 281 ta bitim qoladi. Savolda alohida savdo turi yoki bekor qilinganlarni qo‘shish aytilsa, o‘sha shart ishlatiladi. Manba haqidagi takroriy izoh Telegram javoblarida chiqarilmaydi.

## Eski Neon importini v2 ga yangilash

Nazorat savollari uchun 456 724 ta spot yozuvning o‘zi yetarli emas. Quyidagi buyruq 43 276 ta yetishmagan forvard/fyuchersni qo‘shadi, mavjud yozuvlarning hudud, savdo shakli va aniq sortini qayta to‘ldiradi. Baza yoki eski progressni o‘chirmang. Neon sxemasi `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` bilan skriptning o‘zida yangilanadi. **Avval import tugasin, keyin bot kodi push qilinsin.**

```powershell
node scripts/import_neon.js ../uzex_spot_data
node scripts/import_neon.js --check
npx tgcloud push
```

`--check` da `deals=500000`, `active_deals=466281` chiqishi kutiladi. Connection string va DeepSeek kaliti o‘zgarmagan bo‘lsa `--configure` ni takrorlash shart emas. v2 uchun `.import-progress/neon-v2-*.json` alohida progress ishlatiladi; eski spot progressi bilan satrlar tashlab ketilmaydi. Uzilib qolsa shu import buyrug‘ini takrorlang.

Beshta nazorat savoli actual CSV’dan tuzilgan 500 ming yozuvli lokal SQLite bazasida ishlab chiqarish SQL kompilyatori orqali tekshirilgan. Raqamlar javob kodiga yozilmagan. Qayta sinash: `node scripts/verify_queries.js`; Neon yangilangach: `node scripts/verify_queries.js --neon`. Natijalar `REGRESSION_RESULTS.json` fayliga yoziladi.

## Neon PostgreSQL bilan ishga tushirish

Eski tgcloud importi ishlayotgan bo‘lsa `Ctrl+C` bilan to‘xtating. Quyidagi buyruqlarni **DATABASE_URL belgilangan o‘sha PowerShell oynasida** bajaring:

```powershell
Set-Location D:\Projects\hackathon\UzexHisobchiBot
node scripts/import_neon.js ../uzex_spot_data
```

## Foydalanuvchi komandalari

- `/start` — salomlashish va qisqa yo‘riqnoma.
- `/help` — foydalanish usuli va savol namunalari.

Oddiy savollarga javob tili savol tiliga qarab avtomatik aniqlanadi. Alohida til tanlash komandasi yo‘q. `/start` va `/help` bitta xabarda o‘zbekcha va ruscha chiqadi; menyu tavsiflari ham ikki tilda. Oldin saqlangan til tanlovlari ishlatilmaydi. Yangi migratsiya talab qilinmaydi.

Kodni deploy qilish, keyin Telegram `/` menyusini yangilash:

```powershell
npx tgcloud push
node scripts/setup_commands.js
```

Menyu skripti uchun `TGCLOUD_TOKEN` shu terminalda belgilangan bo‘lsin. Faqat `/start` va `/help` ro‘yxatdan o‘tadi. Skriptni qayta bajarish oldingi `/lang` menyu bandini olib tashlaydi. Doimiy savol va til tanlash klaviaturalari yaratilmaydi.

## Neon import tafsilotlari

Bu buyruq `uzex` PostgreSQL sxemasi va jadvallarini yaratadi, CSV’larni tekshiradi, 1000 yozuvgacha / 1 MB batchlarda to‘g‘ridan-to‘g‘ri Neon HTTPS SQL’ga yuboradi. Tgcloud management API bu importda qatnashmaydi, 20 soniyalik tgcloud pauzasi ishlatilmaydi. Tashqi npm paket yoki `psql` o‘rnatish talab qilinmaydi. Bu `COPY` emas: PostgreSQL `jsonb_to_recordset($1)` orqali parametrli bulk insert. Maqsadli baza connection stringdagi database; jadvallar alohida `uzex` sxemasida saqlanadi.

Har tasdiqlangan batchdan keyin `.import-progress/neon-v2-*.json` saqlanadi. Qayta ishga tushirilsa faqat qolgan batchlar yuboriladi. Bitimlar primary key bo‘yicha upsert qilinadi: mavjud satr yangilanadi, yangi raqam qo‘shiladi. Yordamchi jadvallarning mavjud primary key’lari takrorlanmaydi. Baza tozalansa tegishli Neon progress faylini olib tashlang. Bir vaqtda bitta import jarayonini ishlating. SQLite importining progressi Neon’nikidan alohida.

Oxirida qidiruv indekslari yaratiladi va jadvaldagi sonlar CSV’dan kutilgan sonlar bilan solishtiriladi. Hammasi mos bo‘lsa `Neon import tugadi` chiqadi. Kutilgan sonlar: 6 616 shartnoma, 14 392 ishtirokchi, 120 broker, 1 765 kurs, 500 000 bitim. Bekor qilinganlar ma’lumotdan o‘chirilmaydi; odatda savol SQL’ida filtrlanadi. Tezlik Neon resurslari va internetga bog‘liq.

Import tugagach:

```powershell
node scripts/import_neon.js --check
node scripts/import_neon.js --configure
npx tgcloud push
```

`--configure` uchun shu terminalda `TGCLOUD_TOKEN` ham belgilangan bo‘lishi kerak. Skript import tugaganini va tgcloud’dan Neon’ga ulanishni tekshiradi, keyin `settings.neon_database_url` qiymatini saqlaydi. Bot yangilangan modullar push qilingach qidiruvni Neon’da bajaradi. Oldingi DeepSeek kaliti tgcloud `settings` jadvalida qoladi; uni qayta sozlash shart emas. `settings` allaqachon migratsiya qilingan bo‘lsa Neon uchun yangi tgcloud migratsiyasi talab qilinmaydi. Yangi botda avval `npx tgcloud push`, `npx tgcloud migrate` va DeepSeek `--configure` ni bajaring.

Tekshirish: Telegram’da `/start`, so‘ng `1-sorta`, `un` yoki broker kodini yuboring. Neon’dan 0 ta yozuv kelsa DeepSeek chaqirilmaydi. Neon nosoz bo‘lsa vaqtinchalik xizmat xatosi chiqadi; qidiruv eski, qisman yuklangan SQLite bitimlariga o‘tmaydi. Neon sozlanmagan bot avvalgi SQLite qidiruvidan foydalanadi.

Bot mos mahsulot uchun ham rad javobi bersa, `TGCLOUD_TOKEN` belgilangan terminalda `node scripts/check_bot.js "1-sorta"` ni bajaring. Diagnostika botning saqlangan backend sozlamasi, bazadagi yozuv soni, import tayyorligi, kalit mavjudligi va qidiruv topgan yozuvlar sonini ko‘rsatadi. Kalit yoki connection string chiqarilmaydi, DeepSeek chaqirilmaydi. Bu lokal modullarni management `/run` orqali tekshiradi; deploy qilingan versiya alohida `npx tgcloud push` bilan yangilanadi.

**Muhit o‘zgaruvchilari:** `DATABASE_URL` — import qiluvchi Neon connection string. `TGCLOUD_TOKEN` — faqat botni sozlash uchun. Ixtiyoriy `NEON_BOT_DATABASE_URL` — botga beriladigan alohida connection string (standartda `DATABASE_URL`). O‘qish huquqi bilan cheklangan alohida rol ishlatilsa, `uzex` sxemasiga `USAGE`, `deals`, `usd_rates`, `participants`, `brokers`, `import_state` jadvallariga `SELECT` kerak. Har ikkala URL bir xil Neon branch va database’ga qarashi kerak. URL’lar kodga yoki Git’ga yozilmaydi; server sozlamasini DB/management administratorlari o‘qiy oladi.

Neon HTTP integratsiyasi rasmiy driver’ning [HTTP protokoli](https://github.com/neondatabase/serverless/blob/main/src/http/index.ts) va [endpoint tanlash kodi](https://github.com/neondatabase/serverless/blob/main/src/shims/net/index.ts) asosida yozilgan. Runtime’da faqat `sdk.fetch` ishlatiladi. So‘rovlar parametrli; serverdan kelgan xatolarning credential saqlashi mumkin bo‘lgan xom matni chiqarilmaydi.

Lokal tekshiruvlar:

```powershell
npm test
node scripts/import_neon.js --dry-run
```

## Avvalgi SQLite varianti

PowerShell’da avval loyiha papkasiga o‘ting (`package.json` va `package-lock.json` shu yerda):

```powershell
Set-Location D:\Projects\hackathon\UzexHisobchiBot
npm ci
npm test
node scripts/import_data.js --dry-run
npx tgcloud push
npx tgcloud migrate
```

Import uchun `TGCLOUD_TOKEN` muhit o‘zgaruvchisini botning management tokeni bilan, `DEEPSEEK_API_KEY` ni DeepSeek kaliti bilan xavfsiz tarzda belgilang. Kalitlarni kodga yoki Git’ga yozmang.

```powershell
node scripts/import_data.js --configure
node scripts/import_data.js ../uzex_spot_data
npx tgcloud run handlers/message '{ chat: { id: 1 }, text: "1-sorta" }'
```

`--dry-run` tarmoqqa ulanmaydi, barcha CSV yozuvlarini validatsiya qiladi. Oddiy import 300 yozuvgacha (taxminan 128 KB) batchlarni authenticated management `/run` orqali runtime moduliga yuboradi. Server har batchni 30 yozuvli SQL insertlarga ajratadi; `sdk/db` lokal Node paket sifatida import qilinmaydi. `/run` uchun vaqtinchalik `handlers/message` faqat so‘rov xotirasida yaratiladi, deploy qilinmaydi va Telegram orqali chaqirilmaydi. Bu transport o‘rnatilgan tgcloud CLI 0.2.0 manbasidagi API formatiga mos; platforma o‘zgarsa qayta tekshiring.

Har tasdiqlangan batchdan keyin `.import-progress/` ichida bot va dataset papkasiga bog‘langan progress saqlanadi. Qayta ishga tushirilsa tasdiqlangan yozuvlar tarmoqqa yuborilmaydi; ma’lumotnoma xaritalari lokal qayta tiklanadi. CSV o‘lchami yoki o‘zgartirilgan vaqti farq qilsa import to‘xtaydi. Server bazasi tozalansa tegishli progress faylini olib tashlab qayta yuklash kerak. Eski skript bilan yuklangan yozuvlar uchun progress yo‘q: ular birinchi yangilangan ishga tushirishda qayta tekshiriladi, primary key sababli takrorlanmaydi. Faqat bitta import jarayonini ishlating.

So‘rovlar orasidagi boshlang‘ich pauza 20 soniya, HTTP 429 bo‘lsa pauza ortadi va `Retry-After` hisobga olinadi. Vaqtinchalik ulanish xatolari qayta uriniladi. Pauzani `TGCLOUD_IMPORT_INTERVAL_MS` orqali 1000–60000 ms oralig‘ida belgilash mumkin. Bu platforma limitidan xoli bo‘lishni kafolatlamaydi; import ko‘p soat davom etishi mumkin. Mavjud yozuvlarni yangilash uchun alohida migratsiya kerak. FTS5 import oxirida yaratiladi; mavjud bo‘lmasa LIKE ishlaydi. Katta bazada LIKE sekinroq bo‘lishi mumkin.

DeepSeek kaliti serverdagi `settings` jadvalida saqlanadi, foydalanuvchi kontekstiga kiritilmaydi va ommaviy endpoint orqali ochilmaydi. `--configure` kalitni yangilaydi. DB/management huquqi bor administrator uni o‘qiy oladi; SDK hujjatlarida alohida secrets API berilmagan.

## Qidiruv va chegaralar

Ma’lumot yetishmaganda Telegramga eski bir xil `Ma'lumotlarda javob yoʻq` xabari yuborilmaydi. Bot mos yozuv topilmagani, reyestr bo‘shligi, savolni tushunish qiyinligi yoki hisoblash uchun kurs/hajm yetishmasligini alohida tushuntiradi. Keyin davr, mahsulot, STIR yoki broker kodini aniqlashtirishni taklif qiladi. Rejalashtirilgan qidiruvda haqiqiy qamrov mavjud bo‘lsa reyestr sanalari ham ko‘rsatiladi; yangi fakt yoki son taxmin qilinmaydi. Ichki yordamchilarda eski rad-javob belgisi qolgan bo‘lishi mumkin, ammo handler uni foydalanuvchiga tushunarli xabarga aylantiradi.

Javoblar oddiy tilda formatlanadi: raqamlar minglik guruhlarga ajratiladi, narx/summalar ko‘pi bilan ikki kasrgacha yaxlitlanadi, `UZS` o‘rniga `so‘m` / `сум` ishlatiladi. Yil filtri `2024-yilda` / `За 2024 год` deb ko‘rsatiladi; umumiy sana oralig‘ida SQL’dagi eksklyuziv oxirgi kun o‘rniga foydalanuvchiga inklyuziv oxirgi sana beriladi. Hisoblash qiymatlari SQL’da o‘zgarmaydi — yaxlitlash faqat xabar ko‘rinishiga ta’sir qiladi. Sotuvchi/xaridor va broker reytinglarida bazadagi nom mavjud bo‘lsa kod bilan birga ko‘rsatiladi.

Mahsulot, STIR, broker kodi, kompaniya nomi, bitim va shartnoma raqami qidiriladi. Matn Unicode normalizatsiya qilinadi; `1 сорт`, `1-сорта`, `1-sorta` birlashtiriladi. Qisqa qidiruvlarda o‘zbekcha mahsulotlar uchun lug‘at, to‘liq savollarda DeepSeek JSON rejalashtiruvchisi ishlatiladi.

Sort so‘rovlari v2 dagi `product_grade` ustuni orqali qidiriladi. Sort mahsulot nomidan ajratiladi: `1-sorta`, `1 сорт`, `I сорт`, `первый сорт` bir xil. `2 сорт 1 класс` esa 2-sort bo‘lib qoladi. Hudud `region`, savdo shakli `trade_form` ustunlarida. Eski importni v2 bilan bir marta yangilash kerak; faqat kodni push qilish yangi ustunlarni to‘ldirmaydi.

`1-sorta`, `un`, `мука`, STIR yoki broker kodi kabi yalang‘och qidiruvlar uchun 3 tagacha mos bitim bazadagi kontekstdan bevosita formatlanadi; DeepSeek chaqirilmaydi. Mavjud sana, hajm, summa, birlik narxi, sotuvchi/xaridor, broker va holat chiqariladi; yetishmagan qiymat noma’lum deb belgilanadi. Diagnostikadagi `responseMode: registry` bevosita javobni, `planned_sql` esa JSON reja → SQL yo‘lini bildiradi.

`2025-yilda nechta bitim bo‘lgan?`, `Сколько сделок было в 2025 году?` va `Jami nechta bitim bor?` savollari to‘liq baza bo‘yicha parametrli SQL `COUNT(*)` bilan ishlanadi; model va 15 yozuvli namuna ishlatilmaydi. Yil sanalari `[01-01, keyingi yil 01-01)` oralig‘ida filtrlanadi. Standartda barcha savdo shakllari kiradi, bekor qilinganlar kirmaydi. Qo‘shimcha mahsulot/status/hudud shartlari JSON reja orqali ishlanadi. 0 ta qayd topilsa sabab tushuntiriladi.

To‘liq savollar uchun yo‘l: **savol → tekshirilgan JSON reja → parametrli SQL → SQL natijasidan javob**. Modelga faqat real bazadagi sana oralig‘i, yozuv soni va ruxsat etilgan schema tavsifi beriladi. Model SQL yozmaydi va javobdagi sonlarni ishlab chiqarmaydi. JSON reja action, metrika, sana, mahsulot, sotuvchi/xaridor STIR, broker, holat, shartnoma turi, o‘lchov birligi, bitim/shartnoma raqami va cheklangan guruhlash/saralashdan iborat. Noma’lum kalitlar, yaroqsiz sana, cheklanmagan limit yoki bajarilmaydigan hisoblashlar rad etiladi. Qo‘llangan filtrlar hisoblash javobida ko‘rsatiladi. Savolni JSON rejaga talqin qilish modelga bog‘liq; bu bosqich xatosiz bo‘lishiga kafolat yo‘q.

Qo‘llab-quvvatlanadigan misollar:

- `2025-yilda paxta bo‘yicha nechta bitim bo‘lgan?`
- `2025-yildagi bitimlarning jami summasi qancha?`
- `Unning o‘rtacha narxi qancha?`
- `Eng arzon paxta bitimini ko‘rsat`
- `Bitimlar sonini yillar bo‘yicha ko‘rsat`
- `Qaysi sotuvchi brokerida eng ko‘p bitim bor?`
- `2024-yilda sotuvchi 123456789 bitimlarini ko‘rsat`
- `Сколько брокеров зарегистрировано?`

Count, jami, o‘rtacha, minimum/maksimum, eksport ulushi va guruhlashlar 15 ta namuna ustida emas, **barcha filtrlangan bitimlar** ustida SQL orqali hisoblanadi. Hajm = quantity × lot. Jami UZS summa bitim sanasidagi kurs bilan hisoblanadi. O‘rtacha birlik narxi = sum(UZS summa) / sum(hajm). `outputUnit` bilan kilogramm/tonna mos ravishda konvertatsiya qilinadi; bu manbadagi birlik bo‘yicha satrlarni olib tashlash degani emas. Turli fizik o‘lchamlar qo‘shilmaydi. Eksport ulushi = bir xil filtr va bekor qilish qoidasi ostidagi eksport summasi / jami summa × 100. Zarur kurs yoki hajm yetishmasa qiymat taxmin qilinmaydi. Top/guruh natijalari 10 ta guruh, ro‘yxat 10 ta bitim bilan cheklangan.

Ishtirokchi, broker, shartnoma va kurs yozuvlari bo‘yicha filtrsiz umumiy count ham mavjud. Shu jadvallar bo‘yicha murakkab filtrli statistika, ko‘p savolni birga solishtirish yoki qo‘llab-quvvatlanmaydigan shartlar hozircha `unsupported` reja bilan rad etiladi. Ma’lumot yetarli bo‘lmasa `Ma'lumotlarda javob yoʻq` saqlanadi.

Baza bo‘sh bo‘lsa rejalashtiruvchi ham chaqirilmaydi. Oddiy qidiruvdagi 0 natijada DeepSeek ishlatilmaydi. To‘liq savolda avval mavjud baza konteksti bilan bir marta reja olinadi; keyingi SQL natijasi bo‘sh bo‘lsa yangi model chaqiruvi qilinmaydi va rad javobi chiqadi. JSON noto‘g‘ri yoki kesilgan bo‘lsa ham SQL bajarilmaydi. API yoki DB nosozligi alohida vaqtinchalik xatolik xabari bilan qaytariladi.

Savolni sinash: `node scripts/check_bot.js --answer "2025-yilda paxta bo‘yicha nechta bitim bo‘lgan?"`. Bu management `/run` orqali lokal kodni bajaradi, JSON reja, bosqich, mos yozuv soni va javobni chiqaradi. To‘liq savollar uchun bitta DeepSeek chaqiruvi bo‘lishi mumkin, Telegramga xabar yuborilmaydi. `--answer` siz diagnostika modelni chaqirmaydi. Botdagi o‘zgarishlar `npx tgcloud push` bilan deploy qilinadi; qayta import yoki migratsiya talab qilinmaydi.

DeepSeek integratsiyasi rasmiy [API quick start](https://api-docs.deepseek.com/quick_start) dagi `deepseek-flash` va `https://api.deepseek.com/chat/completions` ni ishlatadi (`temperature: 0.0`, thinking o‘chirilgan). Rejalashtirish uchun [JSON Output](https://api-docs.deepseek.com/guides/json_mode/) qo‘llanadi.

Testlar Node 24 da haqiqiy SQLite bilan LIKE, JOIN, normalizatsiya, formulalar, yo‘q kurs, CSV quoting va 0-natija guardrail’ini tekshiradi. Jonli tgcloud va DeepSeek chaqiriqlari uchun alohida credentials va tarmoq kerak.
