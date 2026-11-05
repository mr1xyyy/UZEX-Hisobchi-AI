import { isRussian } from './locale.js';
export function noDataReply(question, reason = 'no_match', coverage = null, language) {
  const ru = isRussian(question, language);
  const messages = ru ? {
    no_match: 'В реестре не найдено записей, соответствующих вашему запросу. Попробуйте другой период, название товара, ИНН или код брокера.',
    empty_registry: 'В подключённом реестре пока нет сделок. После загрузки данных я смогу отвечать на вопросы по ним.',
    unclear: 'Не удалось однозначно понять условия вопроса. Укажите товар, период и что нужно узнать: количество сделок, сумму, цену или список. Например: «Сколько сделок по муке было в 2025 году?»',
    unsupported: 'Не удалось построить надёжный расчёт для этого вопроса. Попробуйте задать один конкретный вопрос о количестве сделок, сумме, цене или участниках, указав товар и период.',
    missing_rate: 'Для части подходящих сделок не хватает валюты или курса на дату сделки. Поэтому точную сумму в сумах или сравнение цен сейчас рассчитать нельзя. Можно уточнить период или запросить список сделок.',
    missing_volume: 'Для части подходящих сделок не указан корректный объём. Поэтому точный общий объём или цену за единицу рассчитать нельзя. Можно уточнить товар или запросить сами сделки.',
    incomplete: 'Подходящие сделки есть, но данных для этого расчёта недостаточно. Уточните товар, единицу измерения или период — либо запросите список сделок.',
  } : {
    no_match: 'So‘rovingiz shartlariga mos yozuv reyestrdan topilmadi. Boshqa davr, mahsulot nomi, STIR yoki broker kodi bilan sinab ko‘ring.',
    empty_registry: 'Ulangan reyestrda hozircha bitimlar yo‘q. Ma’lumotlar yuklangach, ular bo‘yicha savollarga javob bera olaman.',
    unclear: 'Savolingizdagi shartlarni aniq ajrata olmadim. Mahsulot, davr va nimani bilmoqchi ekaningizni yozing: bitimlar soni, summa, narx yoki ro‘yxat. Masalan: «2025-yilda un bo‘yicha nechta bitim bo‘lgan?»',
    unsupported: 'Bu savol uchun ishonchli hisoblash tuza olmadim. Mahsulot va davrni ko‘rsatib, bitimlar soni, summa, narx yoki ishtirokchilar haqida bitta aniq savol bering.',
    missing_rate: 'Mos bitimlarning ayrimlarida valyuta yoki bitim sanasidagi kurs yetishmayapti. Shu sababli so‘mdagi aniq summani yoki narxlar taqqoslovini hisoblay olmayman. Davrni aniqlashtiring yoki bitimlar ro‘yxatini so‘rang.',
    missing_volume: 'Mos bitimlarning ayrimlarida hajmni hisoblash uchun to‘g‘ri miqdor yoki lot yo‘q. Shu sababli jami hajm yoki birlik narxini aniq hisoblay olmayman. Mahsulotni aniqlashtiring yoki bitimlar ro‘yxatini so‘rang.',
    incomplete: 'Mos bitimlar bor, ammo bu hisoblash uchun ma’lumot yetarli emas. Mahsulot, o‘lchov birligi yoki davrni aniqlashtiring — yoxud bitimlar ro‘yxatini so‘rang.',
  };
  let answer = messages[reason] || messages.no_match;
  if (reason === 'no_match' && /^\d{4}-\d{2}-\d{2}$/.test(coverage?.min_date || '') && /^\d{4}-\d{2}-\d{2}$/.test(coverage?.max_date || '')) {
    answer += ru ? `\nДоступный период реестра: ${coverage.min_date} — ${coverage.max_date}.`
      : `\nReyestrdagi mavjud davr: ${coverage.min_date} — ${coverage.max_date}.`;
  }
  return answer;
}
