<script setup lang="ts">
import { computed, ref } from "vue";

const DEFAULT_MARKDOWN = `# Cartograph

## Cómo usarlo
- Carga tu propio archivo .md con el botón "Cargar .md"
- Edita el texto directamente en este panel
- El mapa de la derecha se actualiza al instante

## Estructura
- Los encabezados (#, ##, ###...) se convierten en ramas
- Las listas anidadas crean sub-ramas
- El **énfasis**, el \`código\` y los enlaces también se conservan

## Exportar
- Pulsa "Descargar HTML" para guardar un archivo autónomo
- Ese archivo abre el mismo mapa interactivo en cualquier navegador
`;

type ThemeId = "rainbow" | "byLevel" | "gray" | "grayByLevel";

const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: "rainbow", label: "Arco iris" },
  { value: "byLevel", label: "Colores por nivel" },
  { value: "gray", label: "Grises" },
  { value: "grayByLevel", label: "Grises por nivel" },
];

const markdown = ref(DEFAULT_MARKDOWN);
const theme = ref<ThemeId>("rainbow");
const fileName = ref("mapa-mental");
const fileInput = ref<HTMLInputElement | null>(null);
const canvasRef = ref<{
  fit: () => void;
  download: (filename: string) => void;
} | null>(null);
const showExportDialog = ref(false);

const displayName = computed(() => `${fileName.value}.md`);

function triggerUpload() {
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    markdown.value = String(reader.result ?? "");
    fileName.value = file.name.replace(/\.(md|markdown)$/i, "");
  };
  reader.readAsText(file);

  // Permite volver a cargar el mismo archivo si se modifica y se reintenta
  input.value = "";
}

function onDownloadClick() {
  showExportDialog.value = true;
}

function onConfirmDownload(name: string) {
  fileName.value = name;
  canvasRef.value?.download(name);
}

function onFit() {
  canvasRef.value?.fit();
}
</script>

<template>
  <div class="flex h-screen flex-col bg-ink">
    <!-- Barra superior -->
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b-2 border-amber-500 bg-ink px-5"
    >
      <svg
        viewBox="0 0 24 24"
        class="h-6 w-6 shrink-0 text-amber-500"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21" />
        <path
          d="M12 12l4.5-6.5L12 12l-4.5 6.5L12 12z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
      <div class="leading-tight">
        <h1 class="font-display text-lg font-semibold tracking-wide text-paper">
          Cartograph
        </h1>
        <p
          class="font-sans text-[11px] uppercase tracking-[0.18em] text-amber-400"
        >
          Conversor de mapas mentales de Markdown a HTML
        </p>
      </div>
    </header>

    <!-- Cuerpo: dos paneles -->
    <div class="flex min-h-0 flex-1">
      <!-- Panel izquierdo: fuente Markdown -->
      <section class="flex w-2/5 min-w-[320px] flex-col bg-ink">
        <div
          class="flex shrink-0 items-center justify-between gap-3 border-b border-ink-lighter px-4 py-3"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <span
              class="font-sans text-[11px] uppercase tracking-[0.16em] text-amber-400"
              >Fuente</span
            >
            <span
              class="truncate rounded-sm bg-ink-light px-2 py-0.5 font-mono text-xs text-paper/80"
              >{{ displayName }}</span
            >
          </div>
          <button
            type="button"
            class="shrink-0 rounded-sm border border-amber-500 px-3 py-1.5 font-sans text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500 hover:text-ink"
            @click="triggerUpload"
          >
            Cargar .md
          </button>
          <input
            ref="fileInput"
            type="file"
            accept=".md,.markdown,text/markdown"
            class="hidden"
            @change="onFileChange"
          />
        </div>

        <textarea
          v-model="markdown"
          spellcheck="false"
          class="editor-scroll flex-1 resize-none bg-ink-light px-4 py-4 font-mono text-[13px] leading-relaxed text-paper/90 outline-none focus:bg-ink-light/90"
          placeholder="Escribe o pega tu Markdown aquí..."
        />
      </section>

      <!-- Panel derecho: mapa mental -->
      <section class="flex flex-1 flex-col border-l-2 border-amber-500">
        <div
          class="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/40 bg-ink px-4 py-3"
        >
          <span
            class="font-sans text-[11px] uppercase tracking-[0.16em] text-amber-400"
            >Mapa mental</span
          >
          <div class="flex items-center gap-2">
            <select
              v-model="theme"
              class="rounded-sm border border-ink-lighter bg-ink px-2 py-1.5 font-sans text-xs font-medium text-paper/80 outline-none transition-colors hover:border-amber-500 hover:text-amber-400"
            >
              <option
                v-for="option in THEME_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <button
              type="button"
              class="rounded-sm border border-ink-lighter px-3 py-1.5 font-sans text-xs font-medium text-paper/80 transition-colors hover:border-amber-500 hover:text-amber-400"
              @click="onFit"
            >
              Centrar
            </button>
            <button
              type="button"
              class="rounded-sm bg-amber-500 px-3 py-1.5 font-sans text-xs font-semibold text-ink transition-colors hover:bg-amber-400"
              @click="onDownloadClick"
            >
              Descargar HTML
            </button>
          </div>
        </div>

        <div class="paper-grid relative min-h-0 flex-1">
          <MarkmapCanvas ref="canvasRef" :markdown="markdown" :theme="theme" />
        </div>
      </section>
    </div>

    <ExportDialog
      v-model="showExportDialog"
      :default-name="fileName"
      @confirm="onConfirmDownload"
    />
  </div>
</template>
