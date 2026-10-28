# Mi cartera — panel personal de fondos indexados

App web instalable (PWA) en HTML/CSS/JS puro, sin servidor ni dependencias. Funciona en el móvil, sin conexión.
**No usa ni pide credenciales de MyInvestor.** Tus participaciones, capital, movimientos y objetivos se guardan
solo en tu dispositivo (localStorage). Solo se descargan precios públicos de los fondos.

## Ejecutar en local
    cd cartera
    python3 -m http.server 8000      # y abre http://localhost:8000
    node tests/calc.test.mjs && node tests/parse.test.mjs   # tests (Node 18+)

## Instalar en el móvil (añadir a pantalla de inicio)
Sube la carpeta a GitHub Pages (gratis): repositorio **público o privado con Pages**, Settings → Pages → rama `main`, carpeta `/ (root)`.
Abre la URL en el móvil → Compartir / menú → "Añadir a pantalla de inicio".
El repositorio solo contiene código y precios públicos: tus datos personales NO están en él.

## Actualizar el valor liquidativo a mano
Ajustes → Valores liquidativos → escribe el precio de cada fondo (y la fecha) → Guardar.
Queda marcado "(manual)" con su fecha en la pantalla de inicio. Si difiere más de un 15 % del último, pide confirmación.

## Actualización automática (preparada, sin probar en vivo)
`.github/workflows/update-nav.yml` ejecuta `scripts/update-nav.mjs` (días laborables), que lee las fichas públicas de
finanzen.net/.at (URLs en `scripts/sources.json`, por ISIN), valida y guarda `data/nav.json` y `data/nav-history.json`.
La app los lee de su propio sitio. Pendiente: ejecutar el workflow una vez (Actions → Run workflow) y comprobar el log;
si el formato de la web no coincide, se ajusta `scripts/parse.mjs`. Si falla, la app conserva el último dato y muestra su fecha.

## Notas
- ISIN del S&P 500 (LU0996179007) deducido por el nombre: confírmalo en la ficha del fondo en MyInvestor.
- Participaciones de aportaciones/traspasos nuevos: se estiman con el valor liquidativo de la fecha; corrígelas con las reales.
- Las proyecciones son simulaciones, no garantizan rentabilidad.
