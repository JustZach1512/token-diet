// Game balance, characters and AI difficulty presets.

export const MAP_HALF = 56;
export const GENS_TOTAL = 7;
export const GENS_REQUIRED = 5;
export const GEN_TIME = 72; // seconds for one survivor
export const GATE_TIME = 10;
export const COLLAPSE_TIME = 120;
export const BLEEDOUT_TIME = 120;
export const HOOK_STAGE_TIME = [50, 34];

export const SPEED = {
  run: 4.0,
  walk: 2.26,
  crouch: 1.15,
  crawl: 0.72,
  killer: 4.6,
};

// Each preset tunes the AI that plays against (and alongside) the human.
//  killer.*  -> the AI killer when you play survivor
//  surv.*    -> the AI survivors when you play killer
export const DIFFICULTIES = {
  normal: {
    id: 'normal',
    name: 'Normal',
    tag: 'Para aprender',
    blurb: [
      'El asesino ve poco entre la niebla y pierde tu rastro rápido.',
      'Los supervivientes fallan pruebas y tiran palés a destiempo.',
    ],
    skillZone: 58,
    killer: {
      speedMul: 1.0, vision: 22, fov: 105, reaction: 0.65, memory: 3.2, track: 9,
      abilitySkill: 0.4, palletRespect: 0.05, predict: 0.0, breakMul: 1.0,
      lungeDist: 3.2, kickGens: 0.0, hookProxy: 0.1, nightSense: 0, hearing: 8,
    },
    surv: {
      skillCheck: 0.72, great: 0.12, palletUse: 0.45, dropTiming: 0.35, altruism: 0.5,
      awareness: 15, stealth: 0.25, abilitySkill: 0.4, wiggle: 0.8, juke: 0.05,
      trapSpot: 1.6, rescueSafe: 10,
    },
  },
  dificil: {
    id: 'dificil',
    name: 'Difícil',
    tag: 'Caza en serio',
    blurb: [
      'El asesino sigue tus arañazos, patea generadores y vuelve al gancho.',
      'Los supervivientes juegan en equipo y aprovechan los palés.',
    ],
    skillZone: 46,
    killer: {
      speedMul: 1.04, vision: 30, fov: 125, reaction: 0.35, memory: 5.5, track: 16,
      abilitySkill: 0.75, palletRespect: 0.45, predict: 0.55, breakMul: 0.85,
      lungeDist: 2.75, kickGens: 0.55, hookProxy: 0.45, nightSense: 0, hearing: 12,
    },
    surv: {
      skillCheck: 0.88, great: 0.3, palletUse: 0.78, dropTiming: 0.7, altruism: 0.8,
      awareness: 23, stealth: 0.6, abilitySkill: 0.75, wiggle: 1.0, juke: 0.3,
      trapSpot: 3.2, rescueSafe: 15,
    },
  },
  pesadilla: {
    id: 'pesadilla',
    name: 'Pesadilla',
    tag: 'La Entidad observa',
    blurb: [
      'El asesino predice tus giros y la Entidad le susurra dónde estás.',
      'Los supervivientes casi nunca fallan y te marean en cada bucle.',
    ],
    skillZone: 36,
    killer: {
      speedMul: 1.08, vision: 40, fov: 150, reaction: 0.15, memory: 8, track: 26,
      abilitySkill: 1.0, palletRespect: 0.75, predict: 1.0, breakMul: 0.7,
      lungeDist: 2.5, kickGens: 0.9, hookProxy: 0.7, nightSense: 26, hearing: 16,
    },
    surv: {
      skillCheck: 0.97, great: 0.55, palletUse: 0.95, dropTiming: 0.92, altruism: 0.92,
      awareness: 32, stealth: 0.85, abilitySkill: 1.0, wiggle: 1.12, juke: 0.6,
      trapSpot: 5, rescueSafe: 18,
    },
  },
};

// AI teammates when the human plays survivor: competent, not superhuman.
export const ALLY_PARAMS = {
  skillCheck: 0.86, great: 0.25, palletUse: 0.7, dropTiming: 0.6, altruism: 0.85,
  awareness: 22, stealth: 0.55, abilitySkill: 0.7, wiggle: 1.0, juke: 0.25,
  trapSpot: 3, rescueSafe: 14,
};

export const SURVIVORS = [
  {
    id: 'marco', name: 'Marco', full: 'Marco Ibarra', role: 'Atleta',
    colors: { skin: 0xc58c66, shirt: 0x2f5778, pants: 0x2b2b30, hair: 0x1d1612, shoes: 0x3a2a20 },
    hair: 'short', gender: 'm', speedMul: 1.04, repairMul: 1, healMul: 1, markMul: 1,
    ability: { id: 'sprint', name: 'Carrera', cd: 34, desc: 'Esprinta un 60 % más rápido durante 3 s.' },
    passive: { name: 'Zancada', desc: 'Corre un 4 % más rápido.' },
  },
  {
    id: 'lucia', name: 'Lucía', full: 'Lucía Ferrer', role: 'Médica',
    colors: { skin: 0xe0b394, shirt: 0x7e2d34, pants: 0x34394a, hair: 0x4a2b18, shoes: 0x2a2220 },
    hair: 'bun', gender: 'f', speedMul: 1, repairMul: 1, healMul: 1.5, markMul: 1,
    ability: { id: 'medkit', name: 'Botiquín', cd: 55, desc: 'Te cura al instante. Si hay un aliado derribado cerca, lo levanta.' },
    passive: { name: 'Manos firmes', desc: 'Cura y levanta a aliados un 50 % más rápido.' },
  },
  {
    id: 'iris', name: 'Iris', full: 'Iris Navarro', role: 'Mecánica',
    colors: { skin: 0x8d5a3b, shirt: 0x4d5b2c, pants: 0x3b3328, hair: 0x120d0b, shoes: 0x1f1a16 },
    hair: 'ponytail', gender: 'f', speedMul: 1, repairMul: 1.2, healMul: 1, markMul: 1,
    ability: { id: 'flare', name: 'Bengala', cd: 48, desc: 'Ciega y aturde 3 s al asesino si está a menos de 9 m hacia donde miras. Suelta a quien lleve.' },
    passive: { name: 'Ingeniera', desc: 'Repara generadores un 20 % más rápido.' },
  },
  {
    id: 'teo', name: 'Teo', full: 'Teo Valdés', role: 'Sigiloso',
    colors: { skin: 0xd8a27c, shirt: 0x26282c, pants: 0x1e2a3a, hair: 0x6b5236, shoes: 0x2b2b2b },
    hair: 'hood', gender: 'm', speedMul: 1, repairMul: 1, healMul: 1, markMul: 0.5,
    ability: { id: 'shadow', name: 'Sombra', cd: 44, desc: 'Casi invisible durante 7 s: sin marcas, sin ruido.' },
    passive: { name: 'Paso ligero', desc: 'Deja la mitad de arañazos y gime más bajo.' },
  },
];

export const KILLERS = [
  {
    id: 'carnicero', name: 'El Carnicero', role: 'Fuerza bruta',
    speedMul: 1, terror: 32, breakMul: 0.65, kickMul: 0.65, markLife: 7,
    ability: { id: 'charge', name: 'Embestida', cd: 12, desc: 'Carga 1,3 s a doble velocidad. Golpea a quien atropelle y revienta palés. Si choca con un muro, queda aturdido.' },
    passive: { name: 'Brutal', desc: 'Rompe palés y patea generadores un 35 % más rápido.' },
  },
  {
    id: 'espectro', name: 'La Espectro', role: 'Emboscada',
    speedMul: 1, terror: 24, breakMul: 1, kickMul: 1, markLife: 7,
    ability: { id: 'cloak', name: 'Velo', cd: 15, desc: 'Invisible y un 35 % más rápida hasta 6 s, sin radio de terror. Vuelve a pulsar para revelarte y atacar.' },
    passive: { name: 'Silenciosa', desc: 'Radio de terror de solo 24 m.' },
  },
  {
    id: 'trampero', name: 'El Trampero', role: 'Control',
    speedMul: 0.98, terror: 32, breakMul: 1, kickMul: 1, markLife: 14,
    ability: { id: 'trap', name: 'Cepo', cd: 6, desc: 'Coloca un cepo oculto (máx. 4). Quien lo pise queda herido y atrapado.' },
    passive: { name: 'Rastreador', desc: 'Los arañazos duran el doble.' },
  },
];

export const QUALITY = {
  baja: { id: 'baja', name: 'Baja', pixelRatio: 0.85, shadows: 0, bloom: false, post: false, grass: 2200, fogSprites: 6, trees: 0.6, particles: 0.5 },
  media: { id: 'media', name: 'Media', pixelRatio: 1.25, shadows: 1024, bloom: true, post: true, grass: 6000, fogSprites: 14, trees: 0.85, particles: 0.8 },
  alta: { id: 'alta', name: 'Alta', pixelRatio: 2, shadows: 2048, bloom: true, post: true, grass: 11000, fogSprites: 24, trees: 1, particles: 1 },
};
