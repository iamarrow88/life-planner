<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'

const app = useApp()
const router = useRouter()
const email = ref('')
const password = ref('')
const mode = ref<'in' | 'up'>('in')
const busy = ref(false)
const info = ref('')

async function submit() {
  busy.value = true; info.value = ''
  if (mode.value === 'in') {
    if (await app.signIn(email.value.trim(), password.value)) router.push('/inbox')
  } else {
    const r = await app.signUp(email.value.trim(), password.value)
    if (r === 'ok') router.push('/inbox')
    else if (r === 'confirm') { info.value = 'Мы отправили письмо — подтверди почту и войди.'; mode.value = 'in' }
  }
  busy.value = false
}
</script>

<template>
  <div class="grid min-h-full place-items-center p-6">
    <form class="card w-full max-w-sm space-y-4 p-6" @submit.prevent="submit">
      <div class="text-center">
        <div class="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-2xl text-white">◔</div>
        <h1 class="text-xl font-bold">Планировщик</h1>
      </div>
      <div class="flex rounded-xl border border-line bg-bg p-0.5 text-sm font-semibold">
        <button type="button" class="flex-1 rounded-lg py-2 transition" :class="mode === 'in' ? 'bg-accent text-white' : 'text-mute'" @click="mode = 'in'">Войти</button>
        <button type="button" class="flex-1 rounded-lg py-2 transition" :class="mode === 'up' ? 'bg-accent text-white' : 'text-mute'" @click="mode = 'up'">Регистрация</button>
      </div>
      <input v-model="email" class="input" type="email" placeholder="Почта" autocomplete="email" required />
      <input v-model="password" class="input" type="password" placeholder="Пароль (от 6 символов)" minlength="6"
        :autocomplete="mode === 'in' ? 'current-password' : 'new-password'" required />
      <p v-if="app.error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ app.error }}</p>
      <p v-if="info" class="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{{ info }}</p>
      <button class="btn-primary w-full" :disabled="busy">{{ mode === 'in' ? 'Войти' : 'Зарегистрироваться' }}</button>
      <p class="text-center text-xs text-mute">
        {{ mode === 'in' ? 'Ещё нет аккаунта? Открой вкладку «Регистрация».' : 'Придумай пароль от 6 символов. Если Supabase просит подтвердить почту, придёт письмо со ссылкой.' }}
      </p>
    </form>
  </div>
</template>
