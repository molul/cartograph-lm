<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  defaultName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', name: string): void
}>()

const name = ref(props.defaultName)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    name.value = props.defaultName
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  },
)

function close() {
  emit('update:modelValue', false)
}

function confirm() {
  // El input solo admite el nombre: la extensión .html se añade siempre aparte.
  const clean = name.value.trim().replace(/\.html?$/i, '') || props.defaultName || 'mapa-mental'
  emit('confirm', clean)
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') confirm()
  if (event.key === 'Escape') close()
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-sm rounded-sm border border-brass/50 bg-ink-light p-5 shadow-2xl">
      <h2 class="font-display text-base font-semibold text-paper">Descargar HTML</h2>
      <p class="mt-1 text-xs text-paper/60">Elige el nombre del archivo.</p>

      <div class="mt-4">
        <label class="mb-1 block font-sans text-[11px] uppercase tracking-[0.14em] text-brass-light">
          Nombre de archivo
        </label>
        <div class="flex items-stretch overflow-hidden rounded-sm border border-ink-lighter focus-within:border-brass">
          <input
            ref="inputRef"
            v-model="name"
            type="text"
            spellcheck="false"
            class="min-w-0 flex-1 bg-ink px-3 py-2 font-mono text-sm text-paper outline-none"
            @keydown="onKeydown"
          >
          <span class="flex select-none items-center whitespace-nowrap bg-ink-lighter px-3 font-mono text-sm text-paper/70">
            .html
          </span>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-sm border border-ink-lighter px-3 py-1.5 font-sans text-xs font-medium text-paper/80 transition-colors hover:border-brass hover:text-brass-light"
          @click="close"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="rounded-sm bg-brass px-3 py-1.5 font-sans text-xs font-semibold text-ink transition-colors hover:bg-brass-light"
          @click="confirm"
        >
          Descargar
        </button>
      </div>
    </div>
  </div>
</template>
