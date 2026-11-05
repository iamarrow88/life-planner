// Разбор файла для восстановления. Файл могли открыть в редакторе и случайно дописать символ в начале
// (или редактор добавил невидимую метку BOM), поэтому короткий мусор перед первой «{» пропускаем и сообщаем об этом.
import type { ExportData } from '../types'

const MAX_PREFIX = 16

export type ParsedFile =
  | { ok: true; data: ExportData; skipped: string }
  | { ok: false; error: 'broken' | 'not-export' }

export function parseRestoreFile(text: string): ParsedFile {
  const start = text.indexOf('{')
  if (start < 0 || start > MAX_PREFIX) return { ok: false, error: 'broken' }
  const skipped = text.slice(0, start).replace(/[﻿\s]/g, '')
  let data: ExportData
  try { data = JSON.parse(text.slice(start)) as ExportData } catch { return { ok: false, error: 'broken' } }
  if (!data || typeof data !== 'object' || !data.exported_at || !Array.isArray(data.tasks)) return { ok: false, error: 'not-export' }
  return { ok: true, data, skipped }
}
