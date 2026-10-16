# Noche de Funk

Juego de ritmo estilo *Friday Night Funkin'* hecho solo con HTML5 Canvas y Web Audio.
No usa imágenes ni archivos de audio: los personajes se dibujan con código y toda la
música (batería, bajo, acordes y las voces de cada personaje) se sintetiza en vivo.

## Cómo jugar

Abre `index.html` en un navegador (Chrome, Edge, Firefox o Safari). Funciona sin
servidor; con internet carga además las tipografías de Google Fonts.

| Acción | Teclado | Táctil |
|---|---|---|
| Flechas | `← ↓ ↑ →` o `D F J K` (configurables) | las 4 columnas de la pantalla |
| Menús | flechas o `W A S D`, `Enter`, `Esc` | cruceta y botones ✔ ✖ |
| Pausa | `Enter` o `Esc` | botón ⏸ |

También funciona con mando (cruceta o botones A/B/X/Y).

## Contenido

- **Modo historia**: tutorial + 6 semanas, cada una con su rival, escenario, estilo
  musical y diálogos antes y después de las canciones. Cada semana se desbloquea al
  completar la anterior.
- **Freeplay**: cualquier canción desbloqueada, con récord, rango y vista previa
  musical.
- **Opciones**: downscroll, flechas al centro, ghost tapping, velocidad de scroll,
  desfase de audio (con calibrador), velocidad de canción, modo práctica, botplay,
  destellos, zoom, calidad, volúmenes, teclas y borrado de progreso.
- Pausa, game over con reintento, pantalla de resultados (SICK/GOOD/BAD/SHIT, precisión,
  rango S+…F, FC) y final con créditos.

## Semanas y dificultad

Cada canción es más difícil que la anterior. La densidad de notas está calibrada por
canción, así que la progresión es estricta en las tres dificultades (lo verifican los
tests). Notas por segundo en DIFÍCIL:

| Semana | Rival | Canciones (BPM) | Notas/s |
|---|---|---|---|
| Tutorial | Luna | Primer Compás (100) | 1,5 |
| 1 · Calle Caliente | DJ Tuerca | Asfalto (106), Grafiti (116), Bocinazo (126) | 1,9 → 2,5 |
| 2 · Noche de Muertos | El Catrín | Calaverita (124), Cempasúchil (134), Más Allá (145) | 2,8 → 3,4 |
| 3 · Club Neón | Vera Voltaje | Neón (128), Voltaje (140), Medianoche (152) | 3,7 → 4,35 |
| 4 · Fábrica 808 | Unidad 808 | Engranaje (150), Sobrecarga (160), Código Rojo (172) | 4,7 → 5,5 |
| 5 · Volcán Furioso | Rey Magma | Brasa (162), Erupción (176), Magma (190) | 5,9 → 6,9 |
| 6 · Torre del Silencio | El Silencio | Estática (184), Vacío (200), **Último Compás (222)** | 7,6 → **10,4** |

Mecánicas que se suman al final:
- **Notas de fuego / estática** (semanas 5 y 6): no las toques, quitan mucha vida.
- **Drenaje** (Vacío y Último Compás): cada nota de El Silencio te roba vida.
- **Último Compás**: 222 BPM, ráfagas de semicorcheas, acordes de tres notas, cortes de
  silencio, fase 2 y flechas que ondulan. Es el nivel tope difícil.

## Estructura

```
index.html        página y orden de carga
js/util.js        utilidades, RNG con semilla y guardado (localStorage)
js/audio.js       sintetizador Web Audio, voces con formantes, secuenciador
js/music.js       compositor procedural y generador de charts calibrados
js/songs.js       semanas, canciones e historia
js/draw.js        texto, flechas y formas
js/characters.js  personajes y sus poses
js/stages.js      escenarios
js/play.js        partida: notas, juicio, vida, cámara, diálogos, pausa
js/menus.js       pantallas de menú, opciones, resultados y final
js/main.js        bucle, transiciones y entrada (teclado, táctil, mando)
```

Las canciones son deterministas: la misma semilla produce siempre la misma música y el
mismo chart, así que los récords son comparables.

## Tests

```
node --test noche-de-funk/test/charts.test.js
```

Comprueban que los charts sean válidos, que no haya notas imposibles (jacks o notas
dentro de una nota sostenida), que la dificultad suba canción a canción, que el final
sea lo más difícil y que un jugador con 95% de aciertos pueda sobrevivir a todo.
