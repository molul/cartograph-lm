// Copia a public/vendor/ los bundles de d3 y markmap-view ya instalados en
// node_modules. El HTML que se descarga/copia desde la app carga estos
// ficheros con un <script src> apuntando a esta misma web (ver
// MarkmapCanvas.client.vue), en vez de depender de un CDN externo que algún
// día podría dejar de servir esas versiones. Se ejecuta en cada
// `npm install` (postinstall) para que public/vendor/ nunca quede
// desincronizado de la versión realmente instalada.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vendorDir = `${root}public/vendor/`;

mkdirSync(vendorDir, { recursive: true });

copyFileSync(`${root}node_modules/d3/dist/d3.min.js`, `${vendorDir}d3.min.js`);
copyFileSync(
  `${root}node_modules/markmap-view/dist/browser/index.js`,
  `${vendorDir}markmap-view.min.js`,
);
