# Clawd Quest — Un mundo de código

Plataformas 2D de scroll lateral en pixel art protagonizado por Clawd. Todo (gráficos, niveles,
música y efectos) se genera por código dentro de **un solo archivo**: `clawd-quest.html`.
Ábrelo en el navegador y juega.

## Controles

| Acción | Teclado | Mando |
|---|---|---|
| Moverse | ← → / A D | Cruceta / stick |
| Saltar (mantener = más alto) | Z / Espacio | A |
| Correr / lanzar bolas de código | X / Shift | B / X |
| Agacharse / entrar en tubería | ↓ / S | ↓ |
| Trepar enredadera | ↑ / W | ↑ |
| Pausa | Esc / P | Start |
| Silenciar | M | Select |

En pantallas táctiles aparecen botones en pantalla.

## Estructura

- `src/levels.js` — los 4 niveles como arrays de strings (un carácter por tile, editables a mano).
- `src/core.js` — simulación determinista (física, entidades, IA, jefe, bot de pruebas). Sin DOM.
- `src/gfx.js` · `src/audio.js` · `src/main.js` — pixel art, Web Audio (música y efectos), juego.
- `tools/levelgen.js` — generador que escribe `src/levels.js`.
- `tools/build.js` — ensambla `clawd-quest.html`.
- `tools/bot-test.js` — bot de pruebas en Node sobre el núcleo embebido en el HTML.

```bash
node tools/build.js
```

```bash
node tools/bot-test.js --chunk 6,8
```

El bot usa búsqueda en haz sobre la física exacta del juego, con cada pulsación mantenida
al menos 6 (u 8) frames, y repite la secuencia encontrada desde cero para confirmarla.
También se puede lanzar desde el juego: Opciones → Bot de pruebas.
