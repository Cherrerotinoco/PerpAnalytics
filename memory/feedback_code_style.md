---
name: feedback-code-style
description: Preferencias de estilo observadas — UI en inglés, lógica inline, estilos como string constante en el mismo archivo
metadata:
  type: feedback
---

Tras cada cambio ejecutar `pnpm lint` y `pnpm typecheck`. El proyecto tiene la regla ESLint `func-style` que obliga a usar function expressions (`const fn = () => {}`) en lugar de function declarations (`function fn() {}`). Aplicar a todos los componentes y helpers.

La UI de la app está en inglés aunque el usuario habla español. Respetar esto al añadir nuevas páginas o componentes.

Los estilos de páginas nuevas se añaden como constante `STYLES` (string de CSS) dentro del mismo archivo `.tsx` del componente, inyectada con `<style>{STYLES}</style>`. No se crean archivos CSS separados para páginas nuevas.

**Why:** El proyecto usa un único `index.css` para estilos globales/shared. Los estilos específicos de página se colocan inline para mantener el archivo global manejable.

**How to apply:** Al crear una nueva página, incluir los estilos como `const STYLES = \`...\`` al final del archivo y renderizarlos con `<style>{STYLES}</style>` dentro del return. Usar los design tokens `--tc-*` para colores, radios y superficies.
