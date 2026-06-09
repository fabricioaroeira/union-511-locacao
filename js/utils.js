// =====================================================================
// Utilidades comuns
// =====================================================================

// ---------- Formatação ----------
export function formatMoney(n, opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return 'R$ ' + Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
    ...opts
  });
}

export function formatMoneyShort(n) {
  if (!n) return 'R$ 0';
  if (n >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1000)    return 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + ' k';
  return formatMoney(n, { decimals: 0 });
}

export function formatPercent(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toFixed(decimals).replace('.', ',') + '%';
}

export function formatArea(n) {
  if (!n) return '—';
  return Number(n).toFixed(2).replace('.', ',') + ' m²';
}

// ---------- Datas ----------
export function parseBR(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (s.includes('/')) {
    const [d, m, y] = s.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
}

export function fmtBR(d) {
  if (!d) return '—';
  d = parseBR(d);
  if (isNaN(d)) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function addMonths(d, n) {
  d = parseBR(d);
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

export function mesesEntre(de, ate) {
  de = parseBR(de);
  ate = parseBR(ate);
  return (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth());
}

// ---------- DOM helpers ----------
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') n.className = v;
    else if (k === 'innerHTML') n.innerHTML = v;
    else if (k === 'textContent') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

// ---------- Constantes de UI ----------
export const LABELS_GARANTIA = {
  fianca_pj: 'Fiança PJ',
  fianca_pessoal: 'Fiança Pessoal',
  seguro_fianca: 'Seguro Fiança',
  titulo_capitalizacao: 'Título de Capitalização',
  sem_garantia: 'Sem garantia'
};

export const LABELS_STATUS_PROPOSTA = {
  em_analise: 'Em análise',
  aceita_aguardando_docs: 'Aceita — aguardando docs',
  convertida_em_contrato: 'Convertida em contrato',
  recusada: 'Recusada',
  expirada: 'Expirada'
};

export const LABELS_STATUS_CONTRATO = {
  ativo: 'Ativo',
  encerrado: 'Encerrado',
  rescindido: 'Rescindido'
};

// Referências de R$/m² do portfólio (para benchmarking)
export const REF_RSM = {
  conservador: 152.13,
  medio: 176.06,
  ancora: 193.40
};
