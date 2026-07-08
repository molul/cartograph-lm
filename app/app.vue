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

## Personalización
- Cambia el estilo de colores del mapa con el selector de arriba a la derecha
- Pulsa "Centrar" para reencuadrar el mapa en la vista

## Exportar
- Pulsa "Descargar HTML" para guardar un archivo autónomo con el mapa interactivo
- Pulsa "Descargar TXT" para guardar el mapa en html como fichero de texto, listo para abrir con cualquier editor
- Pulsa "Copiar HTML" para copiar el HTML al portapapeles
`;

type ThemeId = "rainbow" | "byLevel" | "gray" | "grayByLevel";

const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: "rainbow", label: "Arco iris" },
  { value: "byLevel", label: "Colores por nivel" },
  { value: "gray", label: "Grises" },
  { value: "grayByLevel", label: "Grises por nivel" },
];

const markdown = ref(DEFAULT_MARKDOWN);
const theme = ref<ThemeId>("byLevel");
const fileName = ref("mapa-mental");
const fileInput = ref<HTMLInputElement | null>(null);
const canvasRef = ref<{
  fit: () => void;
  download: (filename: string, format?: "html" | "txt") => void;
  copyHtml: () => Promise<boolean>;
} | null>(null);
const showExportDialog = ref(false);
const exportFormat = ref<"html" | "txt">("html");
const copyState = ref<"idle" | "copied" | "error">("idle");
let copyStateTimer: ReturnType<typeof setTimeout> | undefined;

const displayName = computed(() => `${fileName.value}.md`);

/**
 * Algunos exports de NotebookLM añaden como primera línea un título "de
 * más" (el nombre del documento en NotebookLM, no un nodo real del mapa
 * mental). Lo identificamos porque, en ese caso, el título tiene una única
 * rama de segundo nivel colgando de él — todo el contenido real vive dentro
 * de ese único hijo. Si el título en cambio tiene varios hijos hermanos (el
 * caso normal, como el markdown de ejemplo de esta app), lo dejamos tal
 * cual porque sí es un título con estructura propia.
 *
 * Ejemplo que SÍ se recorta (un único hijo de segundo nivel):
 *   # Prestaciones Esquema
 *   ## Prestaciones Contributivas de la Seguridad Social
 *     - Incapacidad Temporal
 *     ...
 *
 * Ejemplo que NO se recorta (varios hijos de segundo nivel):
 *   # Cartograph
 *   ## Cómo usarlo
 *   ## Estructura
 *   ## Personalización
 *   ## Exportar
 */
function stripRedundantTitle(text: string): string {
  const lines = text.split("\n");

  // La primera línea no vacía tiene que ser un encabezado para que pueda
  // tratarse siquiera de un título "de más".
  const firstLineIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstLineIndex === -1) return text;

  const firstHeadingMatch = lines[firstLineIndex].match(/^(#{1,6})\s+\S/);
  if (!firstHeadingMatch) return text;

  const firstLevel = firstHeadingMatch[1].length;
  const childLevel = firstLevel + 1;
  const childHeadingRegex = new RegExp(`^#{${childLevel}}\\s+\\S`);
  // Cualquier encabezado de nivel igual o "más alto" que el título original
  // marca el final de su árbol (ya no estamos dentro de sus hijos).
  const sameOrHigherLevelRegex = new RegExp(`^#{1,${firstLevel}}\\s+\\S`);

  let secondLevelHeadingCount = 0;
  for (let i = firstLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (sameOrHigherLevelRegex.test(line)) break;
    if (childHeadingRegex.test(line)) secondLevelHeadingCount++;
  }

  // Solo se considera título "de más" si hay EXACTAMENTE un hijo de
  // segundo nivel. Cero hijos o varios hijos no encajan con el patrón.
  if (secondLevelHeadingCount !== 1) return text;

  const rest = lines.slice(firstLineIndex + 1);
  // Si justo después del título hay una línea en blanco, la quitamos
  // también para no dejar un hueco al principio del archivo.
  if (rest[0]?.trim() === "") rest.shift();
  return rest.join("\n");
}

function triggerUpload() {
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const raw = String(reader.result ?? "");
    markdown.value = stripRedundantTitle(raw);
    fileName.value = file.name.replace(/\.(md|markdown)$/i, "");
  };
  reader.readAsText(file);

  // Permite volver a cargar el mismo archivo si se modifica y se reintenta
  input.value = "";
}

function onDownloadClick(format: "html" | "txt") {
  exportFormat.value = format;
  showExportDialog.value = true;
}

function onConfirmDownload(name: string) {
  fileName.value = name;
  canvasRef.value?.download(name, exportFormat.value);
}

function onFit() {
  canvasRef.value?.fit();
}

async function onCopyHtmlClick() {
  clearTimeout(copyStateTimer);
  const ok = await canvasRef.value?.copyHtml();
  copyState.value = ok ? "copied" : "error";
  copyStateTimer = setTimeout(() => {
    copyState.value = "idle";
  }, 2000);
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
          class="flex shrink-0 items-center justify-between gap-3 border-b border-gray-500 px-4 py-3"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <span
              class="font-sans text-sm uppercase tracking-[0.16em] text-amber-400"
              >Fuente</span
            >
            <span
              class="truncate rounded-sm bg-ink-light px-2 py-0.5 font-mono text-xs text-paper/80"
              >{{ displayName }}</span
            >
          </div>
          <button
            type="button"
            class="shrink-0 rounded border border-amber-500 px-3 py-1.5 font-sans text-sm font-bold text-amber-400 transition-colors hover:bg-amber-500 hover:text-ink"
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
            class="font-sans text-sm uppercase tracking-[0.16em] text-amber-400"
            >Mapa mental</span
          >
          <div class="flex items-center gap-2">
            <div class="relative">
              <select
                v-model="theme"
                class="appearance-none rounded border border-gray-500 bg-ink py-1.5 pl-2 pr-7 font-sans text-sm font-bold text-paper/90 outline-none transition-colors hover:border-amber-500 hover:text-amber-400 cursor-pointer h-[34px]"
              >
                <option
                  v-for="option in THEME_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                  class="text-white font-semibold"
                >
                  {{ option.label }}
                </option>
              </select>
              <svg
                viewBox="0 0 24 24"
                class="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper/80"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>

            <button
              type="button"
              class="rounded border border-gray-500 px-3 py-1.5 font-sans text-sm font-bold text-paper/90 transition-colors hover:border-amber-500 hover:text-amber-400"
              @click="onFit"
            >
              Centrar
            </button>

            <div class="h-8 w-px mx-2 bg-gray-500" aria-hidden="true" />

            <button
              type="button"
              class="shrink-0 rounded border border-amber-500 px-3 py-1.5 font-sans text-sm font-bold text-amber-400 transition-colors hover:bg-amber-500 hover:text-ink"
              @click="onCopyHtmlClick"
            >
              {{
                copyState === "copied"
                  ? "¡Copiado!"
                  : copyState === "error"
                  ? "Error al copiar"
                  : "Copiar HTML"
              }}
            </button>

            <button
              type="button"
              class="shrink-0 rounded border border-amber-500 px-3 py-1.5 font-sans text-sm font-bold text-amber-400 transition-colors hover:bg-amber-500 hover:text-ink"
              @click="onDownloadClick('txt')"
            >
              Descargar TXT
            </button>

            <div class="h-8 w-px mx-2 bg-gray-500" aria-hidden="true" />

            <button
              type="button"
              class="rounded bg-amber-500 px-3 py-1.5 font-sans text-sm font-bold text-ink transition-colors hover:bg-amber-400"
              @click="onDownloadClick('html')"
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
      :format="exportFormat"
      @confirm="onConfirmDownload"
    />
  </div>
</template>
