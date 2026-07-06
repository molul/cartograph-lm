<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { fillTemplate } from "markmap-render";

type ThemeId = "rainbow" | "byLevel" | "gray" | "grayByLevel";

const props = defineProps<{
  markdown: string;
  theme: ThemeId;
}>();

const svgRef = ref<SVGSVGElement | null>(null);

const transformer = new Transformer();
let markmap: Markmap | null = null;
let colorObserver: MutationObserver | null = null;
// Guardamos el último resultado de la transformación para poder exportarlo
let lastRoot: ReturnType<Transformer["transform"]>["root"] | null = null;
let lastAssets: ReturnType<Transformer["getUsedAssets"]> | null = null;

// Estilo "cajas de color" (a la NotebookLM) en vez de las líneas por defecto
// de markmap. El color en sí lo calcula applyNodeTheme y lo deja en la
// variable CSS `--mm-node-color`; este bloque solo se encarga de dibujar
// la caja con esa variable.
const NODE_THEME_CSS = `
.markmap-node > line {
  opacity: 0;
}
.markmap-foreign > div > div {
  background: var(--mm-node-color, #64748b);
  color: #fff;
  padding: 3px 10px;
  border-radius: 6px;
  /* Borde hacia dentro: un "border" normal aumenta el tamaño de la caja y el
     foreignObject (con ancho/alto ya fijados por el layout de markmap) lo
     recorta por la derecha/abajo. El inset del box-shadow no afecta al
     tamaño, así que no se recorta. */
  box-shadow: inset 0 0 0 1px rgba(229, 231, 235, .8);
}
.markmap-link {
  stroke-opacity: .35;
}
`;

// Paletas para cada tema. "rainbow" asigna un color distinto por nodo (por
// orden de aparición, como hacía markmap por defecto); el resto dependen
// solo de la profundidad.
const RAINBOW_PALETTE = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];
const LEVEL_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];
const GRAY_UNIFORM = "#52525b";
const GRAY_LEVEL_PALETTE = ["#27272a", "#3f3f46", "#52525b", "#71717a", "#a1a1aa"];

function resolveColor(
  theme: ThemeId,
  path: string,
  depth: number,
  rainbowCache: Map<string, string>,
) {
  if (theme === "byLevel") return LEVEL_PALETTE[(depth - 1) % LEVEL_PALETTE.length];
  if (theme === "gray") return GRAY_UNIFORM;
  if (theme === "grayByLevel") {
    return GRAY_LEVEL_PALETTE[Math.min(depth - 1, GRAY_LEVEL_PALETTE.length - 1)];
  }
  if (!rainbowCache.has(path)) {
    rainbowCache.set(path, RAINBOW_PALETTE[rainbowCache.size % RAINBOW_PALETTE.length]);
  }
  return rainbowCache.get(path)!;
}

// Aplica el tema elegido (color de caja/línea/círculo/enlace) y corrige el
// centrado vertical de la caja. No dependemos del `color` interno de
// markmap: lo calculamos nosotros a partir de data-path/data-depth (que
// markmap ya deja en el DOM) para poder ofrecer temas -por nivel, grises-
// que la librería no soporta de forma nativa.
//
// markmap posiciona el <foreignObject> de cada nodo en y=0 dentro de su
// grupo, dejando su BORDE INFERIOR (no su centro) donde el círculo de
// plegado y los enlaces se conectan (pensado para una línea de subrayado
// pegada abajo). Con una caja de color visible eso se ve descentrado, así
// que desplazamos el foreignObject hacia abajo para que su centro coincida
// con ese punto de conexión.
//
// El desplazamiento necesario es la mitad de la altura de la caja, pero NO
// podemos usar la altura de CADA caja: markmap reserva a cada nodo un hueco
// vertical basado solo en su propia altura (sin contar este desplazamiento),
// así que una caja de varias líneas se desplazaría mucho más que sus
// vecinas y acabaría invadiendo el hueco del siguiente nodo del árbol. Para
// evitarlo, usamos como referencia la altura del nodo MÁS PEQUEÑO del árbol
// (que siempre es de una sola línea) y desplazamos todas las cajas por
// igual esa misma cantidad fija.
function applyNodeTheme(container: Element, theme: ThemeId) {
  const foreignObjects = [
    ...container.querySelectorAll("foreignObject.markmap-foreign"),
  ];
  const heights = foreignObjects
    .map((foreign) => parseFloat(foreign.getAttribute("height") || "0"))
    .filter((height) => height > 0);
  const shift = heights.length ? Math.min(...heights) / 2 : 0;

  foreignObjects.forEach((foreign) => {
    if (!parseFloat(foreign.getAttribute("height") || "0")) return;
    if (foreign.getAttribute("y") !== String(shift)) {
      foreign.setAttribute("y", String(shift));
    }
  });

  const rainbowCache = new Map<string, string>();
  const colorByPath = new Map<string, string>();

  container.querySelectorAll("g.markmap-node").forEach((node) => {
    const path = node.getAttribute("data-path") || "";
    const depth = parseInt(node.getAttribute("data-depth") || "1", 10);
    const color = resolveColor(theme, path, depth, rainbowCache);
    colorByPath.set(path, color);

    const box = node.querySelector(
      ":scope > foreignObject.markmap-foreign > div > div",
    ) as HTMLElement | null;
    box?.style.setProperty("--mm-node-color", color);

    const line = node.querySelector(":scope > line");
    line?.setAttribute("stroke", color);

    const circle = node.querySelector(":scope > circle");
    if (circle) {
      circle.setAttribute("stroke", color);
      if (circle.getAttribute("fill") !== "var(--markmap-circle-open-bg)") {
        circle.setAttribute("fill", color);
      }
    }
  });

  container.querySelectorAll("path.markmap-link").forEach((link) => {
    const childPath = link.getAttribute("data-path");
    const color = childPath ? colorByPath.get(childPath) : undefined;
    if (color) link.setAttribute("stroke", color);
  });
}

// Observa el árbol del SVG y reaplica el tema cada vez que markmap toca el
// tamaño (`height`) de un nodo o añade nodos nuevos —al plegar/desplegar
// una rama, o en el reflow interno que dispara al terminar de cargar las
// fuentes web—, sin pasar por nuestro código. `getTheme` se consulta en
// cada pasada para reflejar siempre el tema seleccionado en ese momento.
function observeNodeTheme(container: Element, getTheme: () => ThemeId) {
  applyNodeTheme(container, getTheme());
  const observer = new MutationObserver(() => applyNodeTheme(container, getTheme()));
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
// así que no puede depender de nada externo ni de closures). El tema se
// recibe como argumento, fijado al valor elegido en el momento de exportar.
function exportThemeScript(themeArg: unknown) {
  const theme = themeArg as ThemeId;
  const RAINBOW_PALETTE = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
  ];
  const LEVEL_PALETTE = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#65a30d",
  ];
  const GRAY_UNIFORM = "#52525b";
  const GRAY_LEVEL_PALETTE = ["#27272a", "#3f3f46", "#52525b", "#71717a", "#a1a1aa"];

  function resolveColor(path: string, depth: number, rainbowCache: Map<string, string>) {
    if (theme === "byLevel") return LEVEL_PALETTE[(depth - 1) % LEVEL_PALETTE.length];
    if (theme === "gray") return GRAY_UNIFORM;
    if (theme === "grayByLevel") {
      return GRAY_LEVEL_PALETTE[Math.min(depth - 1, GRAY_LEVEL_PALETTE.length - 1)];
    }
    if (!rainbowCache.has(path)) {
      rainbowCache.set(path, RAINBOW_PALETTE[rainbowCache.size % RAINBOW_PALETTE.length]);
    }
    return rainbowCache.get(path)!;
  }

  function applyNodeTheme(container: Element) {
    const foreignObjects = [
      ...container.querySelectorAll("foreignObject.markmap-foreign"),
    ];
    const heights = foreignObjects
      .map((foreign) => parseFloat(foreign.getAttribute("height") || "0"))
      .filter((height) => height > 0);
    const shift = heights.length ? Math.min(...heights) / 2 : 0;

    foreignObjects.forEach((foreign) => {
      if (!parseFloat(foreign.getAttribute("height") || "0")) return;
      if (foreign.getAttribute("y") !== String(shift)) {
        foreign.setAttribute("y", String(shift));
      }
    });

    const rainbowCache = new Map<string, string>();
    const colorByPath = new Map<string, string>();

    container.querySelectorAll("g.markmap-node").forEach((node) => {
      const path = node.getAttribute("data-path") || "";
      const depth = parseInt(node.getAttribute("data-depth") || "1", 10);
      const color = resolveColor(path, depth, rainbowCache);
      colorByPath.set(path, color);

      const box = node.querySelector(
        ":scope > foreignObject.markmap-foreign > div > div",
      ) as HTMLElement | null;
      if (box) box.style.setProperty("--mm-node-color", color);

      const line = node.querySelector(":scope > line");
      line?.setAttribute("stroke", color);

      const circle = node.querySelector(":scope > circle");
      if (circle) {
        circle.setAttribute("stroke", color);
        if (circle.getAttribute("fill") !== "var(--markmap-circle-open-bg)") {
          circle.setAttribute("fill", color);
        }
      }
    });

    container.querySelectorAll("path.markmap-link").forEach((link) => {
      const childPath = link.getAttribute("data-path");
      const color = childPath ? colorByPath.get(childPath) : undefined;
      if (color) link.setAttribute("stroke", color);
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
  if (svgRef.value) applyNodeTheme(svgRef.value, props.theme);
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  setTimeout(() => {
    if (svgRef.value) {
      markmap = createMarkmap(svgRef.value);
      colorObserver = observeNodeTheme(svgRef.value, () => props.theme);
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

watch(
  () => props.theme,
  (theme) => {
    // Cambiar de tema es solo recolorear: no hace falta pasar por
    // markmap.setData()/fit(), así que no lo encolamos con los renders.
    if (svgRef.value) applyNodeTheme(svgRef.value, theme);
  },
);

function fit() {
  // También encolado: si hay un render en curso, esperamos a que acabe
  // antes de reencuadrar, para no leer un rect a medio calcular.
  queue(() => {
    markmap?.fit();
  });
}

function buildExportHtml() {
  if (!lastRoot || !lastAssets) return null;

  // Por defecto fillTemplate carga d3 y markmap-view desde jsdelivr. Para no
  // depender de que ese CDN siga sirviendo esas versiones para siempre,
  // apuntamos en su lugar a nuestra propia copia (ver public/vendor/,
  // sincronizada desde node_modules por scripts/sync-vendor.mjs). Usamos
  // location.origin en vez de una URL fija: el HTML exportado se abre fuera
  // de esta app (como archivo local o en cualquier navegador), así que la
  // ruta tiene que ser absoluta, pero así apunta siempre a donde esté
  // desplegada la app en cada momento (producción, preview, localhost...).
  const vendorBaseUrl = new URL("/vendor/", window.location.origin).href;

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
      {
        type: "iife" as const,
        data: { fn: exportThemeScript, getParams: () => [props.theme] },
      },
    ],
  };

  return fillTemplate(lastRoot, assets, {
    jsonOptions: { duration: 300, paddingX: 16 },
    baseJs: [
      { type: "script", data: { src: `${vendorBaseUrl}d3.min.js` } },
      { type: "script", data: { src: `${vendorBaseUrl}markmap-view.min.js` } },
    ],
  });
}

function download(filename: string, format: "html" | "txt" = "html") {
  const html = buildExportHtml();
  if (!html) return;

  const mimeType = format === "txt" ? "text/plain" : "text/html";
  const extension = `.${format}`;

  const blob = new Blob([html], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(extension) ? filename : `${filename}${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyHtml() {
  const html = buildExportHtml();
  if (!html) return false;
  await navigator.clipboard.writeText(html);
  return true;
}

defineExpose({ fit, download, copyHtml });
</script>

<template>
  <svg ref="svgRef" class="markmap-svg" />
</template>
