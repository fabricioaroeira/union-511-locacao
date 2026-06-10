// =====================================================================
// Coordenadas de cada loja na planta baixa (imagem 1890x420)
// As coordenadas são em pixels da imagem original
// Carregadas no SVG overlay (viewBox 0 0 1890 420)
// Polígonos retangulares: x, y, w, h
//
// Pode ser ajustado pelo modo de edição (clique + arrasta no app)
// =====================================================================

export const PLANTA_VIEWBOX = { w: 1890, h: 420 };

// Coordenadas estimadas (ajustar fino via modo de edição no app)
export const PLANTA_COORDS = {
  // ===== BLOCO ESQUERDO - NORTE (vitrines pra fora) =====
  '01': { x: 20,   y: 8,   w: 80,  h: 60  },  // canto NW pequeno
  '04': { x: 100,  y: 8,   w: 130, h: 145 },  // grande, abaixo da 05
  '05': { x: 230,  y: 8,   w: 165, h: 50  },  // longa horizontal
  '06': { x: 395,  y: 8,   w: 110, h: 175 },
  '07': { x: 505,  y: 8,   w: 110, h: 175 },
  '08': { x: 615,  y: 8,   w: 110, h: 175 },
  '09': { x: 725,  y: 8,   w: 110, h: 175 },

  // Lojas centrais menores (corredor)
  '10': { x: 835,  y: 8,   w: 70,  h: 175 },
  '11': { x: 905,  y: 8,   w: 105, h: 175 },
  '12': { x: 1010, y: 8,   w: 105, h: 175 },
  '13': { x: 1115, y: 8,   w: 75,  h: 175 },

  // ===== BLOCO DIREITO - NORTE =====
  '14': { x: 1210, y: 8,   w: 95,  h: 175 },
  '15': { x: 1305, y: 8,   w: 105, h: 175 },
  '16': { x: 1410, y: 8,   w: 105, h: 175 },
  '17': { x: 1515, y: 8,   w: 110, h: 175 },
  '18': { x: 1625, y: 8,   w: 110, h: 175 },
  '19': { x: 1735, y: 8,   w: 75,  h: 60  },  // canto NE pequeno
  '21': { x: 1815, y: 30,  w: 60,  h: 80  },  // canto direito

  // ===== LATERAL OESTE (lojas externas esquerda) =====
  '02': { x: 5,    y: 75,  w: 90,  h: 70  },
  '03': { x: 5,    y: 150, w: 90,  h: 75  },
  '52': { x: 5,    y: 225, w: 90,  h: 45  },  // uso interno
  '51': { x: 5,    y: 275, w: 90,  h: 50  },
  '50': { x: 5,    y: 330, w: 90,  h: 80  },

  // ===== LATERAL LESTE (lojas externas direita) =====
  '20': { x: 1810, y: 115, w: 75,  h: 65  },
  '22': { x: 1810, y: 185, w: 75,  h: 50  },
  '23': { x: 1810, y: 240, w: 75,  h: 50  },
  '24': { x: 1810, y: 295, w: 75,  h: 50  },
  '25': { x: 1810, y: 350, w: 75,  h: 60  },

  // Cantos direitos (frontais)
  '26': { x: 1735, y: 320, w: 75,  h: 90  },  // canto SE
  '27': { x: 1810, y: 380, w: 75,  h: 30  },  // canto SE - ajustar posição

  // ===== BLOCO ESQUERDO - SUL (fundos) =====
  '49': { x: 100,  y: 240, w: 200, h: 175 },  // uso interno grande
  '48': { x: 200,  y: 380, w: 100, h: 30  },  // ajustar posição
  '47': { x: 305,  y: 240, w: 75,  h: 175 },
  '46': { x: 380,  y: 240, w: 75,  h: 175 },
  '45': { x: 455,  y: 240, w: 75,  h: 175 },
  '44': { x: 530,  y: 240, w: 80,  h: 175 },
  '43': { x: 610,  y: 240, w: 80,  h: 175 },
  '42': { x: 690,  y: 240, w: 80,  h: 175 },
  '41': { x: 770,  y: 240, w: 80,  h: 175 },

  // Atrás do meio (central esquerda)
  '40': { x: 855,  y: 240, w: 75,  h: 175 },
  '39': { x: 930,  y: 240, w: 75,  h: 175 },
  '38': { x: 1005, y: 240, w: 75,  h: 175 },
  '37': { x: 1080, y: 240, w: 75,  h: 175 },
  '36': { x: 1155, y: 240, w: 75,  h: 175 },

  // ===== BLOCO DIREITO - SUL =====
  '35': { x: 1230, y: 320, w: 80,  h: 90  },  // central (uso interno?)
  '34': { x: 1315, y: 240, w: 75,  h: 175 },
  '33': { x: 1390, y: 240, w: 75,  h: 175 },
  '32': { x: 1465, y: 240, w: 75,  h: 175 },
  '31': { x: 1540, y: 240, w: 75,  h: 175 },
  '30': { x: 1615, y: 240, w: 80,  h: 175 },
  '29': { x: 1695, y: 240, w: 60,  h: 175 },
  '28': { x: 1755, y: 320, w: 60,  h: 90  },  // uso interno
};

export const LOJAS_USO_INTERNO = ['02', '03', '49', '52'];
