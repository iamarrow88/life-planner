/** Цвета сфер по умолчанию: пока свой набор не задан */
export const DEFAULT_SPHERE_COLORS = ['#3E8E5F', '#7B5CC4', '#D9783A', '#2F6DB3', '#C0475F', '#B58B1F']
/** Столько цветов помещается в настройку (то же ограничение в базе) */
export const MAX_SPHERE_COLORS = 48

/**
 * Разбирает строку с цветами: разделители — пробелы, запятые, точки с запятой, переводы строк;
 * «#» необязателен, короткая запись #abc разворачивается. Результат — #RRGGBB без повторов, порядок сохраняется.
 * invalid — то, что не удалось распознать.
 */
export function parseColors(text: string): { colors: string[]; invalid: string[] } {
  const colors: string[] = [], invalid: string[] = []
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const hex = token.replace(/^#/, '')
    const full = /^[0-9a-f]{3}$/i.test(hex) ? [...hex].map(c => c + c).join('') : hex
    if (!/^[0-9a-f]{6}$/i.test(full)) { invalid.push(token); continue }
    const color = '#' + full.toUpperCase()
    if (!colors.includes(color)) colors.push(color)
  }
  return { colors, invalid }
}
