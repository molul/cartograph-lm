<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { fillTemplate } from 'markmap-render'

const props = defineProps<{
  markdown: string
}>()

const svgRef = ref<SVGSVGElement | null>(null)

const transformer = new Transformer()
let markmap: Markmap | null = null
// Guardamos el último resultado de la transformación para poder exportarlo
let lastRoot: ReturnType<Transformer['transform']>['root'] | null = null
let lastAssets: ReturnType<Transformer['getUsedAssets']> | null = null

// markmap-view trae su propio ResizeObserver interno que puede disparar un
// renderData() por su cuenta (p. ej. cuando terminan de cargar las fuentes
// web y el texto cambia de tamaño). Si eso ocurre justo mientras nosotros
// estamos a mitad de un setData()/fit() propio, las dos ejecuciones async
// se solapan y el mapa acaba fuera de la vista de forma permanente, sin que
// un simple recargar la arregle (depende de una carrera de tiempos, no de
// un estado guardado). Encolamos todas nuestras llamadas para que nunca se
// solapen entre sí...
let renderChain: Promise<void> = Promise.resolve()

function queue(task: () => Promise<void> | void) {
  renderChain = renderChain.then(task).catch((err) => {
    console.error('[Cartograph] Error renderizando el mapa mental:', err)
  })
  return renderChain
}

// ...y activamos autoFit para que, sea cual sea el renderData() que termine
// el último (el nuestro o el interno del ResizeObserver), la vista se
// reencuadre siempre usando el rect recién calculado por ESE mismo render.
// Esto hace que el ajuste de cámara sea autocorrectivo pase lo que pase.
function createMarkmap(svg: SVGSVGElement) {
  return Markmap.create(svg, {
    duration: 300,
    maxWidth: 320,
    autoFit: true,
  })
}

async function renderMarkdown(markdown: string) {
  const { root, features } = transformer.transform(markdown)
  lastRoot = root
  lastAssets = transformer.getUsedAssets(features)

  if (!markmap) return
  await markmap.setData(root)
  markmap.fit()
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  if (svgRef.value) {
    markmap = createMarkmap(svgRef.value)
  }
  queue(() => renderMarkdown(props.markdown))
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  markmap?.destroy()
  markmap = null
})

watch(
  () => props.markdown,
  (md) => {
    // Pequeño debounce: evita encadenar un render por cada pulsación de
    // tecla al escribir directamente en el editor.
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      queue(() => renderMarkdown(md))
    }, 150)
  },
)

function fit() {
  // También encolado: si hay un render en curso, esperamos a que acabe
  // antes de reencuadrar, para no leer un rect a medio calcular.
  queue(() => {
    markmap?.fit()
  })
}

function download(filename: string) {
  if (!lastRoot || !lastAssets) return

  const html = fillTemplate(lastRoot, lastAssets, {
    jsonOptions: { duration: 300 },
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

defineExpose({ fit, download })
</script>

<template>
  <svg ref="svgRef" class="markmap-svg" />
</template>
