/**
 * Семь сфер жизни (колесо баланса на экране «Сферы»). Вместе они покрывают всё, на что уходит время;
 * мелкие направления живут внутри них проектами.
 */
export const LIFE_SPHERES = [
  { name: 'Здоровье и Тело', short: 'Здоровье', color: '#3E8E5F', words: ['здоров', 'тело', 'спорт', 'трениров', 'фитнес', 'сон', 'питан', 'врач', 'медиц'] },
  { name: 'Отношения и Люди', short: 'Отношения', color: '#C0475F', words: ['отношен', 'люди', 'семья', 'семь', 'друз', 'дети', 'родител', 'партн', 'любов'] },
  { name: 'Карьера и Финансы', short: 'Карьера', color: '#2F6DB3', words: ['карьер', 'работ', 'финанс', 'деньг', 'бизнес', 'проект', 'офис', 'клиент'] },
  { name: 'Развитие и Обучение', short: 'Развитие', color: '#7B5CC4', words: ['развит', 'обучен', 'учёб', 'учеб', 'универ', 'курс', 'язык', 'книг', 'чтени', 'сесси'] },
  { name: 'Увлечения и Досуг', short: 'Увлечения', color: '#D9783A', words: ['увлеч', 'досуг', 'хобби', 'отдых', 'творч', 'игр', 'путешеств', 'музык', 'рисова'] },
  { name: 'Смысл и Осознанность', short: 'Смысл', color: '#B58B1F', words: ['смысл', 'осозн', 'духов', 'медита', 'дневник', 'рефлекс', 'психолог', 'терап'] },
  { name: 'Быт и Окружение', short: 'Быт', color: '#5E8C99', words: ['быт', 'окружен', 'дом', 'уборк', 'ремонт', 'покупк', 'хозяйств', 'готовк'] },
] as const

export type LifeSphere = (typeof LIFE_SPHERES)[number]

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е')
/** Сфера жизни с таким же названием (без учёта регистра и «ё») */
export const lifeByName = (name: string) => LIFE_SPHERES.find(l => norm(l.name) === norm(name)) ?? null
/** Догадка по названию: в какую из семи сфер, скорее всего, входит эта */
export function guessLife(name: string): LifeSphere | null {
  const n = norm(name)
  return LIFE_SPHERES.find(l => l.words.some(w => n.includes(norm(w)))) ?? null
}
/** Подпись у колеса: своё короткое имя для семи сфер, у остальных — первое слово */
export const shortName = (name: string) => lifeByName(name)?.short ?? name.split(/\s+/)[0]

/**
 * Баланс от 0 до 10: насколько ровно время распределено между сферами.
 * 10 — поровну во все сферы, 0 — всё в одну (или времени нет). Это нормированная энтропия долей.
 */
export function balanceScore(minutes: number[]): number {
  const n = minutes.length
  const total = minutes.reduce((s, m) => s + Math.max(0, m), 0)
  if (n < 2 || total <= 0) return 0
  let h = 0
  for (const m of minutes) { const p = Math.max(0, m) / total; if (p > 0) h -= p * Math.log(p) }
  return Math.round((h / Math.log(n)) * 100) / 10
}
