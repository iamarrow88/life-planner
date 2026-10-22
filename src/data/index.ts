import { supabaseConfigured, supabaseProblems, supabaseRepo } from './supabase'
import { demoRepo } from './demo'
import type { Repo } from '../types'

/** Есть ключи Supabase — работаем с ними, иначе демо-режим на localStorage */
export const repo: Repo = supabaseConfigured && !supabaseProblems.length ? supabaseRepo : demoRepo
export { supabaseProblems }
