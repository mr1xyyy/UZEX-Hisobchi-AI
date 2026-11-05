export function isRussian(query, language) {
  return language === 'ru' || (language !== 'uz' && /[а-яё]/i.test(query));
}
