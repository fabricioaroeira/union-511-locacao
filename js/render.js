// =====================================================================
// RENDER — Toda a lógica de exibição do dashboard
// =====================================================================
import {
  getKPIs, getLojasStatus, getInquilinos, getContratos, getPropostas, getArquivos, encerrarContrato, getLeads,
  getDocumentosByContrato, TIPOS_DOCUMENTO,
  getGestoesAtivas,
  getOcorrenciasPendentesGlobal,
  getReceitaConsolidadaPortfolio, getInadimplenciaSienge
} from './data-layer.js';
import { getArquivoUrl } from './upload.js';
import { abrirModal , promptCustom} from './modal.js';
import {
  formatMoney, formatMoneyShort, formatPercent, formatArea,
  fmtBR, parseBR, addMonths, mesesEntre, el,
  LABELS_GARANTIA, LABELS_STATUS_PROPOSTA, REF_RSM
} from './utils.js';
import { abrirFormContrato } from './forms-contrato.js';
import { abrirFichaLoja, getFichaLojaAtiva } from './ficha-loja.js';
import { abrirFormProposta } from './forms-proposta.js';
import { abrirFormLead } from './forms-lead.js';
import { abrirFormInquilino } from './forms-inquilino.js';
import { renderPlanta } from './planta-view.js';
import { getState } from './state.js';

// ---------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------
export function mostrarToast(msg, tipo = 'success') {
  const c = document.getElementById('toast-container');
  const t = el('div', { className: 'toast ' + tipo }, msg);
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ---------------------------------------------------------------------
// Renderização completa do dashboard
// ---------------------------------------------------------------------
export async function renderTudo() {
  const filtroProp = getState('propostasFiltro');
  const [kpis, lojas, inquilinos, contratos, propostasAtivas, propostasFiltro, leads, gestoes, receitaConsol] = await Promise.all([
    getKPIs(), getLojasStatus(), getInquilinos(), getContratos('ativo'),
    getPropostas('ativas'),  // pra mapa, KPIs e legenda
    getPropostas(filtroProp), // pra aba propostas
    getLeads('todos').catch(() => []),
    // Tenta ocorrências (novo sistema); se tabela não existe ainda, cai pro antigo
    getOcorrenciasPendentesGlobal().then(o => o.length ? o : null).catch(() => null)
      .then(o => o ?? getGestoesAtivas().catch(() => [])),
    getReceitaConsolidadaPortfolio().catch(() => null)  // SIENGE + fallback estimado
  ]);
  const propostas = propostasAtivas; // alias pra renders que usam propostas ativas
  const safe = (fn, nome) => { try { return fn(); } catch (e) { console.error('render error em ' + nome + ':', e); } };
  safe(() => renderBannerAlertas(contratos, propostas, leads, gestoes), 'renderBannerAlertas');
  safe(() => renderKpis(kpis, receitaConsol), 'renderKpis');
  safe(() => renderFunilComercial(leads, propostas, contratos), 'renderFunilComercial');
  safe(() => renderPlanta(lojas, contratos, propostas), 'renderPlanta');
  safe(() => renderLegenda(kpis, propostas), 'renderLegenda');
  safe(() => renderOcupacao(kpis), 'renderOcupacao');
  safe(() => renderMix(contratos, inquilinos), 'renderMix');
  try { await renderTabelaOcupadas(contratos, lojas, receitaConsol); } catch (e) { console.error('render err renderTabelaOcupadas:', e); }
  safe(() => renderTabelaDisponiveis(lojas, propostas), 'renderTabelaDisponiveis');
  safe(() => renderAcompanhamentoLocacao(lojas, contratos, propostas, inquilinos), 'renderAcompanhamentoLocacao');
  safe(() => renderInquilinosCards(inquilinos, contratos), 'renderInquilinosCards');
  safe(() => renderPropostas(propostasFiltro, filtroProp, propostasAtivas), 'renderPropostas');
  safe(() => renderLeads(leads), 'renderLeads');
  safe(() => renderTimeline(contratos), 'renderTimeline');
  safe(() => renderTabelaVencimentos(contratos), 'renderTabelaVencimentos');
  safe(() => renderAlertas(propostas, contratos, gestoes), 'renderAlertas');
  safe(() => renderCounters(kpis, propostas, leads), 'renderCounters');
}

function renderCounters(kpis, propostas, leads = []) {
  document.querySelector('[data-counter="ocupadas"]').textContent = `(${kpis.lojas_ocupadas})`;
  const disp = kpis.lojas_locaveis - kpis.lojas_ocupadas;
  document.querySelector('[data-counter="disponiveis"]').textContent = `(${disp})`;
  document.querySelector('[data-counter="inquilinos"]').textContent = `(${kpis.inquilinos_ativos})`;
  document.querySelector('[data-counter="propostas"]').textContent = `(${propostas.length})`;
  const leadsAtivos = leads.filter(l => ['interessado','visitou','em_analise'].includes(l.status)).length;
  const elLeads = document.querySelector('[data-counter="leads"]');
  if (elLeads) elLeads.textContent = `(${leadsAtivos})`;
}

// ---------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------
function renderKpis(k, receitaConsol) {
  const disp = k.lojas_locaveis - k.lojas_ocupadas;
  const pctOcup = (k.lojas_ocupadas / k.lojas_locaveis * 100);
  const pctDisp = (disp / k.lojas_locaveis * 100);
  // 2 KPIs separados: cobrança real (SIENGE+estimado do mês) vs contratual (papel)
  const receitaReal = receitaConsol?.total_geral || k.receita_cheia_mes || 0;
  const receitaContratual = receitaConsol?.total_contratual || k.receita_cheia_mes || 0;
  const ctrsSienge = receitaConsol?.contratos.filter(c => c.origem === 'sienge').length || 0;
  const ctrsEstimado = receitaConsol?.contratos.filter(c => c.origem === 'estimado').length || 0;
  const diff = receitaReal - receitaContratual;
  const diffPct = receitaContratual > 0 ? (diff / receitaContratual * 100) : 0;
  const diffTxt = diff === 0
    ? 'igual à cobrança real'
    : (diff > 0 ? `+${formatMoneyShort(diff)} (${diffPct.toFixed(1)}%)` : `−${formatMoneyShort(Math.abs(diff))} (${diffPct.toFixed(1)}%)`);

  document.getElementById('kpis').innerHTML = `
    <div class="kpi accent">
      <div class="kpi-label">Lojas totais</div>
      <div class="kpi-value">${k.total_lojas}</div>
      <div class="kpi-sub">Lojas 01–${String(k.total_lojas).padStart(2,'0')}</div>
    </div>
    <div class="kpi green">
      <div class="kpi-label">Ocupadas</div>
      <div class="kpi-value">${k.lojas_ocupadas}</div>
      <div class="kpi-sub">${formatPercent(pctOcup)} de ${k.lojas_locaveis} locáveis</div>
    </div>
    <div class="kpi amber">
      <div class="kpi-label">Disponíveis</div>
      <div class="kpi-value">${disp}</div>
      <div class="kpi-sub">de ${k.lojas_locaveis} locáveis (${k.lojas_internas} em uso interno)</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Inquilinos ativos</div>
      <div class="kpi-value">${k.inquilinos_ativos}</div>
      <div class="kpi-sub">Mix diversificado</div>
    </div>
    <div class="kpi" style="background:#E6F1FB">
      <div class="kpi-label" style="color:#185FA5">Cobrança real (mês)</div>
      <div class="kpi-value" style="color:#0C447C">${formatMoneyShort(receitaReal)}</div>
      <div class="kpi-sub" style="color:#185FA5">${ctrsEstimado === 0 ? `🟢 SIENGE · ${ctrsSienge} contratos` : `🟢 ${ctrsSienge} SIENGE + 🟡 ${ctrsEstimado} estimados`}</div>
    </div>
    <div class="kpi" style="background:#FAEEDA">
      <div class="kpi-label" style="color:#854F0B">Aluguel contratual</div>
      <div class="kpi-value" style="color:#633806">${formatMoneyShort(receitaContratual)}</div>
      <div class="kpi-sub" style="color:#854F0B">base · ${diffTxt}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Vagas comerciais</div>
      <div class="kpi-value">${k.vagas_ocupadas} / ${k.vagas_comerciais_total}</div>
      <div class="kpi-sub">${formatPercent(k.vagas_ocupadas / k.vagas_comerciais_total * 100)}</div>
    </div>
  `;
}

function renderLegenda(k, propostas) {
  const disp = k.lojas_locaveis - k.lojas_ocupadas;
  const pAceitas = propostas.filter(p => p.status === 'aceita_aguardando_docs').reduce((s,p)=>s+(p.lojas?.length||0),0);
  const pAnalise = propostas.filter(p => p.status === 'em_analise').reduce((s,p)=>s+(p.lojas?.length||0),0);
  const livres = disp - pAceitas - pAnalise;
  document.getElementById('legend').innerHTML = `
    <div class="legend-item"><div class="legend-dot" style="background:var(--red)"></div>Locada (${k.lojas_ocupadas})</div>
    <div class="legend-item"><div class="legend-dot" style="background:#c2410c"></div>Parcialmente Locada</div>
    <div class="legend-item"><div class="legend-dot" style="background:#1e3a8a"></div>Proposta de Locação Aceita (${pAceitas})</div>
    <div class="legend-item"><div class="legend-dot" style="background:#0ea5e9"></div>Proposta de Locação em Análise (${pAnalise})</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div>Lojas Disponíveis (${livres})</div>
    <div class="legend-item"><div class="legend-dot" style="background:#1a2332"></div>Lojas Bloqueadas (${k.lojas_internas})</div>
  `;
}

function renderOcupacao(k) {
  const disp = k.lojas_locaveis - k.lojas_ocupadas;
  const pctOcup = (k.lojas_ocupadas / k.lojas_locaveis * 100);
  const pctVagas = (k.vagas_ocupadas / k.vagas_comerciais_total * 100);
  document.getElementById('ocupacao-resumo').innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500">
      <span>${k.lojas_ocupadas} ocupadas (de ${k.lojas_locaveis} locáveis)</span>
      <span style="color:var(--ink-soft)">${disp} disponíveis · ${k.lojas_internas} em uso interno</span>
    </div>
    <div class="bar"><div class="bar-fill" style="width:${pctOcup}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;margin-top:16px">
      <span>Vagas: ${k.vagas_ocupadas} ocupadas</span>
      <span style="color:var(--ink-soft)">${k.vagas_comerciais_total - k.vagas_ocupadas} disponíveis</span>
    </div>
    <div class="bar"><div class="bar-fill" style="width:${pctVagas}%;background:var(--violet)"></div></div>
  `;
}

// ---------------------------------------------------------------------
// Mix de inquilinos
// ---------------------------------------------------------------------
function renderMix(contratos, inquilinos) {
  const sorted = [...contratos].sort((a,b) => Number(a.lojas?.[0]||0) - Number(b.lojas?.[0]||0));
  document.getElementById('tbl-mix').innerHTML = sorted.map(c => {
    const inq = inquilinos.find(i => i.id === c.inquilino_id) || {};
    return `<tr><td>${inq.segmento || '—'}</td><td>${inq.razao_social || '—'}</td><td>${inq.nome_fantasia || '—'}</td><td>${(c.lojas||[]).join(', ')}</td></tr>`;
  }).join('');
}

// ---------------------------------------------------------------------
// Tabela Ocupadas
// ---------------------------------------------------------------------
async function renderTabelaOcupadas(contratos, lojas, receitaConsol) {
  // Se ficha de loja está aberta, ela já renderiza dentro do card — pula tabela
  if (getFichaLojaAtiva()) {
    abrirFichaLoja(getFichaLojaAtiva());
    return;
  }
  const tituloEl = document.getElementById('ocupadas-titulo');
  if (tituloEl) tituloEl.textContent = `Lojas locadas (${contratos.reduce((s,c)=>s+(c.lojas?.length||0),0)} unidades · ${contratos.length} inquilinos)`;
  const tbl = document.getElementById('tbl-ocup');
  if (!tbl) return;
  tbl.innerHTML = '';
  const sorted = [...contratos].sort((a,b) => Number(a.lojas?.[0]||0) - Number(b.lojas?.[0]||0));
  // mapa codigo -> area_privativa para somar rápido
  const areaByCodigo = {};
  (lojas || []).forEach(l => { areaByCodigo[l.codigo] = l.area_privativa; });

  // === Otimização: busca todos os arquivos+documentos de TODOS os contratos em paralelo ===
  // Antes: serial dentro do for (N+1 requests, ~N×latência)
  // Agora: 1 Promise.all com 2×N requests disparadas juntas
  const arqsPorContrato = await Promise.all(sorted.map(c =>
    Promise.all([
      getArquivos('contrato', c.id).catch(() => []),
      getDocumentosByContrato(c.id).catch(() => [])
    ])
  ));

  // Mapa contrato_id → { valor, origem } pra mostrar badge SIENGE/estimado
  const receitaPorContrato = {};
  if (receitaConsol && Array.isArray(receitaConsol.contratos)) {
    receitaConsol.contratos.forEach(r => { receitaPorContrato[r.id] = r; });
  }

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const [arquivos, documentos] = arqsPorContrato[i];
    const status = c.parcial ? '<span class="badge parcial">Parcialmente locada</span>' : '<span class="badge ocupada">Locada</span>';
    const termino = c.data_termino || fmtBR(addMonths(parseBR(c.data_inicio), c.prazo_meses));
    const totalDocs = (arquivos?.length || 0) + (documentos?.length || 0);
    const btnDocs = totalDocs > 0
      ? '<button class="btn outline sm" data-docs="' + c.id + '" style="font-size:11px;padding:3px 8px">📎 Documentos (' + totalDocs + ')</button>'
      : '<span style="color:#94a3b8;font-size:11px">Sem documentos</span>';
    // soma de áreas privativas das lojas do contrato
    const areas = (c.lojas || []).map(cod => areaByCodigo[cod]).filter(Boolean);
    const areaTotalPriv = areas.reduce((s,a) => s + Number(a), 0);
    const rsm = areaTotalPriv > 0 ? (c.valor_aluguel / areaTotalPriv) : null;
    const areaDetalhe = areas.length > 1
      ? '<br><span style="font-size:11px;color:var(--ink-soft)">' + (c.lojas || []).map(cod => 'L' + cod + '=' + (areaByCodigo[cod] || '?') + 'm²').join(' · ') + '</span>'
      : '';

    const tr = el('tr', { className: 'tbl-ocup-clicavel', 'data-abrir-ficha': c.id });
    tr.innerHTML = `
      <td><strong>${(c.lojas||[]).join(', ')}</strong><br>${status}</td>
      <td>
        <strong>${c.nome_fantasia_contrato || c.nome_fantasia || c.razao_social}</strong><br>
        <span style="font-size:11px;color:var(--ink-soft)">${c.razao_social}<br>CNPJ: ${c.documento}</span>
      </td>
      <td style="font-size:12px"><strong>${areaTotalPriv > 0 ? areaTotalPriv.toFixed(2).replace('.', ',') + ' m²' : '—'}</strong>${rsm ? '<br><span style="color:var(--ink-soft);font-size:11px">R$ ' + rsm.toFixed(2).replace('.',',') + '/m²</span>' : ''}${areaDetalhe}</td>
      <td>
        ${(() => {
          const r = receitaPorContrato[c.id];
          const valor = r ? r.valor : c.valor_aluguel;
          const origem = r ? r.origem : 'estimado';
          const badge = origem === 'sienge'
            ? '<span style="display:inline-block;padding:1px 6px;background:#dcfce7;color:#15803d;border-radius:3px;font-size:9px;font-weight:700;margin-left:4px">SIENGE</span>'
            : '<span style="display:inline-block;padding:1px 6px;background:#fef3c7;color:#b45309;border-radius:3px;font-size:9px;font-weight:700;margin-left:4px">estimado</span>';
          return `<strong>${formatMoney(valor)}</strong>${badge}`;
        })()}<br>
        <span style="font-size:11px;color:var(--ink-soft)">${c.meses_carencia}m carência</span>
      </td>
      <td>dia ${String(c.dia_vencimento).padStart(2,'0')}</td>
      <td>${c.prazo_meses}m (${c.prazo_meses/12}a)</td>
      <td><span class="badge idx">${c.indice_reajuste}</span></td>
      <td style="font-size:12px;color:var(--ink-soft)">${LABELS_GARANTIA[c.tipo_garantia]}${c.detalhes_garantia ? '<br>' + c.detalhes_garantia : ''}</td>
      <td style="font-size:12px">${c.data_inicio}<br><span style="color:var(--ink-soft)">→ ${termino}</span></td>
      <td style="text-align:center;padding:10px 8px">
        <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#fff7e6;border:1px solid #fde6c2;border-radius:20px;color:var(--accent);font-weight:600;font-size:11px;white-space:nowrap">Abrir ficha <span style="font-size:14px;line-height:1">&rarr;</span></div>
        <div style="font-size:10px;color:var(--ink-soft);margin-top:4px">${totalDocs} doc(s)</div>
      </td>
    `;
    tbl.appendChild(tr);

    if (c.observacoes) {
      const trObs = el('tr');
      trObs.innerHTML = `<td colspan="10" style="background:#fafbfc;font-size:12px;color:var(--ink-soft);padding:6px 12px"><em>Obs: ${c.observacoes}</em></td>`;
      tbl.appendChild(trObs);
    }
  }

  // Linha inteira clicável → abre ficha completa da loja
  tbl.querySelectorAll('[data-abrir-ficha]').forEach(tr => {
    tr.addEventListener('click', () => abrirFichaLoja(tr.dataset.abrirFicha));
  });
}

// ---------------------------------------------------------------------
// Tabela Disponíveis
// ---------------------------------------------------------------------
function renderTabelaDisponiveis(lojas, propostas) {
  const livres = lojas.filter(l => l.status === 'disponivel');
  const comProposta = lojas.filter(l => ['proposta_aceita','proposta_analise'].includes(l.status));
  const total = livres.length + comProposta.length;

  document.getElementById('disponiveis-titulo').textContent =
    `Lojas disponíveis para locação (${total} — sendo ${livres.length} livres + ${comProposta.length} em pipeline)`;
  document.getElementById('disponiveis-sub').innerHTML =
    `Pipeline atual: ${propostas.length} proposta(s) em andamento. Áreas livres a carregar da NBR 12.721 Q2. Lojas em uso interno não constam.`;

  const tbl = document.getElementById('tbl-disp');
  tbl.innerHTML = '';
  const propostaByLoja = {};
  propostas.forEach(p => (p.lojas||[]).forEach(codigo => propostaByLoja[codigo] = p));

  lojas.filter(l => !['uso_interno','ocupada'].includes(l.status)).forEach(l => {
    const p = propostaByLoja[l.codigo];
    let badge, area, pipeline;
    if (p) {
      badge = p.status === 'aceita_aguardando_docs'
        ? '<span class="badge" style="background:var(--accent-soft);color:var(--accent)">Aceita — aguard. docs</span>'
        : '<span class="badge negociacao">' + (LABELS_STATUS_PROPOSTA[p.status] || 'Em análise') + '</span>';
      area = (p.lojas[0] === l.codigo) ? formatArea(p.area_total) : '<span style="color:#94a3b8">↑ no conjunto</span>';
      const rsm = p.area_total ? (p.valor_aluguel / p.area_total) : null;
      pipeline = `<strong>${p.cliente_nome}</strong> · ${p.ramo}<br>
        <span style="font-size:11px;color:var(--ink-soft)">
          ${formatMoney(p.valor_aluguel)}/mês ${rsm ? `(R$ ${rsm.toFixed(2)}/m²)` : ''} ·
          carência ${p.meses_carencia}m · ${p.prazo_opcoes} · ${p.detalhes_garantia} · via ${p.corretor}${p.cv?' '+p.cv:''}
        </span>`;
    } else {
      badge = '<span class="badge disponivel">Disponível</span>';
      area = l.area_privativa ? formatArea(l.area_privativa) : '<span style="color:#94a3b8">a carregar</span>';
      pipeline = '<span style="color:#94a3b8">—</span>';
    }
    const exaustao = l.tem_exaustao
      ? '<span class="badge" style="background:#dcfce7;color:#15803d">Sim</span>'
      : '<span class="badge" style="background:#f1f5f9;color:#64748b">Não</span>';
    const deposito = (l.area_deposito != null && Number(l.area_deposito) > 0)
      ? `<span style="color:#15803d;font-weight:600">${formatArea(l.area_deposito)}</span>`
      : '<span style="color:#94a3b8">—</span>';
    const tr = el('tr');
    tr.innerHTML = `<td><strong>${l.codigo}</strong></td><td>${badge}</td><td>${area}</td><td>${deposito}</td><td>${exaustao}</td><td>${pipeline}</td>`;
    tbl.appendChild(tr);
  });
}

// ---------------------------------------------------------------------
// Inquilinos
// ---------------------------------------------------------------------
function renderInquilinosCards(inquilinos, contratos) {
  const tlist = document.getElementById('tenant-list');
  tlist.innerHTML = '';
  document.getElementById('inquilinos-titulo').textContent = `Inquilinos ativos (${contratos.length})`;
  const sorted = [...contratos].sort((a,b) => Number(a.lojas?.[0]||0) - Number(b.lojas?.[0]||0));
  sorted.forEach(c => {
    const inq = inquilinos.find(i => i.id === c.inquilino_id) || {};
    const div = el('div', { className: 'tenant', style: 'cursor:pointer;transition:background .15s' });
    div.title = 'Clique pra editar o inquilino';
    div.innerHTML = `
      <div>
        <div class="tenant-name">${inq.nome_fantasia || inq.razao_social} <span style="font-size:11px;color:#94a3b8;font-weight:400">✏️</span></div>
        <div class="tenant-units">${inq.razao_social}</div>
        <div class="tenant-units" style="margin-top:2px">CNPJ/CPF: ${inq.documento}</div>
      </div>
      <div class="tenant-meta">
        <strong>${(c.lojas||[]).length}</strong> ${(c.lojas||[]).length>1?'unidades':'unidade'}<br>
        Loja(s): <strong>${(c.lojas||[]).join(', ')}</strong>
      </div>
      <div class="tenant-meta">
        <strong>${formatMoney(c.valor_aluguel)}</strong>/mês<br>
        ${c.indice_reajuste} · venc. dia ${String(c.dia_vencimento).padStart(2,'0')}
      </div>
      <div class="tenant-meta">${c.observacoes || ''}</div>
    `;
    if (inq.id) {
      div.addEventListener('click', () => abrirFormInquilino(inq.id));
      div.addEventListener('mouseenter', () => { div.style.background = '#f8fafc'; });
      div.addEventListener('mouseleave', () => { div.style.background = ''; });
    }
    tlist.appendChild(div);
  });
}

// ---------------------------------------------------------------------
// Propostas
// ---------------------------------------------------------------------
function renderPropostas(propostas, filtroAtual = 'ativas', propostasAtivas = []) {
  const resumoBox = document.getElementById('propostas-resumo');

  // Atualiza título conforme o filtro
  const titulos = {
    ativas: 'Propostas ativas — pendentes de decisão ou documentação',
    aceita_aguardando_docs: 'Propostas aceitas — aguardando documentação',
    em_analise: 'Propostas em análise',
    recusada: 'Propostas recusadas',
    expirada: 'Propostas expiradas',
    convertida_em_contrato: 'Propostas convertidas em contrato',
    all: 'Todas as propostas (histórico completo)'
  };
  const tituloEl = document.getElementById('propostas-titulo');
  if (tituloEl) tituloEl.textContent = titulos[filtroAtual] || titulos.ativas;

  const qtdAceitas = propostas.filter(p => p.status === 'aceita_aguardando_docs').length;
  const qtdAnalise = propostas.filter(p => p.status === 'em_analise').length;
  const lojasEmProposta = propostas.reduce((s,p) => s + (p.lojas?.length || 0), 0);
  const receitaPot = propostas.reduce((s,p) => s + Number(p.valor_aluguel), 0);

  const cards = [
    { label: filtroAtual === 'ativas' ? 'Propostas ativas' : 'Quantidade exibida', valor:propostas.length, sub: filtroAtual === 'ativas' ? `${qtdAceitas} aceita(s) · ${qtdAnalise} em análise` : titulos[filtroAtual] || filtroAtual, cor:'var(--ink)' },
    { label:'Lojas em pipeline', valor:lojasEmProposta, sub:'do total disponível', cor:'var(--accent)' },
    { label:'Receita potencial', valor:formatMoneyShort(receitaPot), sub:'/mês', cor:'var(--green)' },
    { label:'Próxima ação', valor:qtdAceitas > 0 ? 'Aguardar docs' : (qtdAnalise > 0 ? 'Analisar' : '—'), sub:'pendente', cor:'var(--amber)' }
  ];
  resumoBox.innerHTML = cards.map(c => `
    <div style="padding:14px;background:#f8fafc;border:1px solid var(--line);border-radius:8px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);font-weight:600">${c.label}</div>
      <div style="font-size:20px;font-weight:700;color:${c.cor};margin-top:4px">${c.valor}</div>
      <div style="font-size:11px;color:var(--ink-soft);margin-top:2px">${c.sub}</div>
    </div>
  `).join('');

  const propLista = document.getElementById('propostas-list');
  propLista.innerHTML = '';

  // Carrega contagem de arquivos pra cada proposta (uma vez só, em paralelo)
  const contagemArqs = {};
  Promise.all(propostas.map(p => getArquivos('proposta', p.id).catch(() => [])))
    .then(resultados => {
      resultados.forEach((arq, i) => {
        contagemArqs[propostas[i].id] = (arq || []).length;
      });
      // Atualiza os botões já renderizados com a contagem real
      propostas.forEach(p => {
        const btn = propLista.querySelector('[data-docs-prop="' + p.id + '"]');
        if (btn) {
          const n = contagemArqs[p.id] || 0;
          btn.textContent = '📎 Documentos (' + n + ')';
          btn.style.opacity = n > 0 ? '1' : '0.7';
        }
      });
    });

  propostas.forEach(p => {
    const isAceita = p.status === 'aceita_aguardando_docs';
    const card = el('div', { className: 'proposta-card ' + (isAceita ? 'aceita' : 'analise') });
    const statusBadge = isAceita
      ? '<span class="badge" style="background:var(--accent-soft);color:var(--accent)">Aceita — aguardando docs</span>'
      : '<span class="badge negociacao">' + (LABELS_STATUS_PROPOSTA[p.status] || 'Em análise') + '</span>';
    const lojasStr = p.lojas?.length > 1 ? `Lojas ${p.lojas.join(' + ')}` : `Loja ${p.lojas?.[0] || '?'}`;
    const rsm = p.area_total ? (p.valor_aluguel / p.area_total) : 0;
    const gapMedio = ((rsm - REF_RSM.medio) / REF_RSM.medio * 100);
    const gapConservador = ((rsm - REF_RSM.conservador) / REF_RSM.conservador * 100);
    const corGap = gapMedio < -20 ? 'var(--red)' : gapMedio < -10 ? 'var(--amber)' : 'var(--green)';
    const contraSugerida = Math.round((p.area_total || 0) * REF_RSM.conservador / 100) * 100;

    let acaoTitulo, acaoTexto;
    if (isAceita) {
      acaoTitulo = '🎯 Próxima ação: aguardar/cobrar envio da documentação';
      acaoTexto = `Cliente comprometido. Acompanhar com ${p.corretor} o envio: análise de crédito, comprovantes dos fiadores, IRPF, documentos pessoais. Quando chegar, converter em contrato pelo botão abaixo.`;
    } else {
      acaoTitulo = '🎯 Próxima ação: analisar e decidir';
      acaoTexto = `R$/m² proposto (R$ ${rsm.toFixed(2)}) está <strong>${Math.abs(gapMedio).toFixed(1)}%</strong> abaixo do médio do portfólio. Contraproposta sugerida ao conservador (R$ ${REF_RSM.conservador.toFixed(2)}/m²): <strong>~${formatMoney(contraSugerida,{decimals:0})}/mês</strong>.`;
    }

    card.innerHTML = `
      <div class="proposta-head">
        <div>
          <div class="proposta-titulo">${lojasStr} — ${p.cliente_nome}</div>
          <div class="proposta-meta-top">${p.ramo}</div>
        </div>
        ${statusBadge}
      </div>
      <div class="proposta-grid">
        <div class="proposta-cell"><div class="proposta-cell-label">Área</div><div class="proposta-cell-value">${formatArea(p.area_total)}</div></div>
        <div class="proposta-cell">
          <div class="proposta-cell-label">Aluguel</div>
          <div class="proposta-cell-value">${formatMoney(p.valor_aluguel)}</div>
          <div class="proposta-cell-sub">${formatMoney(p.valor_aluguel*12,{decimals:0})}/ano</div>
        </div>
        <div class="proposta-cell">
          <div class="proposta-cell-label">R$/m²</div>
          <div class="proposta-cell-value" style="color:${corGap}">R$ ${rsm.toFixed(2)}</div>
          <div class="proposta-cell-sub" style="color:${corGap}">${gapMedio>0?'+':''}${gapMedio.toFixed(1)}% vs. médio</div>
        </div>
        <div class="proposta-cell"><div class="proposta-cell-label">Carência</div><div class="proposta-cell-value">${p.meses_carencia} meses</div></div>
        <div class="proposta-cell"><div class="proposta-cell-label">Prazo</div><div class="proposta-cell-value">${p.prazo_opcoes}</div></div>
        <div class="proposta-cell"><div class="proposta-cell-label">Garantia</div><div class="proposta-cell-value" style="font-size:12px">${p.detalhes_garantia}</div></div>
      </div>
      <div class="proposta-analise-cards">
        <div class="proposta-analise-box">
          <div style="font-weight:600;color:var(--ink);margin-bottom:4px">Benchmark de preço</div>
          vs. médio (R$ ${REF_RSM.medio}/m²): <strong style="color:${corGap}">${gapMedio>0?'+':''}${gapMedio.toFixed(1)}%</strong><br>
          vs. conservador (R$ ${REF_RSM.conservador}/m²): <strong>${gapConservador>0?'+':''}${gapConservador.toFixed(1)}%</strong><br>
          vs. âncora Pague Menos (R$ ${REF_RSM.ancora}/m²): <strong>${((rsm-REF_RSM.ancora)/REF_RSM.ancora*100).toFixed(1)}%</strong>
        </div>
        <div class="proposta-analise-box">
          <div style="font-weight:600;color:var(--ink);margin-bottom:4px">Observações</div>
          ${p.observacoes || '—'}
        </div>
      </div>
      <div class="proposta-acao ${isAceita ? 'aceita' : ''}">
        <div class="proposta-acao-titulo">${acaoTitulo}</div>
        ${acaoTexto}
      </div>
      <div class="proposta-rodape">
        <div>Origem: <strong>${p.corretor}</strong>${p.cv ? ' · CV ' + p.cv : ''} · Data: ${p.data_proposta}</div>
        <div class="proposta-acoes">
          <button class="btn outline sm" data-docs-prop="${p.id}">📎 Documentos</button>
          <button class="btn outline sm" data-edit-prop="${p.id}">✏️ Editar</button>
          ${isAceita ? `<button class="btn sm" data-converter="${p.id}">✓ Converter em contrato</button>` : ''}
        </div>
      </div>
    `;
    propLista.appendChild(card);
  });

  propLista.querySelectorAll('[data-edit-prop]').forEach(btn =>
    btn.addEventListener('click', () => abrirFormProposta(btn.dataset.editProp))
  );
  propLista.querySelectorAll('[data-converter]').forEach(btn =>
    btn.addEventListener('click', () => abrirFormContrato(null, { fromProposta: btn.dataset.converter }))
  );
  propLista.querySelectorAll('[data-docs-prop]').forEach(btn =>
    btn.addEventListener('click', () => abrirModalArquivosProposta(btn.dataset.docsProp))
  );
}

// ---------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------
function renderTimeline(contratos) {
  const today = new Date();
  const dados = contratos.map(c => {
    const ini = parseBR(c.data_inicio);
    const fim = addMonths(ini, c.prazo_meses);
    return { c, ini, fim };
  });
  if (!dados.length) return;
  // ARREDONDA o range para anos inteiros (01/jan do startYear → 01/jan do endYear+1)
  // Assim cada label de ano cai exatamente em sua posição esperada na escala,
  // e a linha vermelha de "hoje" fica alinhada visualmente com onde "estamos" no calendário.
  const rawMin = new Date(Math.min(...dados.map(d => d.ini)));
  const rawMax = new Date(Math.max(...dados.map(d => d.fim)));
  const minDate = new Date(rawMin.getFullYear(), 0, 1);              // 01/jan do ano de início
  const maxDate = new Date(rawMax.getFullYear() + 1, 0, 1);          // 01/jan do ano seguinte ao fim
  const totalSpan = maxDate - minDate;

  const rows = document.getElementById('timeline-rows');
  rows.innerHTML = '';
  dados.sort((a,b) => a.fim - b.fim).forEach(d => {
    const startPct = ((d.ini - minDate) / totalSpan) * 100;
    const widthPct = ((d.fim - d.ini) / totalSpan) * 100;
    const todayPct = ((today - minDate) / totalSpan) * 100;
    const cor = d.c.parcial ? 'violet' : (d.c.prazo_meses >= 120 ? 'amber' : '');
    const row = el('div', { className: 'timeline-row' });
    row.innerHTML = `
      <div class="timeline-name">${d.c.nome_fantasia_contrato || d.c.nome_fantasia || d.c.razao_social}<br>
        <span style="font-weight:400;font-size:11px;color:var(--ink-soft)">Loja ${(d.c.lojas||[]).join(', ')}</span>
      </div>
      <div class="timeline-bar">
        <div class="timeline-fill ${cor}" style="left:${startPct}%;width:${widthPct}%"></div>
        <div class="timeline-marker-today" style="left:${todayPct}%"></div>
      </div>
      <div class="timeline-end">${fmtBR(d.fim)}</div>
    `;
    rows.appendChild(row);
  });

  // Escala: como o range foi arredondado para anos inteiros,
  // cada ano cai exatamente em pct = (y - startYear) / qtdAnos × 100
  const scale = document.getElementById('timeline-scale');
  const startYear = minDate.getFullYear();              // 01/jan do startYear
  const endYear = maxDate.getFullYear();                // 01/jan do (endYear); maxDate é o jan do ano seguinte
  const totalAnos = endYear - startYear;                // qtd de anos
  const step = Math.max(1, Math.floor(totalAnos / 9));
  let scaleHtml = `<div style="width:140px"></div><div style="flex:1;position:relative;height:14px">`;
  for (let y = startYear; y <= endYear; y += step) {
    const pct = ((y - startYear) / totalAnos) * 100;
    // alinhamento: primeiro à esquerda, último à direita, demais centralizados
    let transform = 'translateX(-50%)';
    if (y === startYear) transform = 'translateX(0)';
    else if (y === endYear) transform = 'translateX(-100%)';
    scaleHtml += `<span style="position:absolute;left:${pct}%;transform:${transform};white-space:nowrap">${y}</span>`;
  }
  scaleHtml += `</div><div style="width:90px"></div>`;
  scale.innerHTML = scaleHtml;
}

function renderTabelaVencimentos(contratos) {
  const today = new Date();
  const dados = contratos.map(c => {
    const ini = parseBR(c.data_inicio);
    const fim = addMonths(ini, c.prazo_meses);
    return { c, ini, fim };
  }).sort((a,b) => a.fim - b.fim);

  document.getElementById('tbl-venc').innerHTML = dados.map(d => {
    const mesesRest = Math.round((d.fim - today) / (1000*60*60*24*30.44));
    const cor = mesesRest < 12 ? 'color:var(--red);font-weight:600'
              : mesesRest < 24 ? 'color:var(--amber);font-weight:600'
              : 'color:var(--ink-soft)';
    return `
      <tr>
        <td><strong>${d.c.nome_fantasia_contrato || d.c.nome_fantasia || d.c.razao_social}</strong></td>
        <td>${(d.c.lojas||[]).join(', ')}</td>
        <td>${d.c.data_assinatura}</td>
        <td>${d.c.data_inicio}</td>
        <td>${d.c.prazo_meses} meses (${d.c.prazo_meses/12} anos)</td>
        <td>${fmtBR(d.fim)}</td>
        <td style="${cor}">${mesesRest} meses</td>
      </tr>`;
  }).join('');
}

// ---------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------
async function renderAlertas(propostas, contratos, gestoes = []) {
  const list = document.getElementById('alertas-list');
  list.innerHTML = '';

  // ============================================================
  // SEÇÃO 0: INADIMPLÊNCIA SIENGE (parcelas atrasadas — fonte oficial)
  // ============================================================
  try {
    const inadSienge = await getInadimplenciaSienge();
    if (inadSienge && inadSienge.length > 0) {
      const totalInad = inadSienge.reduce((s, p) => s + Number(p.valor_corrigido || 0), 0);
      // Agrupa por contrato
      const porContrato = {};
      inadSienge.forEach(p => {
        if (!porContrato[p.contrato_nome]) porContrato[p.contrato_nome] = [];
        porContrato[p.contrato_nome].push(p);
      });

      const cabec = el('div');
      cabec.style.cssText = 'margin:8px 0 14px;padding:12px 16px;background:linear-gradient(135deg,#fee2e2 0%,#fecaca 100%);border-left:4px solid #dc2626;border-radius:8px';
      cabec.innerHTML =
        '<div style="font-weight:700;color:#7f1d1d;font-size:14px">💸 Inadimplência (SIENGE — fonte oficial)</div>' +
        '<div style="font-size:12px;color:#991b1b;margin-top:4px">' +
          '<strong>' + inadSienge.length + ' parcela(s) atrasada(s)</strong> — total <strong>' + formatMoney(totalInad) + '</strong>' +
        '</div>';
      list.appendChild(cabec);

      Object.entries(porContrato).forEach(([nome, parcs]) => {
        const totContrato = parcs.reduce((s,p) => s + Number(p.valor_corrigido || 0), 0);
        const div = el('div', { className: 'alert' });
        div.style.cssText = 'border-left:3px solid #dc2626';
        const linhasParcs = parcs.map(p => {
          const venc = p.data_vencimento ? new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '?';
          const compLbl = { aluguel: 'Aluguel', condominio: 'Condomínio', iptu: 'IPTU', recibo: 'Recibo', outros: 'Outros' }[p.componente] || p.componente;
          return `<li style="margin-bottom:3px">${compLbl} ${p.sienge_codigo || ''} ${p.parcela_rotulo || ''} · venc ${venc} · <strong>${formatMoney(p.valor_corrigido)}</strong> · <span style="color:#dc2626;font-weight:600">${p.dias_atraso || 0}d atraso</span></li>`;
        }).join('');
        div.innerHTML = `
          <div class="alert-title">⚠️ ${escapeHtmlAlerta(nome)} — ${parcs.length} parcela(s) atrasada(s) · ${formatMoney(totContrato)}</div>
          <div class="alert-body"><ul style="margin:6px 0 0;padding-left:20px;font-size:12px">${linhasParcs}</ul></div>
        `;
        list.appendChild(div);
      });
    }
  } catch (err) { console.error('Erro inadimplência SIENGE:', err); }

  // ============================================================
  // SEÇÃO 1: GESTÕES DE CONTRATO (geradas pela IA)
  // ============================================================
  renderSecaoGestoes(list, gestoes, contratos);

  // Alertas dinâmicos por proposta
  propostas.forEach(p => {
    const isAceita = p.status === 'aceita_aguardando_docs';
    const div = el('div', { className: 'alert ' + (isAceita ? 'blue' : '') });
    const lojasStr = p.lojas?.length > 1 ? `Lojas ${p.lojas.join(' e ')}` : `Loja ${p.lojas?.[0]}`;
    div.innerHTML = `
      <div class="alert-title">📋 Proposta ${isAceita ? 'ACEITA' : 'EM ANÁLISE'} — ${lojasStr} (${p.cliente_nome})</div>
      <div class="alert-body">${p.observacoes || ''} ${formatMoney(p.valor_aluguel)}/mês.</div>
    `;
    list.appendChild(div);
  });

  // Alertas fixos
  const fixos = [
    { tipo:'red',    titulo:'⚠ Verificar vagas comuns no contrato Evolve / Academia Noroeste',
      body:'Há suspeita de que vagas designadas como uso comum na Convenção de Condomínio possam ter sido incluídas no rol de 54 vagas locadas. Conferir matrícula a matrícula.' },
    { tipo:'',       titulo:'ℹ Lojas 02, 03, 49 e 52 — uso interno JAX 28',
      body:'Estão sendo utilizadas pela própria JAX 28 como central de vendas. Não constam como disponíveis ao mercado. 48 lojas locáveis ao mercado das 52 totais.' },
    { tipo:'green',  titulo:'✓ Loja 13 retornou ao pipeline',
      body:'Negociação Dog do Barto / Moda Fitness caiu. Loja 13 (57,08 m²) disponível novamente.' },
    { tipo:'',       titulo:'Carregar áreas individuais oficiais',
      body:'Importar a planilha Q2 NBR 12.721 (Coluna 23 — REAL) para popular os m² individuais e calcular R$/m² preciso.' },
    { tipo:'',       titulo:'Reajustes — atenção ao índice por contrato',
      body:'Maioria usa IGP-M. Exceções: Pague Menos e Drogaria Brasil usam IPCA.' }
  ];
  fixos.forEach(a => {
    const div = el('div', { className: 'alert ' + a.tipo });
    div.innerHTML = `<div class="alert-title">${a.titulo}</div><div class="alert-body">${a.body}</div>`;
    list.appendChild(div);
  });
}

// ---------------------------------------------------------------------
// LEADS (CRM)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Banner de alertas (Action-first)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Seção de gestões dentro da aba Alertas/Pendências
// ---------------------------------------------------------------------
function renderSecaoGestoes(container, gestoes, contratos) {
  if (!gestoes || gestoes.length === 0) return;

  const hoje = new Date(); hoje.setHours(0,0,0,0);

  // Classifica por urgência
  const grupos = { atrasadas: [], em30: [], em90: [] };
  gestoes.forEach(g => {
    const d = new Date(g.data_evento);
    const dias = Math.floor((d - hoje) / 86400000);
    if (dias < 0) grupos.atrasadas.push({ ...g, dias });
    else if (dias <= 30) grupos.em30.push({ ...g, dias });
    else if (dias <= 90) grupos.em90.push({ ...g, dias });
  });

  // Se não tem nada urgente, não polui a tela
  if (grupos.atrasadas.length + grupos.em30.length + grupos.em90.length === 0) return;

  // Título da seção
  const tituloSec = el('div');
  tituloSec.style.cssText = 'margin:8px 0 14px;padding:12px 16px;background:linear-gradient(135deg,#fffaf0 0%,#fff7e6 100%);border-left:4px solid var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px';
  tituloSec.innerHTML =
    '<div style="font-weight:700;color:#7c2d12;font-size:14px">🤖 Gestões automáticas dos contratos</div>' +
    '<div style="font-size:12px;color:#92400e">' +
      (grupos.atrasadas.length > 0 ? '<strong style="color:#7f1d1d">' + grupos.atrasadas.length + ' atrasada(s)</strong> · ' : '') +
      grupos.em30.length + ' em 30d · ' + grupos.em90.length + ' em 90d' +
    '</div>';
  container.appendChild(tituloSec);

  const renderGrupo = (lista, rotuloPeriodo, corBg, corTexto) => {
    if (lista.length === 0) return;
    const grupoEl = el('div');
    grupoEl.style.cssText = 'margin-bottom:14px';
    const cabecalho = el('div');
    cabecalho.style.cssText = 'font-size:11px;font-weight:700;color:' + corTexto + ';text-transform:uppercase;letter-spacing:.5px;margin:8px 4px 6px';
    cabecalho.textContent = rotuloPeriodo + ' (' + lista.length + ')';
    grupoEl.appendChild(cabecalho);

    lista.forEach(g => {
      const card = el('div');
      card.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px 14px;background:#fff;border:1px solid var(--line);border-left:4px solid ' + corBg + ';border-radius:6px;margin-bottom:6px;cursor:pointer;transition:all .15s';
      card.onmouseenter = () => { card.style.borderColor = 'var(--accent)'; card.style.borderLeftColor = corBg; card.style.boxShadow = '0 2px 6px rgba(0,0,0,.06)'; };
      card.onmouseleave = () => { card.style.borderColor = 'var(--line)'; card.style.borderLeftColor = corBg; card.style.boxShadow = 'none'; };

      const tipoIcones = {
        carencia_fim: '⏳', reajuste_aniversario: '📈', marco_5anos: '⚖️',
        aviso_devolucao: '📤', termino: '🏁', garantia_pendencia: '🛡️',
        validacao_fianca: '🔍', comprovantes: '🧾', vistoria: '🔧',
        seguro: '🔥', destinacao: '📋'
      };
      const icone = tipoIcones[g.tipo] || '📌';
      const data = new Date(g.data_evento).toLocaleDateString('pt-BR');
      const labelDias = g.dias < 0 ? 'Atrasado ' + Math.abs(g.dias) + 'd'
                      : g.dias === 0 ? 'HOJE'
                      : 'Em ' + g.dias + 'd';

      card.innerHTML =
        '<div>' +
          '<div style="font-weight:600;color:var(--ink);font-size:13px;display:flex;align-items:center;gap:6px">' +
            '<span style="font-size:16px">' + icone + '</span>' +
            escapeHtmlAlerta(g.titulo) +
          '</div>' +
          '<div style="font-size:11px;color:var(--ink-soft);margin-top:3px">' +
            '<strong>' + escapeHtmlAlerta(g.inquilino) + '</strong> · ' +
            (g.clausula_origem ? escapeHtmlAlerta(g.clausula_origem) : '') +
          '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-weight:700;color:var(--ink);font-size:13px">' + data + '</div>' +
          '<div style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:' + corBg + ';color:#fff;margin-top:2px">' + labelDias + '</div>' +
        '</div>';

      // Clique abre o contrato no modo edição (aba Gestões)
      card.addEventListener('click', () => {
        if (typeof window.abrirContratoComAbaGestoes === 'function') {
          window.abrirContratoComAbaGestoes(g.contrato_id);
        } else {
          abrirFormContrato(g.contrato_id);
        }
      });
      grupoEl.appendChild(card);
    });
    container.appendChild(grupoEl);
  };

  renderGrupo(grupos.atrasadas, '⚠️ Atrasadas', '#dc2626', '#7f1d1d');
  renderGrupo(grupos.em30,      '🔴 Próximas 30 dias', '#ea580c', '#9a3412');
  renderGrupo(grupos.em90,      '🟡 Próximas 90 dias', '#ca8a04', '#854d0e');

  // Separador entre seções
  const sep = el('div');
  sep.style.cssText = 'height:1px;background:var(--line);margin:18px 0';
  container.appendChild(sep);
}

function escapeHtmlAlerta(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderBannerAlertas(contratos, propostas, leads, gestoes = []) {
  const box = document.getElementById('alertas-banner');
  if (!box) return;

  const hoje = Date.now();
  const itens = [];

  // 0. Gestões atrasadas (urgência máxima — aparecem primeiro)
  const hojeMs = new Date(); hojeMs.setHours(0,0,0,0);
  const gestoesAtrasadas = (gestoes || []).filter(g =>
    g.data_evento && new Date(g.data_evento) < hojeMs
  );
  if (gestoesAtrasadas.length > 0) {
    itens.push(gestoesAtrasadas.length + ' gestão(ões) de contrato atrasada(s)');
  }

  // 1. Contratos vencendo nos próximos 120 dias
  const contratosVencendo = contratos.filter(c => {
    if (!c.data_termino) return false;
    const fim = parseBR(c.data_termino);
    if (!fim || isNaN(fim)) return false;
    const dias = (fim - hoje) / 86400000;
    return dias > 0 && dias <= 120;
  });
  if (contratosVencendo.length > 0) {
    itens.push(contratosVencendo.length + ' contrato(s) vencem em até 120 dias');
  }

  // 2. Leads ativos parados há > 30 dias
  const leadsParados = (leads || []).filter(l => {
    if (!['interessado','visitou','em_analise'].includes(l.status)) return false;
    const ult = l.ultima_interacao_data || l.updated_at || l.created_at;
    if (!ult) return false;
    const dias = (hoje - new Date(ult)) / 86400000;
    return dias > 30;
  });
  if (leadsParados.length > 0) {
    itens.push(leadsParados.length + ' lead(s) parado(s) há mais de 30 dias');
  }

  // 3. Propostas aceitas há > 7 dias aguardando docs
  const propAguardando = propostas.filter(p => {
    if (p.status !== 'aceita_aguardando_docs') return false;
    const d = parseBR(p.data_proposta);
    if (!d || isNaN(d)) return false;
    const dias = (hoje - d) / 86400000;
    return dias > 7;
  });
  if (propAguardando.length > 0) {
    itens.push(propAguardando.length + ' proposta(s) aguardando documentação há > 7 dias');
  }

  if (itens.length === 0) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="alertas-banner-box">
      <div class="alertas-banner-icon">🔔</div>
      <div style="flex:1">
        <div class="alertas-banner-titulo">${itens.length} ${itens.length === 1 ? 'item precisa' : 'itens precisam'} da sua atenção</div>
        <div class="alertas-banner-itens">${itens.map(i => '<span>' + i + '</span>').join('')}</div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Funil comercial
// ---------------------------------------------------------------------
function renderFunilComercial(leads, propostas, contratos) {
  const box = document.getElementById('funil-comercial');
  if (!box) return;

  const leadsAtivos = (leads || []).filter(l => ['interessado','visitou','em_analise'].includes(l.status));
  const propAtivas = propostas.filter(p => ['em_analise','em_negociacao','aceita_aguardando_docs'].includes(p.status));
  const contratosAtivos = contratos.length;

  const leadsInteressado = leadsAtivos.filter(l => l.status === 'interessado').length;
  const leadsVisitou = leadsAtivos.filter(l => l.status === 'visitou').length;
  const leadsAnalise = leadsAtivos.filter(l => l.status === 'em_analise').length;

  const propEmAnalise = propAtivas.filter(p => p.status === 'em_analise').length;
  const propAceitas = propAtivas.filter(p => p.status === 'aceita_aguardando_docs').length;

  box.innerHTML = `
    <div class="funil-horizontal">
      <div class="funil-step funil-step-leads">
        <div>
          <div class="funil-step-label">Leads ativos</div>
          <div class="funil-step-detalhe">${leadsInteressado} interessados · ${leadsVisitou} visitaram · ${leadsAnalise} em análise</div>
        </div>
        <div class="funil-step-numero">${leadsAtivos.length}</div>
      </div>
      <div class="funil-arrow-h">→</div>
      <div class="funil-step funil-step-propostas">
        <div>
          <div class="funil-step-label">Propostas</div>
          <div class="funil-step-detalhe">${propEmAnalise} em análise · ${propAceitas} aceitas aguardando docs</div>
        </div>
        <div class="funil-step-numero">${propAtivas.length}</div>
      </div>
      <div class="funil-arrow-h">→</div>
      <div class="funil-step funil-step-contratos">
        <div>
          <div class="funil-step-label">Contratos ativos</div>
          <div class="funil-step-detalhe">Receita: ${formatMoney(contratos.reduce((s,c) => s + Number(c.valor_aluguel || 0), 0))}/mês</div>
        </div>
        <div class="funil-step-numero">${contratosAtivos}</div>
      </div>
    </div>
  `;
}

const STATUS_LEAD_LABELS = {
  interessado: { label: 'Interessado', cor: '#94a3b8', bg: '#f1f5f9' },
  visitou: { label: 'Visitou', cor: '#2563eb', bg: '#dbeafe' },
  em_analise: { label: 'Em análise', cor: '#d97706', bg: '#fef3c7' },
  virou_proposta: { label: 'Virou proposta', cor: '#16a34a', bg: '#dcfce7' },
  desistiu: { label: 'Desistiu', cor: '#dc2626', bg: '#fee2e2' }
};

function renderLeads(leads) {
  const resumoBox = document.getElementById('leads-resumo');
  if (!resumoBox) return;

  const filtroAtual = getState('leadsFiltro');

  // Contadores por status (universo todo)
  const ativosArr = leads.filter(l => ['interessado','visitou','em_analise'].includes(l.status));
  const interessados = leads.filter(l => l.status === 'interessado').length;
  const visitou = leads.filter(l => l.status === 'visitou').length;
  const emAnalise = leads.filter(l => l.status === 'em_analise').length;
  const virouProp = leads.filter(l => l.status === 'virou_proposta').length;
  const desistiu = leads.filter(l => l.status === 'desistiu').length;

  // Atualiza contadores das sub-abas
  const setCnt = (id, n) => { const e = document.getElementById(id); if (e) e.textContent = `(${n})`; };
  setCnt('cnt-lead-ativos', ativosArr.length);
  setCnt('cnt-lead-interessado', interessados);
  setCnt('cnt-lead-visitou', visitou);
  setCnt('cnt-lead-analise', emAnalise);
  setCnt('cnt-lead-virou', virouProp);
  setCnt('cnt-lead-desistiu', desistiu);
  setCnt('cnt-lead-todos', leads.length);

  // Título dinâmico
  const titulos = {
    ativos: 'Leads — clientes acompanhando, antes da proposta formal',
    interessado: 'Leads interessados',
    visitou: 'Leads que já visitaram',
    em_analise: 'Leads em análise',
    virou_proposta: 'Leads que viraram proposta',
    desistiu: 'Leads que desistiram',
    all: 'Todos os leads'
  };
  const tituloEl = document.getElementById('leads-titulo');
  if (tituloEl) tituloEl.textContent = titulos[filtroAtual] || titulos.ativos;

  // Aplica filtro
  let leadsFiltro;
  if (filtroAtual === 'ativos') leadsFiltro = ativosArr;
  else if (filtroAtual === 'all') leadsFiltro = leads;
  else leadsFiltro = leads.filter(l => l.status === filtroAtual);

  // Cards resumo (sempre sobre o universo todo)
  const cards = [
    { label: 'Interessados', valor: interessados, cor: STATUS_LEAD_LABELS.interessado.cor },
    { label: 'Visitaram', valor: visitou, cor: STATUS_LEAD_LABELS.visitou.cor },
    { label: 'Em análise', valor: emAnalise, cor: STATUS_LEAD_LABELS.em_analise.cor },
    { label: 'Viraram proposta', valor: virouProp, cor: STATUS_LEAD_LABELS.virou_proposta.cor },
    { label: 'Desistiram', valor: desistiu, cor: STATUS_LEAD_LABELS.desistiu.cor }
  ];
  resumoBox.innerHTML = cards.map(c => `
    <div style="padding:14px;background:#f8fafc;border:1px solid var(--line);border-radius:8px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);font-weight:600">${c.label}</div>
      <div style="font-size:24px;font-weight:700;color:${c.cor};margin-top:4px">${c.valor}</div>
    </div>
  `).join('');

  const lista = document.getElementById('leads-list');
  if (!lista) return;

  if (leadsFiltro.length === 0) {
    const msgVazio = leads.length === 0
      ? 'Nenhum lead registrado ainda. Clique em <strong>+ Novo lead</strong> para começar.'
      : `Nenhum lead em "<strong>${(titulos[filtroAtual] || filtroAtual).replace(/^Leads? ?/, '')}</strong>".`;
    lista.innerHTML = `<div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">${msgVazio}</div>`;
    return;
  }

  const ordenados = [...leadsFiltro].sort((a, b) => {
    const aAtivo = ['interessado','visitou','em_analise'].includes(a.status) ? 0 : 1;
    const bAtivo = ['interessado','visitou','em_analise'].includes(b.status) ? 0 : 1;
    if (aAtivo !== bAtivo) return aAtivo - bAtivo;
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  lista.innerHTML = '';
  lista.style.display = 'flex';
  lista.style.flexDirection = 'column';
  lista.style.gap = '6px';

  ordenados.forEach(l => {
    const statusInfo = STATUS_LEAD_LABELS[l.status] || STATUS_LEAD_LABELS.interessado;
    const lojasStr = l.lojas?.length > 0 ? l.lojas.join(', ') : '—';
    const dias = l.ultima_interacao_data
      ? Math.floor((Date.now() - new Date(l.ultima_interacao_data)) / 86400000)
      : Math.floor((Date.now() - new Date(l.updated_at || l.created_at)) / 86400000);
    const tempoStr = dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
    const tempoAlerta = dias > 30;
    const subTitulo = l.empresa ? ` — ${l.empresa}` : '';
    const ramoStr = l.ramo_atividade || 'Ramo não informado';

    const row = el('div', { className: 'lead-row' });
    row.style.cssText = 'display:grid;grid-template-columns:110px minmax(220px,1.6fr) 1fr 1fr 110px 70px 24px;align-items:center;gap:14px;padding:10px 14px;background:#fff;border:1px solid var(--line);border-left:4px solid ' + statusInfo.cor + ';border-radius:6px;cursor:pointer;font-size:13px';
    row.onmouseover = () => row.style.background = '#f8fafc';
    row.onmouseout = () => row.style.background = '#fff';

    const corTempo = tempoAlerta ? '#dc2626' : 'var(--ink-soft)';
    const pesoTempo = tempoAlerta ? '600' : '400';

    row.innerHTML = `
      <span class="badge" style="background:${statusInfo.bg};color:${statusInfo.cor};font-weight:600;font-size:11px;padding:3px 8px;white-space:nowrap;text-align:center">${statusInfo.label}</span>
      <div style="overflow:hidden">
        <div style="font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.cliente_nome}${subTitulo}</div>
        <div style="font-size:11px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ramoStr}</div>
      </div>
      <div style="color:var(--ink-soft);overflow:hidden">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;line-height:1.2">Lojas</div>
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lojasStr}</div>
      </div>
      <div style="color:var(--ink-soft);overflow:hidden">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;line-height:1.2">Corretor</div>
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.corretor || '—'}</div>
      </div>
      <div style="white-space:nowrap">
        <div style="font-size:10px;text-transform:uppercase;color:#94a3b8;line-height:1.2">Atualização</div>
        <div style="color:${corTempo};font-weight:${pesoTempo}">${tempoStr}</div>
      </div>
      <div style="font-size:11px;color:#94a3b8;text-align:center;line-height:1.2">${l.qtd_interacoes || 0}<br><span style="font-size:9px">inter.</span></div>
      <div style="color:#94a3b8;text-align:center;font-size:14px" data-toggle-icon>▸</div>
    `;

    const expand = el('div', { className: 'lead-row-expand' });
    expand.style.cssText = 'display:none;padding:14px 18px 14px 32px;background:#fafbfc;border:1px solid var(--line);border-top:none;border-left:4px solid ' + statusInfo.cor + ';border-radius:0 0 6px 6px;margin-top:-7px';
    const partes = [];
    if (l.observacoes) {
      partes.push(`<div style="margin-bottom:10px;font-size:13px;color:var(--ink)"><div style="color:var(--ink-soft);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Notas</div>${l.observacoes}</div>`);
    }
    if (l.motivo_desistencia) {
      partes.push(`<div style="padding:8px 12px;background:#fef2f2;border-radius:6px;font-size:13px;color:#991b1b;margin-bottom:10px"><strong>Motivo de desistência:</strong> ${l.motivo_desistencia}</div>`);
    }
    if (!l.observacoes && !l.motivo_desistencia) {
      partes.push(`<div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Sem notas registradas.</div>`);
    }
    partes.push(`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px"><button class="btn outline sm" data-edit-lead="${l.id}">✏️ Abrir / editar</button></div>`);
    expand.innerHTML = partes.join('');

    row.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-edit-lead]')) return;
      const aberto = expand.style.display === 'block';
      expand.style.display = aberto ? 'none' : 'block';
      const icon = row.querySelector('[data-toggle-icon]');
      if (icon) icon.textContent = aberto ? '▸' : '▾';
    });

    lista.appendChild(row);
    lista.appendChild(expand);
  });

  lista.querySelectorAll('[data-edit-lead]').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirFormLead(btn.dataset.editLead);
    })
  );
}


// =====================================================================
// Modal "Documentos do contrato" — lista PDFs + documentos vinculados
// =====================================================================
async function abrirModalDocumentos(contratoId) {
  const [arquivos, documentos] = await Promise.all([
    getArquivos('contrato', contratoId).catch(() => []),
    getDocumentosByContrato(contratoId).catch(() => [])
  ]);

  const body = el('div');

  const renderItem = (icone, titulo, sub, badge, storage_path) => {
    const row = el('div');
    row.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px';
    row.innerHTML =
      '<span style="font-size:22px">' + icone + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;color:var(--ink);font-size:13px">' + titulo + '</div>' +
        (sub ? '<div style="font-size:11px;color:var(--ink-soft)">' + sub + '</div>' : '') +
      '</div>' +
      (badge || '') +
      '<button class="btn outline sm" data-baixar style="font-size:11px;padding:5px 10px;white-space:nowrap">📎 Baixar</button>';
    row.querySelector('[data-baixar]').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = '...';
      try {
        const url = await getArquivoUrl(storage_path);
        if (url) window.open(url, '_blank');
        else mostrarToast('Arquivo não encontrado no Storage', 'error');
      } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
      } finally {
        b.disabled = false;
        b.textContent = '📎 Baixar';
      }
    });
    return row;
  };

  // Seção 1: arquivos diretos do contrato (contrato assinado, aditivos)
  if (arquivos && arquivos.length > 0) {
    const tit = el('div', { style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-soft)', fontWeight: '600', margin: '0 0 8px' } }, 'Contrato e aditivos');
    body.appendChild(tit);
    arquivos.forEach(a => {
      const titulo = a.categoria === 'aditivo' ? 'Aditivo' : (a.categoria === 'contrato_assinado' ? 'Contrato assinado' : (a.categoria || 'Arquivo'));
      const sub = a.nome_original + ' · ' + (a.tamanho_bytes ? (a.tamanho_bytes / 1024).toFixed(1) + ' KB' : '');
      body.appendChild(renderItem('📄', titulo, sub, '', a.storage_path));
    });
  }

  // Seção 2: documentos da tabela documentos_contrato (seguros, certidões, AVCB)
  if (documentos && documentos.length > 0) {
    const tit = el('div', { style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-soft)', fontWeight: '600', margin: '14px 0 8px' } }, 'Seguros, certidões e demais documentos');
    body.appendChild(tit);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    documentos.forEach(d => {
      const tipoLbl = (TIPOS_DOCUMENTO && TIPOS_DOCUMENTO[d.tipo]) || d.tipo;
      const validade = d.data_validade ? new Date(d.data_validade).toLocaleDateString('pt-BR') : '?';
      const numero = d.numero ? 'Nº ' + d.numero + ' · ' : '';
      const sub = numero + 'vence ' + validade + (d.descricao ? ' · ' + d.descricao : '');
      // badge de urgência
      let badge = '';
      if (d.data_validade) {
        const dias = Math.floor((new Date(d.data_validade) - hoje) / 86400000);
        let bg, color, lbl;
        if (dias < 0) { bg='#fef2f2'; color='#7f1d1d'; lbl='vencido'; }
        else if (dias <= 7) { bg='#fee2e2'; color='#b91c1c'; lbl=dias+'d'; }
        else if (dias <= 30) { bg='#ffedd5'; color='#c2410c'; lbl=dias+'d'; }
        else if (dias <= 60) { bg='#fef9c3'; color='#a16207'; lbl=dias+'d'; }
        else { bg='#dcfce7'; color='#15803d'; lbl='OK'; }
        badge = '<span style="background:' + bg + ';color:' + color + ';padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;margin-right:8px">' + lbl + '</span>';
      }
      if (d.arquivo_url) {
        body.appendChild(renderItem('📋', tipoLbl, sub, badge, d.arquivo_url));
      } else {
        // doc sem arquivo anexado
        const row = el('div');
        row.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 12px;background:#f8fafc;border:1px dashed var(--line);border-radius:6px;margin-bottom:6px';
        row.innerHTML =
          '<span style="font-size:22px;opacity:0.5">📋</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;color:var(--ink);font-size:13px">' + tipoLbl + '</div>' +
            '<div style="font-size:11px;color:var(--ink-soft)">' + sub + '</div>' +
          '</div>' +
          badge +
          '<span style="font-size:11px;color:#94a3b8;font-style:italic;white-space:nowrap">Sem arquivo</span>';
        body.appendChild(row);
      }
    });
  }

  if ((!arquivos || arquivos.length === 0) && (!documentos || documentos.length === 0)) {
    body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">Nenhum documento cadastrado para este contrato ainda.<br><span style="font-size:12px">Use o botão ✏️ editar para adicionar.</span></div>';
  }

  abrirModal({
    titulo: 'Documentos do contrato',
    body,
    submitLabel: 'Fechar',
    onSubmit: async () => { /* só fecha */ }
  });
}


// =====================================================================
// Modal "Documentos da proposta" — lista arquivos para análise
// =====================================================================
async function abrirModalArquivosProposta(propostaId) {
  const arquivos = await getArquivos('proposta', propostaId).catch(() => []);
  const body = el('div');

  const LABELS_CAT_PROP = {
    documentos_pessoais: 'Documentos do proponente',
    comprovante: 'Comprovantes',
    fianca: 'Documentos garantia/fiador',
    termo: 'Termos',
    laudo: 'Laudos',
    outro: 'Outros'
  };

  if (!arquivos || arquivos.length === 0) {
    body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">Nenhum documento anexado a esta proposta ainda.<br><span style="font-size:12px">Use o botão ✏️ Editar e a seção "Documentos para análise do proponente" para adicionar.</span></div>';
  } else {
    arquivos.forEach(a => {
      const row = el('div');
      row.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px';
      const titulo = LABELS_CAT_PROP[a.categoria] || a.categoria || 'Documento';
      const sub = (a.nome_original || '?') + (a.tamanho_bytes ? ' · ' + (a.tamanho_bytes/1024).toFixed(1) + ' KB' : '');
      row.innerHTML =
        '<span style="font-size:22px">📋</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600;color:var(--ink);font-size:13px">' + titulo + '</div>' +
          '<div style="font-size:11px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + sub + '</div>' +
        '</div>' +
        '<button class="btn outline sm" data-baixar-prop style="font-size:11px;padding:5px 10px;white-space:nowrap">📎 Baixar</button>';
      row.querySelector('[data-baixar-prop]').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = '...';
        try {
          const url = await getArquivoUrl(a.storage_path);
          if (url) window.open(url, '_blank');
          else mostrarToast('Arquivo não encontrado', 'error');
        } catch (err) {
          mostrarToast('Erro: ' + err.message, 'error');
        } finally {
          b.disabled = false;
          b.textContent = '📎 Baixar';
        }
      });
      body.appendChild(row);
    });
  }

  abrirModal({
    titulo: 'Documentos da proposta',
    body,
    submitLabel: 'Fechar',
    onSubmit: async () => { /* só fecha */ }
  });
}

// =====================================================================
// Acompanhamento de locação — tabela densa de 52 lojas em 3 colunas
// =====================================================================
function renderAcompanhamentoLocacao(lojas, contratos, propostas, inquilinos) {
  const cont = document.getElementById('acomp-tabelas');
  if (!cont) return;
  const resumoEl = document.getElementById('acomp-resumo');
  const legendaEl = document.getElementById('acomp-legenda');

  // Mapa loja → contrato/proposta + mapa código → loja (para somar áreas)
  const lojaPorCodigo = {};
  (lojas || []).forEach(l => { lojaPorCodigo[l.codigo] = l; });
  const ctrPorLoja = {};
  (contratos || []).forEach(c => (c.lojas || []).forEach(cod => { ctrPorLoja[cod] = c; }));
  const propPorLoja = {};
  (propostas || []).forEach(p => (p.lojas || []).forEach(cod => { if (!propPorLoja[cod]) propPorLoja[cod] = p; }));

  // Helper: soma das áreas privativas das lojas de um contrato/proposta
  const somarAreas = (codigos) => (codigos || []).reduce((s, cod) => {
    const l = lojaPorCodigo[cod];
    return s + (Number(l?.area_privativa) || 0);
  }, 0);

  // Conta por status
  const ocupadas = lojas.filter(l => l.status === 'ocupada').length;
  const disponiveis = lojas.filter(l => l.status === 'disponivel').length;
  const internas = lojas.filter(l => l.status === 'uso_interno').length;
  const propostaCount = lojas.filter(l => l.status === 'proposta_aceita' || l.status === 'proposta_analise').length;

  if (resumoEl) resumoEl.textContent = ocupadas + ' locadas · ' + disponiveis + ' disponíveis · ' + internas + ' internas' + (propostaCount > 0 ? ' · ' + propostaCount + ' em proposta' : '');
  if (legendaEl) {
    legendaEl.innerHTML =
      '<span><span style="display:inline-block;width:10px;height:10px;background:#A32D2D;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Locada</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:#3B6D11;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Disponível</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:#5F5E5A;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Uso interno</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:#854F0B;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Em proposta</span>';
  }

  const lojasOrd = [...lojas].sort((a, b) => Number(a.codigo) - Number(b.codigo));
  const total = lojasOrd.length;
  const tam = Math.ceil(total / 3);
  const partes = [lojasOrd.slice(0, tam), lojasOrd.slice(tam, 2 * tam), lojasOrd.slice(2 * tam)];

  cont.innerHTML = '';
  partes.forEach(parte => {
    const tabela = el('table');
    tabela.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px';
    tabela.innerHTML =
      '<thead><tr style="background:#f1f5f9">' +
      '<th style="text-align:left;padding:5px 6px;font-weight:600">L</th>' +
      '<th style="text-align:right;padding:5px 6px;font-weight:600">m²</th>' +
      '<th style="text-align:right;padding:5px 6px;font-weight:600">R$/mês</th>' +
      '<th style="text-align:right;padding:5px 6px;font-weight:600">R$/m²</th>' +
      '<th style="text-align:left;padding:5px 6px;font-weight:600">Inquilino</th>' +
      '</tr></thead>';
    const tbody = el('tbody');
    parte.forEach(l => {
      const c = ctrPorLoja[l.codigo];
      const p = !c ? propPorLoja[l.codigo] : null;
      const area = l.area_privativa ? Number(l.area_privativa) : 0;
      let cor, bg, valorMes, valorM2, nome;
      if (l.uso_interno || l.status === 'uso_interno') {
        cor = '#5F5E5A'; bg = '#F1EFE8';
        valorMes = '—'; valorM2 = '—'; nome = 'JAX 28 (interno)';
      } else if (c) {
        cor = '#A32D2D'; bg = '';
        const v = Number(c.valor_aluguel || 0);
        // R$/m² médio do contrato: valor total ÷ área total do contrato
        // (igual em todas as lojas do mesmo contrato — aritmeticamente consistente)
        const areaContrato = somarAreas(c.lojas);
        valorMes = v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        valorM2 = areaContrato > 0 ? (v / areaContrato).toFixed(0) : '—';
        nome = c.nome_fantasia_contrato || c.nome_fantasia || c.razao_social || '?';
      } else if (p) {
        cor = '#854F0B'; bg = '';
        const v = Number(p.valor_aluguel || 0);
        valorMes = v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        // Para propostas: usa area_total declarada na proposta; senão soma das áreas das lojas
        const areaProp = Number(p.area_total) || somarAreas(p.lojas) || area;
        valorM2 = areaProp > 0 ? (v / areaProp).toFixed(0) : '—';
        nome = '⏳ ' + (p.cliente_nome || 'proposta');
      } else {
        cor = '#3B6D11'; bg = '';
        valorMes = '—'; valorM2 = '—'; nome = 'Disponível';
      }
      const tr = el('tr');
      tr.style.cssText = 'border-bottom:0.5px solid #f1f5f9;cursor:' + (c ? 'pointer' : 'default') + ';' + (bg ? 'background:' + bg : '');
      tr.innerHTML =
        '<td style="padding:4px 6px"><strong>' + l.codigo + '</strong></td>' +
        '<td style="text-align:right;padding:4px 6px">' + (area > 0 ? area.toFixed(1) : '—') + '</td>' +
        '<td style="text-align:right;padding:4px 6px;color:' + cor + '">' + valorMes + '</td>' +
        '<td style="text-align:right;padding:4px 6px;color:#94a3b8">' + valorM2 + '</td>' +
        '<td style="padding:4px 6px;color:' + cor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px" title="' + nome.replace(/"/g, '&quot;') + '">' + nome + '</td>';
      if (c) {
        tr.addEventListener('mouseenter', () => { tr.style.background = '#f8fafc'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = bg || ''; });
        tr.addEventListener('click', () => {
          // Troca pra aba "Lojas Alugadas" (onde a ficha é renderizada) e abre
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.panel').forEach(pn => pn.classList.remove('active'));
          document.querySelector('[data-panel="ocupadas"]')?.classList.add('active');
          document.getElementById('ocupadas')?.classList.add('active');
          abrirFichaLoja(c.id);
          // Rola pra o topo do card
          document.getElementById('ocupadas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      tbody.appendChild(tr);
    });
    tabela.appendChild(tbody);
    cont.appendChild(tabela);
  });
}
