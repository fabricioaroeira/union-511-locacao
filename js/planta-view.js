// =====================================================================
// Render da planta baixa com overlay SVG das 52 lojas
// Modo de visualização (status colorido) + Modo de edição (arrastar/redimensionar)
// =====================================================================
import { PLANTA_COORDS, PLANTA_VIEWBOX } from './planta-coords.js';
import { formatMoney } from './utils.js';

const STORAGE_KEY = 'union511_planta_coords_custom';

// Carrega coordenadas customizadas do localStorage (se houver)
function carregarCoords() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...PLANTA_COORDS, ...JSON.parse(stored) };
  } catch (e) {}
  return { ...PLANTA_COORDS };
}

function salvarCoords(coords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
  } catch (e) { console.warn('Não foi possível salvar:', e); }
}

let coordsAtuais = carregarCoords();
let modoEdicao = false;
let lojaSelecionadaEdicao = null;

// =====================================================================
// Render principal
// =====================================================================
export function renderPlanta(lojas, contratos, propostas) {
  const grid = document.getElementById('grid');
  if (!grid) return;

  grid.className = 'planta-container';
  grid.innerHTML = '';

  const contratosByLoja = {};
  contratos.forEach(c => (c.lojas || []).forEach(cod => { contratosByLoja[cod] = c; }));
  const propostaByLoja = {};
  propostas.forEach(p => (p.lojas || []).forEach(cod => { propostaByLoja[cod] = p; }));

  const wrap = document.createElement('div');
  wrap.className = 'planta-wrap';
  wrap.style.position = 'relative';
  wrap.style.width = '100%';
  wrap.style.maxWidth = '1890px';
  wrap.style.margin = '0 auto';

  // Imagem da planta (fundo)
  const img = document.createElement('img');
  img.src = './imgs/planta-baixa.png';
  img.alt = 'Planta baixa Union 511';
  img.style.width = '100%';
  img.style.display = 'block';
  wrap.appendChild(img);

  // SVG overlay
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${PLANTA_VIEWBOX.w} ${PLANTA_VIEWBOX.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'auto';

  // Renderiza cada loja
  lojas.forEach(l => {
    const cod = l.codigo;
    const coords = coordsAtuais[cod];
    if (!coords || !coords.w || !coords.h) return;

    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('data-loja', cod);
    g.style.cursor = modoEdicao ? 'move' : 'pointer';

    // Determina cor pelo status
    let cor = 'rgba(148,163,184,0.30)';
    let stroke = '#64748b';
    let labelExtra = '';
    if (l.status === 'uso_interno') {
      cor = 'rgba(30,41,59,0.55)';
      stroke = '#1e293b';
      labelExtra = ' (uso interno)';
    } else if (l.status === 'ocupada') {
      const c = contratosByLoja[cod];
      cor = c?.parcial ? 'rgba(139,92,246,0.45)' : 'rgba(22,163,74,0.40)';
      stroke = c?.parcial ? '#7c3aed' : '#16a34a';
      labelExtra = c ? ` · ${l.inquilino_atual || ''} · ${formatMoney(c.valor_aluguel)}/mês` : '';
    } else if (l.status === 'proposta_aceita') {
      cor = 'rgba(37,99,235,0.40)';
      stroke = '#2563eb';
      const p = propostaByLoja[cod];
      labelExtra = p ? ` · ${p.cliente_nome} (proposta aceita)` : '';
    } else if (l.status === 'proposta_analise') {
      cor = 'rgba(217,119,6,0.42)';
      stroke = '#d97706';
      const p = propostaByLoja[cod];
      labelExtra = p ? ` · ${p.cliente_nome} (em análise)` : '';
    }

    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', coords.x);
    rect.setAttribute('y', coords.y);
    rect.setAttribute('width', coords.w);
    rect.setAttribute('height', coords.h);
    rect.setAttribute('fill', cor);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', modoEdicao ? '2' : '1');
    rect.style.transition = 'fill 0.15s';
    g.appendChild(rect);

    // Tooltip
    const title = document.createElementNS(svgNS, 'title');
    const areaTxt = l.area_privativa ? ` · ${Number(l.area_privativa).toFixed(2)} m²` : '';
    title.textContent = `Loja ${cod}${labelExtra}${areaTxt}`;
    g.appendChild(title);

    // Hover - destacar
    g.addEventListener('mouseenter', () => {
      rect.setAttribute('fill-opacity', '0.8');
      rect.setAttribute('stroke-width', '2.5');
    });
    g.addEventListener('mouseleave', () => {
      rect.setAttribute('fill-opacity', '1');
      rect.setAttribute('stroke-width', modoEdicao ? '2' : '1');
    });

    // Clique normal: nada por enquanto (futuro: abrir info da loja)
    // Edição: arrastar
    if (modoEdicao) {
      habilitarArrasto(g, rect, cod);
    }

    svg.appendChild(g);
  });

  wrap.appendChild(svg);
  grid.appendChild(wrap);

  // Toolbar de edição
  renderToolbarEdicao(grid);
}

// =====================================================================
// Toolbar de edição
// =====================================================================
function renderToolbarEdicao(container) {
  const toolbar = document.createElement('div');
  toolbar.className = 'planta-toolbar';
  toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;padding:8px;background:#f8fafc;border-radius:6px;border:1px solid var(--line);flex-wrap:wrap';
  toolbar.innerHTML = `
    <button class="btn outline sm" id="btn-planta-edicao">${modoEdicao ? '✓ Sair do modo edição' : '✏️ Ajustar posição das lojas'}</button>
    ${modoEdicao ? `
      <span style="font-size:11px;color:var(--ink-soft)">Clique numa loja pra selecionar. Use ← → ↑ ↓ pra mover (Shift+seta = 10px). + e − pra redimensionar.</span>
      <button class="btn outline sm" id="btn-planta-reset">↺ Restaurar padrão</button>
      <button class="btn sm" id="btn-planta-export">📋 Copiar coordenadas</button>
      <span id="planta-info-edicao" style="font-size:11px;color:var(--ink-soft);margin-left:auto"></span>
    ` : ''}
  `;
  container.appendChild(toolbar);

  document.getElementById('btn-planta-edicao')?.addEventListener('click', async () => {
    modoEdicao = !modoEdicao;
    const { renderTudo } = await import('./render.js');
    await renderTudo();
  });

  if (modoEdicao) {
    document.getElementById('btn-planta-reset')?.addEventListener('click', async () => {
      if (!confirm('Restaurar as coordenadas padrão? Vai perder os ajustes que fez.')) return;
      localStorage.removeItem(STORAGE_KEY);
      coordsAtuais = carregarCoords();
      const { renderTudo } = await import('./render.js');
      await renderTudo();
    });
    document.getElementById('btn-planta-export')?.addEventListener('click', () => {
      const json = JSON.stringify(coordsAtuais, null, 2);
      navigator.clipboard?.writeText(json).then(() => {
        alert('Coordenadas copiadas! Cole em planta-coords.js pra deixar permanente.');
      });
    });
  }
}

// =====================================================================
// Arrasto e redimensionamento (modo edição)
// =====================================================================
function habilitarArrasto(g, rect, cod) {
  let startX = 0, startY = 0;
  let arrastando = false;
  let origX = 0, origY = 0;

  g.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    arrastando = true;
    startX = ev.clientX;
    startY = ev.clientY;
    origX = Number(rect.getAttribute('x'));
    origY = Number(rect.getAttribute('y'));
    lojaSelecionadaEdicao = cod;
    // Destaca selecionada
    document.querySelectorAll('[data-loja] rect').forEach(r => r.setAttribute('stroke-width', '2'));
    rect.setAttribute('stroke-width', '4');
    rect.setAttribute('stroke', '#ef4444');
    const info = document.getElementById('planta-info-edicao');
    if (info) info.textContent = `Loja ${cod} selecionada · x=${origX}, y=${origY}, w=${rect.getAttribute('width')}, h=${rect.getAttribute('height')}`;
  });

  const onMove = (ev) => {
    if (!arrastando) return;
    const svg = g.closest('svg');
    const svgRect = svg.getBoundingClientRect();
    const scaleX = PLANTA_VIEWBOX.w / svgRect.width;
    const scaleY = PLANTA_VIEWBOX.h / svgRect.height;
    const deltaX = (ev.clientX - startX) * scaleX;
    const deltaY = (ev.clientY - startY) * scaleY;
    const novoX = Math.round(origX + deltaX);
    const novoY = Math.round(origY + deltaY);
    rect.setAttribute('x', novoX);
    rect.setAttribute('y', novoY);
    coordsAtuais[cod] = { ...coordsAtuais[cod], x: novoX, y: novoY };
    const info = document.getElementById('planta-info-edicao');
    if (info) info.textContent = `Loja ${cod} · x=${novoX}, y=${novoY}, w=${rect.getAttribute('width')}, h=${rect.getAttribute('height')}`;
  };
  const onUp = () => {
    if (arrastando) {
      arrastando = false;
      salvarCoords(coordsAtuais);
    }
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// =====================================================================
// Atalhos de teclado (apenas em modo edição)
// =====================================================================
document.addEventListener('keydown', (ev) => {
  if (!modoEdicao || !lojaSelecionadaEdicao) return;
  const cod = lojaSelecionadaEdicao;
  const c = coordsAtuais[cod];
  if (!c) return;
  const passo = ev.shiftKey ? 10 : 1;
  let mudou = false;
  if (ev.key === 'ArrowLeft')  { c.x -= passo; mudou = true; }
  if (ev.key === 'ArrowRight') { c.x += passo; mudou = true; }
  if (ev.key === 'ArrowUp')    { c.y -= passo; mudou = true; }
  if (ev.key === 'ArrowDown')  { c.y += passo; mudou = true; }
  if (ev.key === '+')          { c.w += passo; c.h += passo; mudou = true; }
  if (ev.key === '-')          { c.w = Math.max(10, c.w - passo); c.h = Math.max(10, c.h - passo); mudou = true; }
  if (mudou) {
    ev.preventDefault();
    coordsAtuais[cod] = c;
    salvarCoords(coordsAtuais);
    const rect = document.querySelector(`[data-loja="${cod}"] rect`);
    if (rect) {
      rect.setAttribute('x', c.x);
      rect.setAttribute('y', c.y);
      rect.setAttribute('width', c.w);
      rect.setAttribute('height', c.h);
    }
    const info = document.getElementById('planta-info-edicao');
    if (info) info.textContent = `Loja ${cod} · x=${c.x}, y=${c.y}, w=${c.w}, h=${c.h}`;
  }
});
