// Выпуск новой версии: отправить коммиты на GitHub (сайт пересоберётся сам) и собрать APK для Android.
//   npm run release            — git push, сборка для телефона, APK → release/KolaApp.apk
//   npm run release -- --dirty — то же, даже если есть незакоммиченные изменения (они попадут в APK, но не на сайт)
//   npm run release -- --no-push — только собрать APK
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const win = process.platform === 'win32'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n› ${cmd} ${cmdArgs.join(' ')}`)
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: win, cwd: root, ...opts })
  if (r.status !== 0) { console.error(`\n✗ Не получилось: ${cmd} ${cmdArgs.join(' ')}`); process.exit(r.status ?? 1) }
}
const out = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', shell: win }).stdout?.trim() ?? ''

/**
 * Gradle проекта работает с Java 17–24. В Android Studio сейчас встроена Java 25, поэтому ищем подходящую:
 * JAVA_HOME (если задан), затем JDK, скачанные IDE в ~/.jdks, затем встроенную в Android Studio
 */
function findJava() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME
  const jdks = join(homedir(), '.jdks')
  if (existsSync(jdks)) {
    const fit = readdirSync(jdks)
      // рядом с JDK лежат служебные файлы IDE (.jbr-21….intellij) — берём только папки, где есть сама java
      .filter(name => !name.startsWith('.') && existsSync(join(jdks, name, 'bin', win ? 'java.exe' : 'java')))
      .map(name => ({ name, major: Number(name.match(/(?:^|[-_])(1[7-9]|2[0-4])(?:[.\-_]|$)/)?.[1] ?? 0) }))
      .filter(j => j.major)
      .sort((a, b) => b.major - a.major)[0]
    if (fit) return join(jdks, fit.name)
  }
  const studio = win ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
  return existsSync(studio) ? studio : null
}

// 1. Коммиты → GitHub
if (!args.includes('--no-push')) {
  const dirty = out('git', ['status', '--porcelain'])
  if (dirty && !args.includes('--dirty')) {
    console.error('✗ Есть незакоммиченные изменения — сначала закоммить их (или запусти с --dirty, тогда они попадут только в APK):\n' + dirty)
    process.exit(1)
  }
  run('git', ['push'])
  console.log('✓ Коммиты на GitHub — сайт пересоберётся сам через пару минут')
}

// 2. Веб-часть для телефона → android/
run('npm', ['run', 'android'])

// 3. APK
const java = findJava()
if (!java) { console.error('✗ Не нашла Java 17–24. Укажи путь в JAVA_HOME или собери APK в Android Studio (Build → Build APK(s)).'); process.exit(1) }
console.log(`\nJava: ${java}`)
const androidDir = join(root, 'android')
run(`"${join(androidDir, win ? 'gradlew.bat' : 'gradlew')}"`, ['assembleDebug'], { cwd: androidDir, env: { ...process.env, JAVA_HOME: java } })

const apk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
mkdirSync(join(root, 'release'), { recursive: true })
const target = join(root, 'release', 'KolaApp.apk')
copyFileSync(apk, target)
console.log(`\n✓ Готово: ${target}\n  Скопируй его на телефон и установи поверх старого — данные и вход сохранятся.`)
