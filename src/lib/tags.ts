// Теги задач: «#звонки» в тексте → тег «звонки». Тег — строчные буквы, цифры, «_» и «-», начинается с буквы, до 40 символов
const TAG_BODY = String.raw`\p{L}[\p{L}\p{N}_-]*`
const TAG_IN_TEXT = new RegExp(String.raw`(^|\s)#(${TAG_BODY})`, 'gu')
const TAG_ONLY = new RegExp(`^${TAG_BODY}$`, 'u')

export const normTag = (s: string) => s.trim().replace(/^#+/, '').toLowerCase().slice(0, 40)
export const isTag = (s: string) => TAG_ONLY.test(normTag(s))
export const uniqTags = (list: string[]) => [...new Set(list.map(normTag).filter(isTag))].sort()

/** «Позвонить в банк #звонки #финансы» → { title: 'Позвонить в банк', tags: ['звонки', 'финансы'] } («#5» тегом не считается) */
export function parseTags(text: string): { title: string; tags: string[] } {
  const tags: string[] = []
  const title = text.replace(TAG_IN_TEXT, (_, pre: string, tag: string) => { tags.push(tag); return pre }).replace(/\s+/g, ' ').trim()
  const t = uniqTags(tags)
  return { title: title || t.join(' '), tags: t }
}
/** Незаконченный тег в конце текста: «Купить #мага» → «мага» (для подсказок); null — сейчас тег не набирают */
export function typingTag(text: string): string | null {
  const m = /(^|\s)#([\p{L}\p{N}_-]*)$/u.exec(text)
  return m ? m[2].toLowerCase() : null
}
/** Подставить выбранный тег вместо набираемого (или дописать в конец) */
export function insertTag(text: string, tag: string): string {
  const partial = typingTag(text)
  const base = partial !== null ? text.replace(/#[\p{L}\p{N}_-]*$/u, '') : text.replace(/\s*$/, text.trim() ? ' ' : '')
  return `${base}#${tag} `
}
/** Запрос поиска: «#звонки банк» → теги и слова (всё должно совпасть) */
export function parseQuery(q: string): { tags: string[]; words: string[] } {
  const parts = q.toLowerCase().split(/\s+/).filter(Boolean)
  return { tags: uniqTags(parts.filter(p => p.startsWith('#') && p.length > 1)), words: parts.filter(p => !p.startsWith('#')) }
}
