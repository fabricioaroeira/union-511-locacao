// =====================================================================
// RENDER — Toda a lógica de exibição do dashboard
// =====================================================================
import {
  getKPIs, getLojasStatus, getInquilinos, getContratos, getPropostas, getArquivos, encerrarContrato, getLeads
} from './data-layer.js';
import {
  formatMoney, formatMoneyShort, formatPercent, formatArea,
  fmtBR, parseBR, addMonths, mesesEntre, el,
  LABELS_GARANTIA, LABELS_STATUS_PROPOSTA, REF_RSM
} from './utils.js';
import { abrirFormContrato } from './forms-contrato.js';
import { abrirFormProposta } from './forms-proposta.js';
import { abrirFormLead } from './forms-lead.js';
import { renderPlanta } from './planta-view.js';

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
  const [kpis, lojas, inquilinos, contratos, propostas, leads] = await Promise.all([
    getKPIs(), getLojasStatus(), getInquilinos(), getContratos('ativo'), getPropostas('ativas'),
    getLeads('todos').catch(() => [])
  ]);
  const safe = (fn, nome) => { try { return fn(); } catch (e) { console.error('render error em ' + nome + ':', e); } };
  safe(() => renderBannerAlertas(contratos, propostas, leads), 'renderBannerAlertas');
  safe(() => renderKpis(kpis), 'renderKpis');
  safe(() => renderFunilComercial(leads, propostas, contratos), 'renderFunilComercial');
  safe(() => renderPlanta(lojas, contratos, propostas), 'renderPlanta');
  safe(() => renderLegenda(kpis, propostas), 'renderLegenda');
  safe(() => renderOcupacao(kpis), 'renderOcupacao');
  safe(() => renderMix(contratos, inquilinos), 'renderMix');
  try { await renderTabelaOcupadas(contratos, lojas); } catch (e) { console.error('render err renderTabelaOcupadas:', e); }
  safe(() => renderTabelaDisponiveis(lojas, propostas), 'renderTabelaDisponiveis');
  safe(() => renderInquilinosCards(inquilinos, contratos), 'renderInquilinosCards');
  safe(() => renderPropostas(propostas), 'renderPropostas');
  safe(() => renderLeads(leads), 'renderLeads');
  safe(() => renderTimeline(contratos), 'renderTimeline');
  safe(() => renderTabelaVencimentos(contratos), 'renderTabelaVencimentos');
  safe(() => renderAlertas(propostas, contratos), 'renderAlertas');
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
function renderKpis(k) {
  const disp = k.lojas_locaveis - k.lojas_ocupadas;
  const pctOcup = (k.lojas_ocupadas / k.lojas_locaveis * 100);
  const pctDisp = (disp / k.lojas_locaveis * 100);
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
    <div class="kpi">
      <div class="kpi-label">Receita cheia/mês</div>
      <div class="kpi-value">${formatMoneyShort(k.receita_cheia_mes)}</div>
      <div class="kpi-sub">Inclui CTO Evolve</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Vagas comerciais</div>
      <div class="kpi-value">${k.vagas_ocupadas} / ${k.vagas_comerciais_total}</div>
      <div class="kpi-sub">${formatPercent(k.vagas_ocupadas / k.vagas_comerciais_total * 100)}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Grid de 52 lojas
// ---------------------------------------------------------------------
function renderGrid(lojas, contratos, propostas) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  grid.className = 'grid';
  const contratosByLoja = {};
  contratos.forEach(c => (c.lojas || []).forEach(codigo => contratosByLoja[codigo] = c));
  const propostaByLoja = {};
  propostas.forEach(p => (p.lojas || []).forEach(codigo => propostaByLoja[codigo] = p));

  lojas.forEach(l => {
    const div = el('div', { className: 'cell', textContent: l.codigo });
    let cls = 'disponivel';
    let title = `Loja ${l.codigo} — Disponível${l.area_privativa ? ' · ' + l.area_privativa + ' m²' : ''}`;
    if (l.status === 'uso_interno') {
      cls = 'interna';
      title = `Loja ${l.codigo} — Uso interno JAX 28 (central de vendas)`;
    } else if (l.status === 'ocupada') {
      const c = contratosByLoja[l.codigo];
      cls = c?.parcial ? 'parcial' : 'ocupada';
      title = `Loja ${l.codigo} — ${l.inquilino_atual}\n${formatMoney(c?.valor_aluguel || 0)}/mês · ${c?.indice_reajuste}${l.area_privativa ? ' · ' + l.area_privativa + ' m²' : ''}`;
    } else if (l.status === 'proposta_aceita') {
      const p = propostaByLoja[l.codigo];
      cls = 'proposta-aceita';
      title = `Loja ${l.codigo} — Proposta aceita aguardando docs\n${p?.cliente_nome}\n${formatMoney(p?.valor_aluguel || 0)}/mês`;
    } else if (l.status === 'proposta_analise') {
      const p = propostaByLoja[l.codigo];
      cls = 'proposta-analise';
      title = `Loja ${l.codigo} — Proposta em análise\n${p?.cliente_nome}\n${formatMoney(p?.valor_aluguel || 0)}/mês`;
    }
    div.classList.add(cls);
    div.title = title;
    grid.appendChild(div);
  });
}

function renderLegenda(k, propostas) {
  const disp = k.lojas_locaveis - k.lojas_ocupadas;
  const pAceitas = propostas.filter(p => p.status === 'aceita_aguardando_docs').reduce((s,p)=>s+(p.lojas?.length||0),0);
  const pAnalise = propostas.filter(p => p.status === 'em_analise').reduce((s,p)=>s+(p.lojas?.length||0),0);
  const livres = disp - pAceitas - pAnalise;
  document.getElementById('legend').innerHTML = `
    <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div>Ocupada (${k.lojas_ocupadas})</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--violet)"></div>Parcial</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--accent)"></div>Proposta aceita (${pAceitas})</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--amber)"></div>Proposta em análise (${pAnalise})</div>
    <div class="legend-item"><div class="legend-dot" style="background:#94a3b8"></div>Disponível (${livres})</div>
    <div class="legend-item"><div class="legend-dot" style="background:#1a2332"></div>Uso interno (${k.lojas_internas})</div>
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
// Potencial de receita (DEPRECATED — não usado mais; mantido só para compatibilidade)
// ---------------------------------------------------------------------
function renderPotencialReceita(k) {
  const target = document.getElementById('potencial-receita');
  if (!target) return; // seção foi removida do HTML
  const areaTotal = 3743;
  const areaInternas = (areaTotal / 52) * k.lojas_internas;
  const areaLocavel = areaTotal - areaInternas;
  const conservador = areaLocavel * REF_RSM.conservador;
  const realista = areaLocavel * REF_RSM.medio;
  const otimista = areaLocavel * REF_RSM.ancora;
  const headroom = realista - k.receita_cheia_mes;
  const pctRealizado = (k.receita_cheia_mes / realista * 100);

  target.innerHTML = `
    <table>
      <thead>
        <tr><th>Cenário</th><th>R$/m²</th><th>Premissa</th><th>Receita potencial/mês</th><th>Anual</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong style="color:var(--amber)">Conservador</strong></td>
          <td>R$ ${REF_RSM.conservador.toFixed(2)}</td>
          <td>Média simples lojas pequenas (JRBL + Maria Teresa)</td>
          <td><strong>${formatMoney(conservador,{decimals:0})}</strong></td>
          <td>${formatMoney(conservador*12,{decimals:0})}</td>
        </tr>
        <tr>
          <td><strong style="color:var(--accent)">Realista</strong></td>
          <td>R$ ${REF_RSM.medio.toFixed(2)}</td>
          <td>Média ponderada por área dos contratos com m² conhecido</td>
          <td><strong>${formatMoney(realista,{decimals:0})}</strong></td>
          <td>${formatMoney(realista*12,{decimals:0})}</td>
        </tr>
        <tr>
          <td><strong style="color:var(--green)">Otimista</strong></td>
          <td>R$ ${REF_RSM.ancora.toFixed(2)}</td>
          <td>R$/m² da âncora Pague Menos</td>
          <td><strong>${formatMoney(otimista,{decimals:0})}</strong></td>
          <td>${formatMoney(otimista*12,{decimals:0})}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:16px;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid var(--line)">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:13px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);font-weight:600;margin-bottom:4px">Receita atual cheia</div>
          <div style="font-size:18px;font-weight:700;color:var(--ink)">${formatMoney(k.receita_cheia_mes,{decimals:0})}/mês</div>
          <div style="font-size:11px;color:var(--ink-soft)">${formatMoney(k.receita_cheia_mes*12,{decimals:0})}/ano</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);font-weight:600;margin-bottom:4px">% realizado (Realista)</div>
          <div style="font-size:18px;font-weight:700;color:var(--accent)">${formatPercent(pctRealizado)}</div>
          <div style="font-size:11px;color:var(--ink-soft)">do potencial total</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);font-weight:600;margin-bottom:4px">Headroom</div>
          <div style="font-size:18px;font-weight:700;color:var(--green)">${formatMoney(headroom,{decimals:0})}/mês</div>
          <div style="font-size:11px;color:var(--ink-soft)">${formatMoney(headroom*12,{decimals:0})}/ano</div>
        </div>
      </div>
    </div>
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
async function renderTabelaOcupadas(contratos, lojas) {
  document.getElementById('ocupadas-titulo').textContent = `Lojas ocupadas (${contratos.reduce((s,c)=>s+(c.lojas?.length||0),0)} unidades · ${contratos.length} inquilinos)`;
  const tbl = document.getElementById('tbl-ocup');
  tbl.innerHTML = '';
  const sorted = [...contratos].sort((a,b) => Number(a.lojas?.[0]||0) - Number(b.lojas?.[0]||0));
  // mapa codigo -> area_privativa para somar rápido
  const areaByCodigo = {};
  (lojas || []).forEach(l => { areaByCodigo[l.codigo] = l.area_privativa; });

  for (const c of sorted) {
    const arquivos = await getArquivos('contrato', c.id);
    const status = c.parcial ? '<span class="badge parcial">Parcial</span>' : '<span class="badge ocupada">Ocupada</span>';
    const termino = c.data_termino || fmtBR(addMonths(parseBR(c.data_inicio), c.prazo_meses));
    const linksPdf = arquivos.map(a =>
      `<a class="pdf-link" href="${a.storage_path}" target="_blank">${a.categoria === 'aditivo' ? 'aditivo' : 'contrato'}</a>`
    ).join(' · ');
    // soma de áreas privativas das lojas do contrato
    const areas = (c.lojas || []).map(cod => areaByCodigo[cod]).filter(Boolean);
    const areaTotalPriv = areas.reduce((s,a) => s + Number(a), 0);
    const rsm = areaTotalPriv > 0 ? (c.valor_aluguel / areaTotalPriv) : null;
    const areaDetalhe = areas.length > 1
      ? '<br><span style="font-size:11px;color:var(--ink-soft)">' + (c.lojas || []).map(cod => 'L' + cod + '=' + (areaByCodigo[cod] || '?') + 'm²').join(' · ') + '</span>'
      : '';

    const tr = el('tr', {}, );
    tr.innerHTML = `
      <td><strong>${(c.lojas||[]).join(', ')}</strong><br>${status}</td>
      <td>
        <strong>${c.nome_fantasia || c.razao_social}</strong><br>
        <span style="font-size:11px;color:var(--ink-soft)">${c.razao_social}<br>CNPJ: ${c.documento}</span>
      </td>
      <td style="font-size:12px"><strong>${areaTotalPriv > 0 ? areaTotalPriv.toFixed(2).replace('.', ',') + ' m²' : '—'}</strong>${rsm ? '<br><span style="color:var(--ink-soft);font-size:11px">R$ ' + rsm.toFixed(2).replace('.',',') + '/m²</span>' : ''}${areaDetalhe}</td>
      <td>
        <strong>${formatMoney(c.valor_aluguel)}</strong><br>
        <span style="font-size:11px;color:var(--ink-soft)">${c.meses_carencia}m carência</span>
      </td>
      <td>dia ${String(c.dia_vencimento).padStart(2,'0')}</td>
      <td>${c.prazo_meses}m (${c.prazo_meses/12}a)</td>
      <td><span class="badge idx">${c.indice_reajuste}</span></td>
      <td style="font-size:12px;color:var(--ink-soft)">${LABELS_GARANTIA[c.tipo_garantia]}${c.detalhes_garantia ? '<br>' + c.detalhes_garantia : ''}</td>
      <td style="font-size:12px">${c.data_inicio}<br><span style="color:var(--ink-soft)">→ ${termino}</span></td>
      <td>
        ${linksPdf || '<span style="color:#94a3b8;font-size:11px">—</span>'}
        <br>
        <button class="btn ghost sm" data-edit="${c.id}">✏️ editar</button>
        <button class="btn ghost sm" data-encerrar="${c.id}">🗑 encerrar</button>
      </td>
    `;
    tbl.appendChild(tr);

    if (c.observacoes) {
      const trObs = el('tr');
      trObs.innerHTML = `<td colspan="10" style="background:#fafbfc;font-size:12px;color:var(--ink-soft);padding:6px 12px"><em>Obs: ${c.observacoes}</em></td>`;
      tbl.appendChild(trObs);
    }
  }

  // Listeners
  tbl.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => abrirFormContrato(btn.dataset.edit));
  });
  tbl.querySelectorAll('[data-encerrar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const motivo = prompt('Motivo do encerramento:');
      if (!motivo) return;
      await encerrarContrato(btn.dataset.encerrar, motivo);
      mostrarToast('Contrato encerrado');
      await renderTudo();
    });
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
        : '<span class="badge negociacao">Em análise</span>';
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
    const tr = el('tr');
    tr.innerHTML = `<td><strong>${l.codigo}</strong></td><td>${badge}</td><td>${area}</td><td>${pipeline}</td>`;
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
    const div = el('div', { className: 'tenant' });
    div.innerHTML = `
      <div>
        <div class="tenant-name">${inq.nome_fantasia || inq.razao_social}</div>
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
    tlist.appendChild(div);
  });
}

// ---------------------------------------------------------------------
// Propostas
// ---------------------------------------------------------------------
function renderPropostas(propostas) {
  const resumoBox = document.getElementById('propostas-resumo');
  const qtdAceitas = propostas.filter(p => p.status === 'aceita_aguardando_docs').length;
  const qtdAnalise = propostas.filter(p => p.status === 'em_analise').length;
  const lojasEmProposta = propostas.reduce((s,p) => s + (p.lojas?.length || 0), 0);
  const receitaPot = propostas.reduce((s,p) => s + Number(p.valor_aluguel), 0);

  const cards = [
    { label:'Propostas ativas', valor:propostas.length, sub:`${qtdAceitas} aceita(s) · ${qtdAnalise} em análise`, cor:'var(--ink)' },
    { label:'Lojas em pipeline', valor:lojasEmProposta, sub:'do total disponível', cor:'var(--accent)' },
    { label:'Receita potencial', valor:formatMoneyShort(receitaPot), sub:'/mês se fechar tudo', cor:'var(--green)' },
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

  propostas.forEach(p => {
    const isAceita = p.status === 'aceita_aguardando_docs';
    const card = el('div', { className: 'proposta-card ' + (isAceita ? 'aceita' : 'analise') });
    const statusBadge = isAceita
      ? '<span class="badge" style="background:var(--accent-soft);color:var(--accent)">Aceita — aguardando docs</span>'
      : '<span class="badge negociacao">Em análise</span>';
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
  const minDate = new Date(Math.min(...dados.map(d => d.ini)));
  const maxDate = new Date(Math.max(...dados.map(d => d.fim)));
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
      <div class="timeline-name">${d.c.nome_fantasia || d.c.razao_social}<br>
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

  const scale = document.getElementById('timeline-scale');
  const startYear = minDate.getFullYear();
  const endYear = maxDate.getFullYear();
  let scaleHtml = `<div style="width:140px"></div><div style="flex:1;display:flex;justify-content:space-between">`;
  for (let y = startYear; y <= endYear; y += Math.max(1, Math.floor((endYear-startYear)/8))) {
    scaleHtml += `<span>${y}</span>`;
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
        <td><strong>${d.c.nome_fantasia || d.c.razao_social}</strong></td>
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
function renderAlertas(propostas, contratos) {
  const list = document.getElementById('alertas-list');
  list.innerHTML = '';

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
function renderBannerAlertas(contratos, propostas, leads) {
  const box = document.getElementById('alertas-banner');
  if (!box) return;

  const hoje = Date.now();
  const itens = [];

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
  const propAtivas = propostas.filter(p => ['em_analise','aceita_aguardando_docs'].includes(p.status));
  const contratosAtivos = contratos.length;

  const leadsInteressado = leadsAtivos.filter(l => l.status === 'interessado').length;
  const leadsVisitou = leadsAtivos.filter(l => l.status === 'visitou').length;
  const leadsAnalise = leadsAtivos.filter(l => l.status === 'em_analise').length;

  const propEmAnalise = propAtivas.filter(p => p.status === 'em_analise').length;
  const propAceitas = propAtivas.filter(p => p.status === 'aceita_aguardando_docs').length;

  box.innerHTML = `
    <div class="funil-step funil-step-leads">
      <div>
        <div class="funil-step-label">Leads ativos</div>
        <div class="funil-step-detalhe">${leadsInteressado} interessados · ${leadsVisitou} visitaram · ${leadsAnalise} em análise</div>
      </div>
      <div class="funil-step-numero">${leadsAtivos.length}</div>
    </div>
    <div class="funil-arrow">↓</div>
    <div class="funil-step funil-step-propostas">
      <div>
        <div class="funil-step-label">Propostas</div>
        <div class="funil-step-detalhe">${propEmAnalise} em análise · ${propAceitas} aceitas aguardando docs</div>
      </div>
      <div class="funil-step-numero">${propAtivas.length}</div>
    </div>
    <div class="funil-arrow">↓</div>
    <div class="funil-step funil-step-contratos">
      <div>
        <div class="funil-step-label">Contratos ativos</div>
        <div class="funil-step-detalhe">Receita: ${formatMoney(contratos.reduce((s,c) => s + Number(c.valor_aluguel || 0), 0))}/mês</div>
      </div>
      <div class="funil-step-numero">${contratosAtivos}</div>
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

  // Contadores por status
  const ativos = leads.filter(l => ['interessado','visitou','em_analise'].includes(l.status));
  const interessados = leads.filter(l => l.status === 'interessado').length;
  const visitou = leads.filter(l => l.status === 'visitou').length;
  const emAnalise = leads.filter(l => l.status === 'em_analise').length;
  const virouProp = leads.filter(l => l.status === 'virou_proposta').length;
  const desistiu = leads.filter(l => l.status === 'desistiu').length;

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

  if (leads.length === 0) {
    lista.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">Nenhum lead registrado ainda. Clique em <strong>+ Novo lead</strong> para começar.</div>';
    return;
  }

  const ordenados = [...leads].sort((a, b) => {
    const aAtivo = ['interessado','visitou','em_analise'].includes(a.status) ? 0 : 1;
    const bAtivo = ['interessado','visitou','em_analise'].includes(b.status) ? 0 : 1;
    if (aAtivo !== bAtivo) return aAtivo - bAtivo;
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  lista.innerHTML = '';
  ordenados.forEach(l => {
    const statusInfo = STATUS_LEAD_LABELS[l.status] || STATUS_LEAD_LABELS.interessado;
    const lojasStr = l.lojas?.length > 0 ? l.lojas.join(', ') : '—';
    const diasDesdeAtualizacao = l.ultima_interacao_data
      ? Math.floor((Date.now() - new Date(l.ultima_interacao_data)) / 86400000)
      : Math.floor((Date.now() - new Date(l.updated_at || l.created_at)) / 86400000);
    const tempoStr = diasDesdeAtualizacao === 0 ? 'hoje'
      : diasDesdeAtualizacao === 1 ? 'há 1 dia'
      : `há ${diasDesdeAtualizacao} dias`;

    const card = el('div', { className: 'proposta-card' });
    card.style.borderLeft = `4px solid ${statusInfo.cor}`;
    card.innerHTML = `
      <div class="proposta-head">
        <div>
          <div class="proposta-titulo">${l.cliente_nome}${l.empresa ? ' — ' + l.empresa : ''}</div>
          <div class="proposta-meta-top">${l.ramo_atividade || 'Ramo não informado'}</div>
        </div>
        <span class="badge" style="background:${statusInfo.bg};color:${statusInfo.cor};font-weight:600">${statusInfo.label}</span>
      </div>
      <div class="proposta-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="proposta-cell"><div class="proposta-cell-label">Lojas de interesse</div><div class="proposta-cell-value" style="font-size:13px">${lojasStr}</div></div>
        <div class="proposta-cell"><div class="proposta-cell-label">Corretor</div><div class="proposta-cell-value" style="font-size:13px">${l.corretor || '—'}</div></div>
        <div class="proposta-cell"><div class="proposta-cell-label">Início do estudo</div><div class="proposta-cell-value" style="font-size:13px">${fmtBR(l.data_inicio)}</div></div>
        <div class="proposta-cell"><div class="proposta-cell-label">Última atualização</div><div class="proposta-cell-value" style="font-size:13px">${tempoStr}</div></div>
      </div>
      ${l.observacoes ? `<div style="padding:10px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:var(--ink-soft);margin-top:10px"><strong>Notas:</strong> ${l.observacoes}</div>` : ''}
      ${l.motivo_desistencia ? `<div style="padding:10px 12px;background:#fef2f2;border-radius:6px;font-size:13px;color:#991b1b;margin-top:10px"><strong>Motivo de desistência:</strong> ${l.motivo_desistencia}</div>` : ''}
      <div class="proposta-rodape" style="margin-top:12px">
        <div style="font-size:12px;color:var(--ink-soft)">${l.qtd_interacoes || 0} interação(ões) registrada(s)</div>
        <div class="proposta-acoes">
          <button class="btn outline sm" data-edit-lead="${l.id}">✏️ Abrir / editar</button>
        </div>
      </div>
    `;
    lista.appendChild(card);
  });


  lista.querySelectorAll('[data-edit-lead]').forEach(btn =>
    btn.addEventListener('click', () => abrirFormLead(btn.dataset.editLead))
  );
}
