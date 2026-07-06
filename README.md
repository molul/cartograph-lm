# Cartograph

Aplicación Nuxt 4 + Tailwind CSS que convierte un archivo Markdown en un mapa mental interactivo, usando las mismas librerías que [markmap.js.org](https://markmap.js.org) (`markmap-lib`, `markmap-view`, `markmap-render`).

- **Izquierda**: contenido del `.md` cargado (editable en vivo).
- **Derecha**: mapa mental que se redibuja al instante con cada cambio.
- **Descargar HTML**: genera un archivo `.html` autónomo con el mismo mapa interactivo, listo para abrir en cualquier navegador o compartir.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Abre http://localhost:3000

## Build de producción

```bash
npm run build
npm run preview
```

## Notas

- El componente `app/components/MarkmapCanvas.client.vue` lleva el sufijo `.client.vue` porque `markmap-view` depende del DOM/SVG y solo debe ejecutarse en el navegador.
- El HTML exportado carga sus assets (D3, estilos del toolbar, etc.) desde jsdelivr, igual que hace por defecto el propio markmap.js.org. Si necesitas que el HTML funcione 100% offline, se puede adaptar `fillTemplate` para incrustar los assets en línea.
- Puedes cambiar la paleta de colores y tipografías en `tailwind.config.ts`.
