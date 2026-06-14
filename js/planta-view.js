// =====================================================================
// Render da planta baixa com overlay SVG das 52 lojas
// Modo de visualização (status colorido) + Modo de edição (arrastar/redimensionar)
// =====================================================================
import { PLANTA_COORDS, PLANTA_VIEWBOX } from './planta-coords.js';
import { formatMoney } from './utils.js';
import { getState } from './state.js';

const STORAGE_KEY = 'union511_planta_coords_custom';
const SVGNS = 'http://www.w3.org/2000/svg';

function carregarCoords() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const custom = JSON.parse(stored);
      // Merge: usa custom mas se a loja tem w/h inválido, força o padrão
      const merged = { ...PLANTA_COORDS };
      for (const cod in custom) {
        const c = custom[cod];
        if (c && c.w > 0 && c.h > 0) merged[cod] = c;
        // se w ou h <= 0, mantém o padrão de PLANTA_COORDS
      }
      return merged;
    }
  } catch (e) {}
  return { ...PLANTA_COORDS };
}
function salvarCoords(coords) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(coords)); } catch (e) {}
}

let coordsAtuais = carregarCoords();
let modoEdicao = false;
let lojaSelecionadaEdicao = null;

// =====================================================================
// Render principal
// =====================================================================
export function renderPlanta(lojas, contratos, propostas) {
  // Escolhe o container baseado no modo (fullscreen ou normal)
  const gridId = getState('mapaFullscreenAtivo') ? 'grid-fs' : 'grid';
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.className = 'planta-container';
  grid.innerHTML = '';

  const contratosByLoja = {};
  contratos.forEach(c => (c.lojas || []).forEach(cod => { contratosByLoja[cod] = c; }));
  const propostaByLoja = {};
  propostas.forEach(p => (p.lojas || []).forEach(cod => { propostaByLoja[cod] = p; }));

  const wrap = document.createElement('div');
  wrap.className = 'planta-wrap';

  const img = document.createElement('img');
  img.src = './imgs/planta-baixa.png';
  img.alt = 'Planta baixa Union 511';
  wrap.appendChild(img);

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${PLANTA_VIEWBOX.w} ${PLANTA_VIEWBOX.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('planta-svg');

  // Camada de retângulos das lojas
  lojas.forEach(l => {
    const cod = l.codigo;
    const coords = coordsAtuais[cod];
    if (!coords || !coords.w || !coords.h) return;

    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('data-loja', cod);
    g.classList.add('loja-grupo');

    // Determina cor/info (default = disponível em verde)
    let cor = 'rgba(22,163,74,0.40)';
    let stroke = '#16a34a';
    let labelExtra = '';
    if (l.status === 'uso_interno') {
      cor = 'rgba(30,41,59,0.55)'; stroke = '#1e293b'; labelExtra = ' (uso interno)';
    } else if (l.status === 'ocupada') {
      const c = contratosByLoja[cod];
      cor = c?.parcial ? 'rgba(194,65,12,0.50)' : 'rgba(220,38,38,0.45)';
      stroke = c?.parcial ? '#c2410c' : '#dc2626';
      labelExtra = c ? ` · ${l.inquilino_atual || ''} · ${formatMoney(c.valor_aluguel)}/mês` : '';
    } else if (l.status === 'proposta_aceita') {
      cor = 'rgba(30,58,138,0.55)'; stroke = '#1e3a8a';
      const p = propostaByLoja[cod];
      labelExtra = p ? ` · ${p.cliente_nome} (proposta aceita)` : '';
    } else if (l.status === 'proposta_analise') {
      cor = 'rgba(125,211,252,0.55)'; stroke = '#0ea5e9';
      const p = propostaByLoja[cod];
      labelExtra = p ? ` · ${p.cliente_nome} (em análise)` : '';
    }

    const rect = document.createElementNS(SVGNS, 'rect');
    rect.setAttribute('x', coords.x);
    rect.setAttribute('y', coords.y);
    rect.setAttribute('width', coords.w);
    rect.setAttribute('height', coords.h);
    rect.setAttribute('fill', cor);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1');
    rect.classList.add('loja-rect');
    g.appendChild(rect);

    const title = document.createElementNS(SVGNS, 'title');
    const areaTxt = l.area_privativa ? ` · ${Number(l.area_privativa).toFixed(2)} m²` : '';
    title.textContent = `Loja ${cod}${labelExtra}${areaTxt}`;
    g.appendChild(title);

    g.addEventListener('mouseenter', () => {
      if (!modoEdicao) rect.setAttribute('fill-opacity', '0.85');
    });
    g.addEventListener('mouseleave', () => {
      if (!modoEdicao) rect.setAttribute('fill-opacity', '1');
    });

    if (modoEdicao) {
      g.style.cursor = 'move';
      habilitarArrasto(g, rect, cod);
    }

    svg.appendChild(g);
  });

  // Camada de handles (sempre por cima)
  const handlesLayer = document.createElementNS(SVGNS, 'g');
  handlesLayer.setAttribute('id', 'planta-handles');
  svg.appendChild(handlesLayer);

  wrap.appendChild(svg);
  grid.appendChild(wrap);

  renderToolbarEdicao(grid);
}

// =====================================================================
// Toolbar de edição
// =====================================================================
function renderToolbarEdicao(container) {
  const toolbar = document.createElement('div');
  toolbar.className = 'planta-toolbar';
  toolbar.innerHTML = `
    <button class="btn outline sm" id="btn-planta-edicao">${modoEdicao ? '✓ Sair do modo edição' : '✏️ Editar posição e tamanho das lojas'}</button>
    ${modoEdicao ? `
      <span class="planta-help">
        <strong>Clique numa loja</strong> pra selecionar. Arrasta o <strong>centro</strong> pra mover, ou os <strong>cantos vermelhos</strong> pra redimensionar.
        Teclas: <kbd>←↑→↓</kbd> mover · <kbd>Shift+seta</kbd>=10px · <kbd>Ctrl+→</kbd>/<kbd>Ctrl+↓</kbd>=aumenta · <kbd>Ctrl+←</kbd>/<kbd>Ctrl+↑</kbd>=diminui
      </span>
      <button class="btn outline sm" id="btn-planta-reset">↺ Restaurar padrão</button>
      <button class="btn sm" id="btn-planta-export">📋 Copiar coordenadas</button>
      <span id="planta-info-edicao" class="planta-info"></span>
    ` : ''}
  `;
  container.appendChild(toolbar);

  document.getElementById('btn-planta-edicao')?.addEventListener('click', async () => {
    modoEdicao = !modoEdicao;
    lojaSelecionadaEdicao = null;
    const { renderTudo } = await import('./render.js');
    await renderTudo();
  });

  if (modoEdicao) {
    document.getElementById('btn-planta-reset')?.addEventListener('click', async () => {
      if (!(await confirmarAcao({ titulo: 'Restaurar coordenadas', mensagem: 'Restaurar as coordenadas padrão? Vai perder os ajustes que fez.', confirmLabel: 'Restaurar', perigo: true }))) return;
      localStorage.removeItem(STORAGE_KEY);
      coordsAtuais = carregarCoords();
      const { renderTudo } = await import('./render.js');
      await renderTudo();
    });
    document.getElementById('btn-planta-export')?.addEventListener('click', () => {
      const json = JSON.stringify(coordsAtuais, null, 2);
      navigator.clipboard?.writeText(json).then(() => {
        alert('✓ Coordenadas copiadas! Cole aqui no chat pra eu deixar permanente.');
      });
    });
  }
}

// =====================================================================
// Arrasto e redimensionamento
// =====================================================================
function habilitarArrasto(g, rect, cod) {
  g.addEventListener('mousedown', (ev) => {
    if (ev.target.classList?.contains('handle')) return; // handle tem seu próprio listener
    ev.preventDefault();
    selecionarLoja(cod);
    iniciarDrag(ev, rect, cod, 'move');
  });
}

function selecionarLoja(cod) {
  lojaSelecionadaEdicao = cod;
  // Realça
  document.querySelectorAll('.loja-rect').forEach(r => {
    r.setAttribute('stroke-width', '1');
    r.classList.remove('selecionada');
  });
  const rect = document.querySelector(`[data-loja="${cod}"] .loja-rect`);
  if (rect) {
    rect.setAttribute('stroke-width', '3');
    rect.setAttribute('stroke', '#ef4444');
    rect.classList.add('selecionada');
  }
  renderHandles(cod);
  atualizarInfo(cod);
}

function atualizarInfo(cod) {
  const c = coordsAtuais[cod];
  const info = document.getElementById('planta-info-edicao');
  if (info && c) info.textContent = `Loja ${cod} · x=${c.x}, y=${c.y}, w=${c.w}, h=${c.h}`;
}

// =====================================================================
// Handles de redimensionamento (8 cantos/lados)
// =====================================================================
function renderHandles(cod) {
  const layer = document.getElementById('planta-handles');
  if (!layer) return;
  layer.innerHTML = '';
  const c = coordsAtuais[cod];
  if (!c) return;

  const handles = [
    { tipo: 'nw', x: c.x,         y: c.y,         cursor: 'nwse-resize' },
    { tipo: 'n',  x: c.x + c.w/2, y: c.y,         cursor: 'ns-resize'   },
    { tipo: 'ne', x: c.x + c.w,   y: c.y,         cursor: 'nesw-resize' },
    { tipo: 'e',  x: c.x + c.w,   y: c.y + c.h/2, cursor: 'ew-resize'   },
    { tipo: 'se', x: c.x + c.w,   y: c.y + c.h,   cursor: 'nwse-resize' },
    { tipo: 's',  x: c.x + c.w/2, y: c.y + c.h,   cursor: 'ns-resize'   },
    { tipo: 'sw', x: c.x,         y: c.y + c.h,   cursor: 'nesw-resize' },
    { tipo: 'w',  x: c.x,         y: c.y + c.h/2, cursor: 'ew-resize'   }
  ];

  handles.forEach(h => {
    const dot = document.createElementNS(SVGNS, 'rect');
    const size = 12;
    dot.setAttribute('x', h.x - size/2);
    dot.setAttribute('y', h.y - size/2);
    dot.setAttribute('width', size);
    dot.setAttribute('height', size);
    dot.setAttribute('fill', '#ef4444');
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('stroke-width', '2');
    dot.classList.add('handle');
    dot.setAttribute('data-handle-tipo', h.tipo);
    dot.style.cursor = h.cursor;
    dot.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const rect = document.querySelector(`[data-loja="${cod}"] .loja-rect`);
      iniciarDrag(ev, rect, cod, h.tipo);
    });
    layer.appendChild(dot);
  });
}

// =====================================================================
// Lógica de drag (move ou redimensiona)
// =====================================================================
function iniciarDrag(ev, rect, cod, modo) {
  const svg = rect.closest('svg');
  const startX = ev.clientX;
  const startY = ev.clientY;
  const orig = { ...coordsAtuais[cod] };

  const onMove = (e) => {
    const svgRect = svg.getBoundingClientRect();
    const scaleX = PLANTA_VIEWBOX.w / svgRect.width;
    const scaleY = PLANTA_VIEWBOX.h / svgRect.height;
    const dx = Math.round((e.clientX - startX) * scaleX);
    const dy = Math.round((e.clientY - startY) * scaleY);
    const novo = { ...orig };

    switch (modo) {
      case 'move':
        novo.x = orig.x + dx; novo.y = orig.y + dy;
        break;
      case 'nw':
      case 'nw':
        novo.x = orig.x + dx; novo.y = orig.y + dy;
        novo.w = orig.w - dx; novo.h = orig.h - dy;
        break;
      case 'n':
        novo.y = orig.y + dy; novo.h = orig.h - dy;
        break;
      case 'ne':
        novo.y = orig.y + dy;
        novo.w = orig.w + dx; novo.h = orig.h - dy;
        break;
      case 'e':
        novo.w = orig.w + dx;
        break;
      case 'se':
        novo.w = orig.w + dx; novo.h = orig.h + dy;
        break;
      case 's':
        novo.h = orig.h + dy;
        break;
      case 'sw':
        novo.x = orig.x + dx;
        novo.w = orig.w - dx; novo.h = orig.h + dy;
        break;
      case 'w':
        novo.x = orig.x + dx; novo.w = orig.w - dx;
        break;
    }
    if (novo.w < 10) novo.w = 10;
    if (novo.h < 10) novo.h = 10;

    coordsAtuais[cod] = novo;
    rect.setAttribute('x', novo.x);
    rect.setAttribute('y', novo.y);
    rect.setAttribute('width', novo.w);
    rect.setAttribute('height', novo.h);
    renderHandles(cod);
    atualizarInfo(cod);
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    salvarCoords(coordsAtuais);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

document.addEventListener('keydown', (ev) => {
  if (!modoEdicao || !lojaSelecionadaEdicao) return;
  const tag = (ev.target.tagName || '').toLowerCase();
  if (['input','textarea','select'].includes(tag)) return;

  const cod = lojaSelecionadaEdicao;
  const c = { ...coordsAtuais[cod] };
  if (!c.w) return;
  const passo = ev.shiftKey ? 10 : 1;
  let mudou = false;

  if (ev.ctrlKey || ev.metaKey) {
    if (ev.key === 'ArrowRight') { c.w += passo; mudou = true; }
    if (ev.key === 'ArrowLeft')  { c.w = Math.max(10, c.w - passo); mudou = true; }
    if (ev.key === 'ArrowDown')  { c.h += passo; mudou = true; }
    if (ev.key === 'ArrowUp')    { c.h = Math.max(10, c.h - passo); mudou = true; }
  } else {
    if (ev.key === 'ArrowLeft')  { c.x -= passo; mudou = true; }
    if (ev.key === 'ArrowRight') { c.x += passo; mudou = true; }
    if (ev.key === 'ArrowUp')    { c.y -= passo; mudou = true; }
    if (ev.key === 'ArrowDown')  { c.y += passo; mudou = true; }
  }

  if (mudou) {
    ev.preventDefault();
    coordsAtuais[cod] = c;
    salvarCoords(coordsAtuais);
    const rect = document.querySelector(`[data-loja="${cod}"] .loja-rect`);
    if (rect) {
      rect.setAttribute('x', c.x);
      rect.setAttribute('y', c.y);
      rect.setAttribute('width', c.w);
      rect.setAttribute('height', c.h);
      renderHandles(cod);
      atualizarInfo(cod);
    }
  }
});