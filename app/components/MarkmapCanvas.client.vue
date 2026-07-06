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

async function renderMarkdown(markdown: string) {
  const { root, features } = transformer.transform(markdown)
  lastRoot = root
  lastAssets = transformer.getUsedAssets(features)

  if (markmap) {
    // OJO: setData() es async y solo calcula el bounding box real del
    // árbol tras un requestAnimationFrame interno. Si se llama a fit()
    // sin esperar a que termine, la cámara se centra sobre un rect
    // todavía a cero y el mapa queda fuera de la vista (lienzo en blanco).
    await markmap.setData(root)
    markmap.fit()
  }
}

onMounted(() => {
  if (svgRef.value) {
    markmap = Markmap.create(svgRef.value, {
      duration: 300,
      maxWidth: 320,
    })
  }
  renderMarkdown(props.markdown)
})

onBeforeUnmount(() => {
  markmap?.destroy()
  markmap = null
})

watch(
  () => props.markdown,
  (md) => renderMarkdown(md),
)

function fit() {
  markmap?.fit()
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
