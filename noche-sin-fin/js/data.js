// Datos del juego: constantes, personajes y modos de dificultad.
(function () {
  'use strict';
  const NSF = (window.NSF = window.NSF || {});

  // Unidades: casillas (1 casilla ≈ 1 metro) y segundos.
  NSF.CONST = {
    W: 58, H: 42, CHUNK: 8,
    GENS_TOTAL: 7, GENS_NEEDED: 5, HOOKS: 10, PALLETS_MAX: 16,
    GEN_WORK: 85,        // segundos de un superviviente para reparar un generador
    HEAL_TIME: 12, REVIVE_TIME: 14, RESCUE_TIME: 1.1, GATE_TIME: 12,
    HOOK_STAGE: 30, BLEED_TIME: 120, COLLAPSE: 120,
    SURV_RUN: 4.0, SURV_WALK: 2.2, SURV_CRAWL: 0.7, SURV_R: 0.32,
    KILLER_R: 0.42,
    HASTE_MUL: 1.5, HASTE_T: 1.8,
    LUNGE_T: 0.42, LUNGE_MUL: 1.45, HIT_RANGE: 1.1, HIT_ANGLE: 0.85,
    HIT_RECOVER: 2.6, MISS_RECOVER: 1.4,
    PICKUP_T: 0.9, HOOK_T: 1.0, BREAK_T: 2.3, KICK_T: 1.8, TRAP_T: 0.6,
    K_VAULT_T: 1.6, S_VAULT_FAST: 0.5, S_VAULT_SLOW: 0.95,
    PALLET_STUN: 2.2, WIGGLE_TIME: 16, WIGGLE_TAP: 0.034,
    SURV_VISION: 7.0, KILLER_VISION: 9.0,
  };

  NSF.SURVIVORS = [
    {
      id: 'lucia', fem: true, name: 'Lucía Ferrer', role: 'Médica de guardia', color: '#d8b75e', hair: '#3b2a1e', skin: '#e2b896',
      ability: { id: 'botiquin', name: 'Botiquín', cd: 70, desc: 'Te curas al instante: pasas de herida a sana.' },
      passive: { name: 'Manos firmes', desc: 'Curas y levantas a los demás un 60 % más rápido.' },
      stats: { healMul: 1.6 },
    },
    {
      id: 'marco', fem: false, name: 'Marco Ibarra', role: 'Mecánico', color: '#5f93c9', hair: '#1d1b1a', skin: '#c99a76',
      ability: { id: 'sobrecarga', name: 'Sobrecarga', cd: 55, desc: 'Durante 8 s reparas generadores al triple de velocidad.' },
      passive: { name: 'Oído de taller', desc: 'Reparas un 10 % más rápido.' },
      stats: { repairMul: 1.1 },
    },
    {
      id: 'sara', fem: true, name: 'Sara Núñez', role: 'Atleta', color: '#d9704f', hair: '#6b3a1f', skin: '#d7a67f',
      ability: { id: 'sprint', name: 'Esprint', cd: 40, desc: 'Corres un 60 % más rápido durante 3 s.' },
      passive: { name: 'Piernas de acero', desc: 'Saltas ventanas y palés un 25 % más rápido.' },
      stats: { vaultMul: 0.75 },
    },
    {
      id: 'diego', fem: false, name: 'Diego Varela', role: 'Ladrón', color: '#8a78bd', hair: '#121212', skin: '#b98a66',
      ability: { id: 'sombra', name: 'Sombra', cd: 50, desc: 'Durante 5 s el asesino no puede verte ni seguir tu rastro.' },
      passive: { name: 'Pasos ligeros', desc: 'Al correr dejas la mitad de marcas.' },
      stats: { scratchMul: 0.5 },
    },
    {
      id: 'elena', fem: true, name: 'Elena Sosa', role: 'Fotógrafa', color: '#86b76f', hair: '#2a1f17', skin: '#e8c3a2',
      ability: { id: 'destello', name: 'Destello', cd: 45, desc: 'Flash frontal a 4,5 m: ciega al asesino 3 s y le obliga a soltar a quien cargue.' },
      passive: { name: 'Ojo atento', desc: 'Ves un 15 % más lejos en la oscuridad.' },
      stats: { visionMul: 1.15 },
    },
  ];

  NSF.KILLERS = [
    {
      id: 'carnicero', name: 'El Carnicero', role: 'Carga brutal', color: '#5a2a1f', speed: 4.6, terror: 12,
      ability: { id: 'embestida', name: 'Embestida', cd: 18, desc: 'Carga en línea recta: quien alcances cae al suelo de un golpe. Si chocas contra un muro, quedas aturdido.' },
      passive: { name: 'Fuerza bruta', desc: 'La embestida destroza los palés derribados.' },
    },
    {
      id: 'espectro', name: 'El Espectro', role: 'Acecho invisible', color: '#bdb8ad', speed: 4.6, terror: 12,
      ability: { id: 'velo', name: 'Velo', cd: 8, desc: 'Te vuelves invisible, sin radio de terror y un 22 % más rápido. Debes revelarte para atacar; al hacerlo tu golpe llega más lejos.' },
      passive: { name: 'Campana', desc: 'Revelarte da 2 s de golpe espectral con más alcance.' },
    },
    {
      id: 'cazadora', name: 'La Cazadora', role: 'Hachas a distancia', color: '#5b4733', speed: 4.5, terror: 14,
      ability: { id: 'hacha', name: 'Hacha', cd: 5, desc: 'Lanza un hacha en la dirección que miras. Hiere a quien alcance, aunque esté lejos.' },
      passive: { name: 'Nana', desc: 'Más lenta que los demás, pero castiga a distancia.' },
    },
    {
      id: 'bruja', name: 'La Bruja', role: 'Trampas y teletransporte', color: '#3d4a33', speed: 4.5, terror: 9,
      ability: { id: 'runa', name: 'Runa', cd: 8, desc: 'Dibuja una runa (máx. 4). Quien la pise corriendo queda atrapado y revelado. Durante 5 s puedes teletransportarte a ella.' },
      passive: { name: 'Susurros', desc: 'Radio de terror pequeño: llegas sin avisar.' },
    },
  ];

  // Perfiles de IA. Los supervivientes y el asesino controlados por la máquina
  // usan estos valores; el entorno ("world") afecta también al jugador.
  NSF.DIFFICULTIES = {
    normal: {
      id: 'normal', name: 'Normal', tag: 'La niebla es espesa, pero hay esperanza.',
      bullets: {
        survivor: ['El asesino reacciona tarde y falla más golpes.', 'Pruebas de habilidad generosas.', 'Tus aliados son competentes.'],
        killer: ['Los supervivientes reparan despacio.', 'Gastan los palés antes de tiempo.', 'Rescatan sin pensarlo mucho.'],
      },
      killer: { speedMul: 0.93, reaction: 0.6, sight: 7, fov: 1.5, hearing: 0.7, aimError: 0.55, predict: 0, trackChance: 0.35, trackDelay: 3.0, chaseMemory: 3.5, abilityUse: 0.35, palletRespect: 0, kick: 0.1, genSense: 0.15, camp: 0, tunnel: 0, dashTurn: 0.8, sense: 0, cdMul: 1.3 },
      survivor: { repairMul: 0.85, skillGood: 0.8, skillGreat: 0.1, evade: 0.3, palletSkill: 0.3, altruism: 0.45, abilityUse: 0.35, reaction: 0.6, stealth: 0.25, fleeDist: 6, trapAvoid: 0.2, spread: 0.2 },
      allies: 'hard',
      world: { visionMul: 1.0, killerVisionMul: 1.0, terrorMul: 1.0, skillZone: 1.15, skillFreq: 0.9, flicker: 0, bleedMul: 0.8, hookMul: 0.85, dark: 0.84, collapseMul: 1.0, eyes: true, reverseSkill: 0 },
    },
    hard: {
      id: 'hard', name: 'Difícil', tag: 'Te escucha. Te sigue. No perdona.',
      bullets: {
        survivor: ['El asesino sigue tus marcas y patrulla los generadores.', 'Respeta los palés y patea generadores.', 'Menos visión y pruebas más justas.'],
        killer: ['Los supervivientes se reparten y reparan rápido.', 'Usan bien palés y ventanas.', 'Se curan y rescatan con cabeza.'],
      },
      killer: { speedMul: 1.02, reaction: 0.3, sight: 8.5, fov: 2.2, hearing: 1.0, aimError: 0.22, predict: 0.25, trackChance: 0.8, trackDelay: 1.8, chaseMemory: 8, abilityUse: 0.6, palletRespect: 0.35, kick: 0.6, genSense: 0.65, camp: 0, tunnel: 0.4, dashTurn: 1.4, sense: 0, cdMul: 1.0 },
      survivor: { repairMul: 1.0, skillGood: 0.9, skillGreat: 0.25, evade: 0.65, palletSkill: 0.65, altruism: 0.7, abilityUse: 0.65, reaction: 0.35, stealth: 0.55, fleeDist: 7.5, trapAvoid: 0.5, spread: 0.6 },
      allies: 'hard',
      world: { visionMul: 0.92, killerVisionMul: 0.95, terrorMul: 0.9, skillZone: 0.95, skillFreq: 1.0, flicker: 0, bleedMul: 1.0, hookMul: 1.0, dark: 0.9, collapseMul: 1.0, eyes: true, reverseSkill: 0 },
    },
    nightmare: {
      id: 'nightmare', name: 'Pesadilla', tag: 'No hay amanecer. Solo la caza.',
      bullets: {
        survivor: ['El asesino predice tus movimientos, acampa y te persigue sin descanso.', 'Radio de terror reducido: llega sin avisar.', 'Visión mínima, luces que parpadean y pruebas que giran al revés.'],
        killer: ['Supervivientes casi perfectos en persecución.', 'Clavan las pruebas y aturden con los palés.', 'Tu visión se reduce y el colapso es más corto.'],
      },
      killer: { speedMul: 1.06, reaction: 0.15, sight: 10, fov: Math.PI, hearing: 1.4, aimError: 0.1, predict: 0.5, trackChance: 0.95, trackDelay: 0.9, chaseMemory: 12, abilityUse: 0.85, palletRespect: 0.65, kick: 0.95, genSense: 1.0, camp: 1, tunnel: 1, dashTurn: 2.2, sense: 1, cdMul: 0.8 },
      survivor: { repairMul: 1.12, skillGood: 0.97, skillGreat: 0.45, evade: 0.92, palletSkill: 0.9, altruism: 0.9, abilityUse: 0.9, reaction: 0.18, stealth: 0.8, fleeDist: 9, trapAvoid: 0.85, spread: 1.0 },
      allies: 'hard',
      world: { visionMul: 0.78, killerVisionMul: 0.85, terrorMul: 0.7, skillZone: 0.7, skillFreq: 1.25, flicker: 1, bleedMul: 1.3, hookMul: 1.25, dark: 0.95, collapseMul: 0.75, eyes: false, reverseSkill: 0.35 },
    },
  };

  NSF.PLAYER_PROFILE = { repairMul: 1, skillGood: 0, skillGreat: 0, evade: 0, palletSkill: 0, altruism: 0, abilityUse: 0, reaction: 0.3, stealth: 0, fleeDist: 6, trapAvoid: 0, spread: 0 };
})();
