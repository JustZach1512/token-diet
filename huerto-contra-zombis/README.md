# Huerto contra Zombis

Juego de defensa de jardín para el navegador, pensado para móvil.

- 10 niveles, 8 plantas (Girasol, Lanzaguisantes, Nuez, Petacereza, Papamina,
  Hielaguisantes, Carnívora, Repetidora) y 6 tipos de zombi (normal, cono, cubo,
  abanderado, saltador con pértiga y gigante).
- Todo en un solo archivo: `index.html`. Ábrelo en el navegador y listo.
- En vertical el juego se gira solo: pon el móvil en horizontal.
- El progreso se guarda en el navegador.

## Sonido

No hay archivos de audio. Todo se sintetiza en el momento con Web Audio usando
modelado físico: cuerdas pulsadas (Karplus-Strong) para la música, modos
inarmónicos para los golpes al cubo metálico, filtros de formantes de voz para
los gemidos de los zombis y ruido filtrado para mordiscos, tierra y explosiones.
Cada sonido varía un poco al azar para que no se repita idéntico.
