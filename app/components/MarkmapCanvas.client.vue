<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { fillTemplate } from "markmap-render";

const props = defineProps<{
  markdown: string;
}>();

const svgRef = ref<SVGSVGElement | null>(null);

const transformer = new Transformer();
let markmap: Markmap | null = null;
let colorObserver: MutationObserver | null = null;
// Guardamos el último resultado de la transformación para poder exportarlo
let lastRoot: ReturnType<Transformer["transform"]>["root"] | null = null;
let lastAssets: ReturnType<Transformer["getUsedAssets"]> | null = null;

// Estilo "cajas de color" (a la NotebookLM) en vez de las líneas por defecto
// de markmap. markmap-view pinta el color de cada nodo directamente como
// atributo `stroke` de su <line>; no hay ninguna variable CSS con ese color,
// así que lo copiamos a `--mm-node-color` en tiempo de ejecución (ver
// applyNodeTheme) y el CSS de abajo solo se encarga de dibujar la caja.
const NODE_THEME_CSS = `
.markmap-node > line {
  opacity: 0;
}
.markmap-foreign > div > div {
  background: var(--mm-node-color, #64748b);
  color: #fff;
  padding: 3px 10px;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
}
.markmap-link {
  stroke-opacity: .35;
}
`;

// markmap posiciona el <foreignObject> de cada nodo en y=0 dentro de su
// grupo, dejando su BORDE INFERIOR (no su centro) donde el círculo de
// plegado y los enlaces se conectan (pensado para una línea de subrayado
// pegada abajo). Con una caja de color visible eso se ve descentrado.
// Arreglo: desplazamos el foreignObject hacia abajo la mitad de su propia
// altura, así su centro pasa a coincidir con ese punto de conexión, sin
// tocar el círculo ni los enlaces (que markmap sí recalcula en cada
// render y nos pisaría el cambio).
function centerNodeBoxes(container: Element) {
  container
    .querySelectorAll("foreignObject.markmap-foreign")
    .forEach((foreign) => {
      const height = parseFloat(foreign.getAttribute("height") || "0");
      if (!height) return;
      const y = height / 2;
      if (foreign.getAttribute("y") !== String(y)) {
        foreign.setAttribute("y", String(y));
      }
    });
}

// Copia el color que markmap ya asignó a la <line> de cada nodo hacia la
// caja de fondo del texto (no existe ninguna variable CSS con ese color,
// se aplica directamente como atributo `stroke`).
function syncNodeColors(container: Element) {
  container.querySelectorAll("g.markmap-node").forEach((node) => {
    const line = node.querySelector(":scope > line");
    const box = node.querySelector(
      ":scope > foreignObject.markmap-foreign > div > div",
    ) as HTMLElement | null;
    const color = line?.getAttribute("stroke");
    if (box && color) box.style.setProperty("--mm-node-color", color);
  });
}

function applyNodeTheme(container: Element) {
  centerNodeBoxes(container);
  syncNodeColors(container);
}

// Observa el árbol del SVG y reaplica el tema cada vez que markmap toca el
// tamaño (`height`) de un nodo o añade nodos nuevos —al plegar/desplegar
// una rama, o en el reflow interno que dispara al terminar de cargar las
// fuentes web—, sin pasar por nuestro código.
function observeNodeTheme(container: Element) {
  applyNodeTheme(container);
  const observer = new MutationObserver(() => applyNodeTheme(container));
  observer.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["height"],
  });
  return observer;
}

// Misma lógica, pero autocontenida para incrustarla como <script> en el
// HTML exportado (fillTemplate la serializa con Function.prototype.toString,
// así que no puede depender de nada externo ni de closures).
function exportThemeScript() {
  function applyNodeTheme(container: Element) {
    container
      .querySelectorAll("foreignObject.markmap-foreign")
      .forEach((foreign) => {
        const height = parseFloat(foreign.getAttribute("height") || "0");
        if (!height) return;
        const y = height / 2;
        if (foreign.getAttribute("y") !== String(y)) {
          foreign.setAttribute("y", String(y));
        }
      });

    container.querySelectorAll("g.markmap-node").forEach((node) => {
      const line = node.querySelector(":scope > line");
      const box = node.querySelector(
        ":scope > foreignObject.markmap-foreign > div > div",
      ) as HTMLElement | null;
      const color = line?.getAttribute("stroke");
      if (box && color) box.style.setProperty("--mm-node-color", color);
    });
  }

  const svg = document.querySelector("svg#mindmap");
  if (!svg) return;
  applyNodeTheme(svg);
  new MutationObserver(() => applyNodeTheme(svg)).observe(svg, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["height"],
  });
}

// markmap-view trae su propio ResizeObserver interno que puede disparar un
// renderData() por su cuenta (p. ej. cuando terminan de cargar las fuentes
// web y el texto cambia de tamaño). Si eso ocurre justo mientras nosotros
// estamos a mitad de un setData()/fit() propio, las dos ejecuciones async
// se solapan y el mapa acaba fuera de la vista de forma permanente, sin que
// un simple recargar la arregle (depende de una carrera de tiempos, no de
// un estado guardado). Encolamos todas nuestras llamadas para que nunca se
// solapen entre sí...
let renderChain: Promise<void> = Promise.resolve();

function queue(task: () => Promise<void> | void) {
  renderChain = renderChain.then(task).catch((err) => {
    console.error("[Cartograph] Error renderizando el mapa mental:", err);
  });
  return renderChain;
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
    paddingX: 16,
    style: () => NODE_THEME_CSS,
  });
}

async function renderMarkdown(markdown: string) {
  const { root, features } = transformer.transform(markdown);
  lastRoot = root;
  lastAssets = transformer.getUsedAssets(features);

  if (!markmap) return;
  await markmap.setData(root);
  markmap.fit();
  if (svgRef.value) applyNodeTheme(svgRef.value);
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  setTimeout(() => {
    if (svgRef.value) {
      markmap = createMarkmap(svgRef.value);
      colorObserver = observeNodeTheme(svgRef.value);
    }
    queue(() => renderMarkdown(props.markdown));
  }, 500);
});

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  colorObserver?.disconnect();
  colorObserver = null;
  markmap?.destroy();
  markmap = null;
});

watch(
  () => props.markdown,
  (md) => {
    // Pequeño debounce: evita encadenar un render por cada pulsación de
    // tecla al escribir directamente en el editor.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      queue(() => renderMarkdown(md));
    }, 150);
  },
);

function fit() {
  // También encolado: si hay un render en curso, esperamos a que acabe
  // antes de reencuadrar, para no leer un rect a medio calcular.
  queue(() => {
    markmap?.fit();
  });
}

function download(filename: string) {
  if (!lastRoot || !lastAssets) return;

  // El HTML exportado se renderiza con su propia copia de markmap-view, así
  // que le añadimos el mismo CSS de cajas y el mismo script de sincronía de
  // color para que el archivo descargado tenga el mismo aspecto que la
  // preview.
  const assets = {
    ...lastAssets,
    styles: [
      ...(lastAssets.styles ?? []),
      { type: "style" as const, data: NODE_THEME_CSS },
    ],
    scripts: [
      ...(lastAssets.scripts ?? []),
      { type: "iife" as const, data: { fn: exportThemeScript } },
    ],
  };

  const html = fillTemplate(lastRoot, assets, {
    jsonOptions: { duration: 300, paddingX: 16 },
  });

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

defineExpose({ fit, download });
</script>

<template>
  <svg ref="svgRef" class="markmap-svg" />
</template>
