// ───────────────────────── niveles ─────────────────────────
// Ejes: x este, y arriba, z sur. yaw 0 mira al norte (−z), −π/2 al este, π al sur.
const EAST = -Math.PI / 2, WEST = Math.PI / 2, NORTH = 0, SOUTH = Math.PI;

const LEVELS = [
  {
    num: '01', name: 'Primeros pasos', icons: ['portal', 'goo'],
    build(L) {
      room(L, 0, 0, 0, 24, 10, 12, {
        w: { base: 'white' },
        n: { white: [[4, 10, 0, 10], [11, 15, 5, 8.6]] },
        s: { white: [[0, 10, 0, 10]] },
        e: { white: [[1.5, 8.5, 5, 9.5]] },
      });
      addBox(L, 10, 0, 0, 16, 5, 12);
      addBox(L, 20, 0, 0, 24, 5, 12);
      L.goo.push({ min: [16, 0, 0], max: [20, 1.2, 12] });
      L.exits.push({ pos: [21.7, 5, 10.3] });
      L.spawn = { pos: [3.2, 0, 6], yaw: EAST };
      L.sign = { pos: [2, 2.6, 0], normal: [0, 0, 1] };
      L.lights.push({ pos: [5, 8.6, 6], i: 60, d: 20 }, { pos: [13, 9, 6], i: 55, d: 18 }, { pos: [22, 9, 6], i: 55, d: 16 });
      L.strips.push([[1, 9.95, 3], [23, 9.95, 3]], [[1, 9.95, 9], [23, 9.95, 9]]);
      L.hazard.push([15.7, 5, 0, 16, 12], [20, 5, 0, 20.3, 12]);
      L.windows.push({ pos: [18, 7.6, 12], normal: [0, 0, -1], w: 4, h: 1.6 });
      L.messages.push(
        { t: 1.2, text: 'Hola. Soy N.O.R.A., supervisora de ensayos del Centro Umbral. Hoy vas a probar el Dispositivo de Portales.' },
        { t: 8, text: 'Clic izquierdo dispara un portal AZUL; clic derecho, uno NARANJA. Entra por uno y saldrás por el otro.' },
        { t: 15, text: 'Los portales solo se fijan en paneles BLANCOS. El metal oscuro los rechaza. Como yo a la mayoría de la gente.' },
      );
      L.triggers.push({ min: [10, 5, 0], max: [16, 8, 12], text: 'Bien. Ahora cruza el fluido. No hace falta mover los dos portales: basta con uno.' });
      L.onDeath = ['Ese fluido no es tan amistoso como parece. Otra vez, por favor.'];
    },
  },
  {
    num: '02', name: 'Peso muerto', icons: ['portal', 'cube', 'button'],
    build(L) {
      room(L, 0, 0, 0, 20, 8, 14, {
        w: { base: 'white' }, s: { base: 'white' },
        n: { holes: [[4, 12, 4, 8]] },
        e: { white: [[0, 4, 3, 8]], holes: [[6, 8, 0, 3]] },
      });
      room(L, 4, 0, -9, 12, 8, -1, { skip: ['s'], noExt: ['s'], n: { base: 'white' }, w: { base: 'white' }, e: { base: 'white' } });
      addBox(L, 16, 0, 0, 20, 3, 4);
      room(L, 21, 0, 5, 28, 4, 9, { skip: ['w'], noExt: ['w'] });
      L.buttons.push({ id: 'b1', pos: [18, 3, 2] });
      L.doors.push({ pos: [20.5, 0, 7], axis: 'x', w: 2, h: 3, requires: ['b1'] });
      L.cubes.push({ pos: [8, 0.34, -5] });
      L.exits.push({ pos: [26.3, 0, 7] });
      L.indicators.push(
        { ids: ['b1'], points: [[18, 3, 2.98], [18, 3, 3.9]] },
        { ids: ['b1'], normal: [0, 0, 1], points: [[18, 2.9, 4], [18, 0.2, 4]] },
        { ids: ['b1'], points: [[18, 0, 4.4], [18, 0, 7], [19.6, 0, 7]] },
      );
      L.spawn = { pos: [10, 0, 11.5], yaw: NORTH };
      L.sign = { pos: [1.2, 2.6, 14], normal: [0, 0, -1], onWall: 's' };
      L.lights.push({ pos: [6, 7, 8], i: 45, d: 18 }, { pos: [14, 7, 8], i: 45, d: 18 }, { pos: [8, 7, -5], i: 35, d: 12 }, { pos: [18, 6.5, 2], i: 22, d: 9 }, { pos: [24.5, 3.6, 7], i: 14, d: 8 });
      L.strips.push([[2, 7.95, 7], [18, 7.95, 7]], [[8, 7.95, -8], [8, 7.95, -2]]);
      L.messages.push(
        { t: 1.2, text: 'Prueba 02. Te presento al Cubo de Almacenamiento Ponderado. Pulsa E para cogerlo y otra vez E para soltarlo.' },
        { t: 9, text: 'El cubo está en el almacén. Mira por la abertura y busca paneles blancos dentro.' },
      );
      L.triggers.push({ min: [4, 0, -9], max: [12, 4, -1], text: 'Los portales se quedan donde los dejas. Para volver, mueve solo UNO de ellos.' });
      L.onEvent = { picked: 'Buen agarre. El botón de la plataforma abre la puerta mientras algo pese sobre él.' };
    },
  },
  {
    num: '03', name: 'Impulso', icons: ['portal', 'fling', 'goo'],
    build(L) {
      room(L, 0, -4, 0, 30, 16, 14, {
        w: { white: [[4, 14, 0, 16]] },
        s: { white: [[0, 10, 0, 16]] },
      });
      addBox(L, 0, -4, 0, 10, 12, 4);
      addBox(L, 0, -4, 4, 10, 0, 14, 'white');
      addBox(L, 14, -4, 0, 30, 1.5, 14);
      L.goo.push({ min: [10, -4, 0], max: [14, -1.5, 14] });
      L.exits.push({ pos: [26.5, 1.5, 7] });
      L.spawn = { pos: [5, 12, 2], yaw: SOUTH };
      L.sign = { pos: [8.5, 14, 0], normal: [0, 0, 1] };
      L.lights.push({ pos: [5, 15, 9], i: 80, d: 26 }, { pos: [20, 13, 7], i: 75, d: 24 }, { pos: [27, 6, 7], i: 40, d: 14 });
      L.strips.push([[5, 15.95, 1], [5, 15.95, 13]], [[22, 15.95, 1], [22, 15.95, 13]]);
      L.hazard.push([13.7, 1.5, 0, 14, 14]);
      L.windows.push({ pos: [22, 11, 0], normal: [0, 0, 1], w: 5, h: 2 });
      L.messages.push(
        { t: 1.2, text: 'Prueba 03: Impulso. Lo que entra rápido en un portal, sale igual de rápido. Es física. Más o menos.' },
        { t: 9, text: 'Pon un portal en el suelo de abajo y otro en la pared blanca. Después, salta.' },
        { t: 18, text: 'Cuanto más alto caigas, más rápido saldrás. Y saldrás hacia donde mire el portal de salida.' },
      );
      L.onDeath = ['Casi. Prueba a colocar el portal de salida más alto en la pared.', 'Recuerda: la velocidad de la caída se conserva. Salta desde lo más alto.'];
    },
  },
  {
    num: '04', name: 'Alta energía', icons: ['portal', 'pellet', 'cube', 'button', 'fizzler'],
    build(L) {
      room(L, 0, 0, 0, 18, 9, 14, {
        w: { white: [[5.4, 8.6, 0, 4.5]] },
        s: { white: [[1, 7, 0, 4.5]] },
        e: { holes: [[10.5, 12.5, 0, 3]] },
      });
      room(L, 19, 0, 10, 22, 4, 13, { skip: ['w', 'e'], noExt: ['w', 'e'] });
      room(L, 23, 0, 4, 37, 9, 18, {
        e: { base: 'white' },
        w: { holes: [[10, 13, 0, 4]] },
        s: { holes: [[30, 32, 0, 3]] },
      });
      room(L, 29.5, 0, 19, 32.5, 4, 25, { skip: ['n'], noExt: ['n'] });
      L.launchers.push({ pos: [4, 1.1, 0.42], dir: [0, 0, 1], receiver: 'r1' });
      L.receivers.push({ id: 'r1', pos: [18, 1.1, 7], normal: [-1, 0, 0] });
      L.doors.push({ pos: [18.5, 0, 11.5], axis: 'x', w: 2, h: 3, requires: ['r1'], latch: true });
      L.doors.push({ pos: [31, 0, 18.5], axis: 'z', w: 2, h: 3, requires: ['b2'] });
      L.droppers.push({ pos: [12, 9, 4] });
      L.fizzlers.push({ min: [20.4, 0, 10], max: [20.6, 4, 13] });
      L.buttons.push({ id: 'b2', pos: [30, 0, 11] });
      L.exits.push({ pos: [31, 0, 22.6] });
      L.indicators.push(
        { ids: ['r1'], points: [[17.4, 0, 7.8], [17.4, 0, 10.2]] },
        { ids: ['b2'], points: [[30, 0, 12.1], [30, 0, 17.6]] },
      );
      L.spawn = { pos: [12, 0, 11], yaw: NORTH };
      L.sign = { pos: [9, 2.6, 0], normal: [0, 0, 1] };
      L.lights.push({ pos: [9, 8, 7], i: 50, d: 20 }, { pos: [4, 4, 11], i: 22, d: 12 }, { pos: [30, 8, 11], i: 60, d: 22 }, { pos: [20.5, 3.5, 11.5], i: 10, d: 7, color: 0x8fc4ff });
      L.strips.push([[2, 8.95, 7], [16, 8.95, 7]], [[25, 8.95, 11], [35, 8.95, 11]]);
      L.windows.push({ pos: [9, 6.8, 14], normal: [0, 0, -1], w: 5, h: 1.8 });
      L.messages.push(
        { t: 1.2, text: 'Prueba 04: Alta energía. Esa esfera es una Bola de Energía Combinada. Su contacto es mortal. Te lo digo una vez.' },
        { t: 9, text: 'Las bolas atraviesan portales igual que tú. Dirige una hacia el receptor de la pared derecha.' },
      );
      L.onEvent = {
        received: 'Receptor cargado. La puerta permanecerá abierta. Por fin algo funciona en este edificio.',
        fizzler: 'Los campos de emancipación desintegran los objetos no autorizados. Y tus portales, también.',
        cubeFizzled: 'Ese cubo no estaba autorizado a cruzar. Te daremos otro. Quizá no deba pasar por el campo...',
      };
      L.onDeath = ['Las bolas de energía queman. Ya te lo había dicho.'];
    },
  },
  {
    num: '05', name: 'Prueba final', icons: ['portal', 'cube', 'button', 'fling', 'goo', 'fizzler', 'timer'],
    build(L) {
      // sala principal: plataforma de inicio (SA), plataforma baja (LP), foso y plataforma lejana (FP)
      room(L, 0, -4, 0, 20, 24, 28, {
        n: { white: [[6, 20, 2, 22], [0, 6, 12, 24]] },
        w: { white: [[4, 14, 12, 24]] },
        skip: ['s'],
      });
      slab(L, v3(-1, -4, 28), v3(21, 24, 28.5), 'z', { holes: [[9, 11, 1, 4]] });
      slab(L, v3(-1, -4, 28.5), v3(21, 24, 29), 'z', { white: [[6, 20, 3, 21], [0, 6, 13, 21]], holes: [[9, 11, 1, 4]] });
      addBox(L, 0, -4, 0, 6, 12, 14);
      slab(L, v3(6, -4, 0), v3(20, 0, 8), 'y', { white: [[6, 12.5, 0, 8], [13, 17, 2, 6]] });
      addBox(L, 13, 0, 2, 13.15, 3, 6, 'glass');
      addBox(L, 16.85, 0, 2, 17, 3, 6, 'glass');
      addBox(L, 13.15, 0, 2, 16.85, 3, 2.15, 'glass');
      addBox(L, 13.15, 0, 5.85, 16.85, 3, 6, 'glass');
      L.cubes.push({ pos: [15, 0.34, 4] });
      L.goo.push({ min: [0, -4, 8], max: [20, -1, 20] });
      addBox(L, 0, -4, 20, 20, 1, 28);
      L.buttons.push({ id: 'b1', pos: [10, 1, 24] });
      L.doors.push({ pos: [10, 1, 28.5], axis: 'z', w: 2, h: 3, requires: ['b1'] });
      L.indicators.push({ ids: ['b1'], points: [[10, 1, 25.1], [10, 1, 28]] });
      // segunda sala: saliente alto (HL) con pulsador temporizado, foso y salida tras un campo
      room(L, 0, -4, 29, 20, 21, 61, { skip: ['n'], noExt: ['n'], s: { holes: [[9, 11, 1, 4]] } });
      slab(L, v3(0, -4, 29), v3(20, 1, 37), 'y', { white: [[6, 12, 29, 37]] });
      addBox(L, 0, 1, 29, 6, 11, 37);
      L.pedestals.push({ id: 'p3', pos: [3, 11, 34], duration: 9 });
      L.goo.push({ min: [0, -4, 37], max: [20, 0, 51] });
      addBox(L, 0, -4, 51, 20, 1, 61);
      L.fizzlers.push({ min: [0, 1, 58.9], max: [20, 21, 59.1] });
      L.doors.push({ pos: [10, 1, 61.5], axis: 'z', w: 2, h: 3, requires: ['p3'] });
      L.indicators.push({ ids: ['p3'], points: [[4.2, 11, 34], [5.8, 11, 34]] }, { ids: ['p3'], points: [[10, 1, 52], [10, 1, 58.6]] }, { ids: ['p3'], points: [[10, 1, 59.4], [10, 1, 61]] });
      room(L, 8.5, 1, 62, 11.5, 5, 68, { skip: ['n'], noExt: ['n'] });
      L.exits.push({ pos: [10, 1, 66] });
      L.spawn = { pos: [3, 12, 10], yaw: EAST };
      L.sign = { pos: [0, 14.6, 2], normal: [1, 0, 0] };
      L.lights.push(
        { pos: [10, 20, 6], i: 90, d: 28 }, { pos: [10, 14, 24], i: 70, d: 22 }, { pos: [15, 4, 4], i: 18, d: 8 },
        { pos: [8, 17, 33], i: 70, d: 22 }, { pos: [10, 12, 55], i: 80, d: 24 }, { pos: [10, 4.5, 64], i: 14, d: 8 },
      );
      L.strips.push([[3, 23.95, 2], [3, 23.95, 26]], [[14, 23.95, 2], [14, 23.95, 26]], [[4, 20.95, 31], [4, 20.95, 59]], [[16, 20.95, 31], [16, 20.95, 59]]);
      L.hazard.push([5.7, 12, 8, 6, 14], [0, 1, 20, 20, 20.3], [0, 1, 36.7, 20, 37], [0, 1, 51, 20, 51.3]);
      L.windows.push({ pos: [20, 16, 16], normal: [-1, 0, 0], w: 5, h: 2 }, { pos: [20, 13, 45], normal: [-1, 0, 0], w: 6, h: 2 });
      L.checkpoints.push(
        { when: () => G.cubes.some(c => c.alive && c.c.y > 11 && c.c.x < 6.2), pos: [3, 12, 9], yaw: EAST, cubeSpawn: [3, 12.34, 5] },
        { when: () => G.player.c.z > 30 && G.player.c.y > 0.5, pos: [15, 1, 31.5], yaw: SOUTH },
      );
      L.messages.push(
        { t: 1.2, text: 'Prueba 05, la última. He combinado todo lo que has aprendido. Si la superas, recibirás un premio. Lo dice el protocolo.' },
        { t: 10, text: 'El cubo está en una jaula de cristal. El cristal no admite portales... pero el suelo bajo el cubo, sí.' },
      );
      L.onEvent = { picked: 'Ahora llévalo al otro lado del foso. Lo que entra rápido, sale rápido. Con cubo incluido.' };
      L.triggers.push(
        { min: [0, 0.5, 29], max: [20, 6, 37], text: 'El pulsador solo abre la puerta unos segundos. Prepara los dos portales ANTES de pulsarlo.' },
      );
      L.onDeath = ['El foso no perdona. El protocolo, tampoco.', 'Desde lo alto, cae en el portal del suelo: saldrás volando por el de la pared.'];
    },
  },
];

const SANDBOX = {
  num: 'ZP', name: 'Zona de pruebas', icons: ['portal', 'cube', 'button', 'fling', 'pellet', 'fizzler', 'goo'], sandbox: true,
  build(L) {
    room(L, 0, 0, 0, 40, 22, 40, {
      floor: { base: 'white', holes: [[26, 34, 4, 12], [24, 36, 26, 36]] },
      ceil: { white: [[26, 34, 4, 12], [2, 14, 2, 14]] },
      n: { base: 'white' }, s: { base: 'white' }, e: { base: 'white' }, w: { base: 'white' },
    });
    // pozo profundo con suelo blanco: caída infinita
    room(L, 26, -12, 4, 34, -1, 12, { skip: ['ceil'], noExt: ['n', 's', 'e', 'w'], floor: { base: 'white' }, n: { base: 'white' }, s: { base: 'white' }, e: { base: 'white' }, w: { base: 'white' } });
    // torre blanca para lanzamientos
    addBox(L, 4, 0, 4, 10, 12, 10, 'white');
    // piscina de fluido con puente
    room(L, 24, -3, 26, 36, -1, 36, { skip: ['ceil'], noExt: ['n', 's', 'e', 'w'] });
    L.goo.push({ min: [24, -3, 26], max: [36, -0.6, 36] });
    L.pedestals.push({ id: 'sb', pos: [22.6, 0, 33.2], duration: 14 });
    L.platforms.push({ requires: ['sb'], from: [[24, -0.35, 30], [24.3, 0, 32]], to: [[24, -0.35, 30], [36, 0, 32]], speed: 0.8 });
    L.indicators.push({ ids: ['sb'], points: [[22.6, 0, 32.6], [22.6, 0, 31], [23.8, 0, 31]] });
    // cubos y dispensador
    L.cubes.push({ pos: [9, 0.34, 20] }, { pos: [10.2, 0.34, 21.3] }, { pos: [8.4, 0.34, 22.4], companion: true });
    L.droppers.push({ pos: [16, 22, 14], initial: false });
    L.pedestals.push({ id: 'sp', pos: [16, 0, 18], action: 'drop' });
    // bola de energía y receptor
    L.launchers.push({ pos: [0.42, 1.1, 22], dir: [1, 0, 0], life: 14 });
    L.receivers.push({ id: 'sr', pos: [20, 1.1, 0], normal: [0, 0, 1], reset: 5 });
    // campo de emancipación exento
    L.fizzlers.push({ min: [17, 0, 8.4], max: [23, 4.2, 8.6] });
    addBox(L, 16.7, 4.2, 8.2, 23.3, 4.6, 8.8);
    addBox(L, 12, 0, 30, 12.2, 4, 36, 'glass');
    L.spawn = { pos: [20, 0, 25], yaw: NORTH };
    L.sign = { pos: [1, 2.6, 40], normal: [0, 0, -1] };
    L.lights.push(
      { pos: [10, 19, 10], i: 120, d: 34 }, { pos: [30, 19, 10], i: 120, d: 34 }, { pos: [10, 19, 30], i: 120, d: 34 }, { pos: [30, 19, 30], i: 120, d: 34 },
      { pos: [30, -6, 8], i: 30, d: 12 },
    );
    L.strips.push([[4, 21.95, 20], [36, 21.95, 20]], [[20, 21.95, 4], [20, 21.95, 36]]);
    L.hazard.push([25.7, 0, 3.7, 34.3, 4], [25.7, 0, 12, 34.3, 12.3]);
    L.killY = -40;
    L.messages.push({ t: 1, text: 'Zona de pruebas. Aquí no hay salida, ni prisa. C crea un cubo, G cambia la gravedad y F cierra tus portales.' });
  },
};
const MENU_DEMO = { cube: [30, 7, 8], blue: [[30, -12, 8], 1, 1], orange: [[30, 6.5, 0], 2, 1] };
