// =====================================================================
// Chat IA — conversa com Claude sobre os dados do portfólio
// =====================================================================
import { chatComClaude } from './claude.js';
import {
  getInquilinos, getContratos, getLojasStatus, getPropostas, getKPIs, getLeads,
  getCobrancas, getInadimplencia, getDespesas, getDREMensal
} from './data-layer.js';
import { fmtBR, formatMoney, LABELS_GARANTIA, LABELS_STATUS_PROPOSTA } from './utils.js';

const LABELS_STATUS_LEAD = {
  interessado: 'Interessado',
  visitou: 'Visitou',
  em_analise: 'Em análise',
  virou_proposta: 'Virou proposta',
  desistiu: 'Desistiu'
};

const LABELS_TIPO_INTER = {
  nota: 'Nota', visita: 'Visita', ligacao: 'Ligação',
  email: 'Email', mudanca_status: 'Mudança status', reuniao: 'Reunião'
};

let historico = [];
let contextoDb = '';
let ultimaAtualizacaoContexto = 0;
const TTL_CONTEXTO = 30 * 1000;

export async function initChat() {
  const panel = document.getElementById('chat-ia');
  if (!panel) return;
  if (panel.dataset.inicializado === '1') return;
  panel.dataset.inicializado = '1';

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>💬 Chat com Claude — pergunte sobre o portfólio</h2>
        <button class="btn outline" id="chat-limpar">Limpar conversa</button>
      </div>
      <div class="sub" style="margin-bottom:14px;color:var(--ink-soft)">
        O Claude tem acesso aos dados atuais do app: inquilinos, contratos, propostas (todas), lojas (com áreas) e leads (CRM com timeline completa).
        Pergunte sobre vencimentos, R$/m², ocupação, garantias, comparações, projeções, pipeline.
      </div>

      <div id="chat-mensagens" style="
        min-height:280px;max-height:480px;overflow-y:auto;
        border:1px solid var(--border);border-radius:8px;
        padding:14px;background:var(--bg-soft);margin-bottom:12px">
      </div>

      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--ink-soft);margin-bottom:6px">Sugestões rápidas:</div>
        <div id="chat-sugestoes" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>

      <form id="chat-form" style="display:flex;gap:8px">
        <textarea id="chat-input"
          placeholder="Pergunte algo sobre o portfólio... (Shift+Enter para nova linha)"
          rows="2"
          style="flex:1;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px;resize:vertical"></textarea>
        <button type="submit" class="btn" id="chat-enviar" style="align-self:flex-end">Enviar</button>
      </form>
    </div>
  `;

  const mensagensEl = panel.querySelector('#chat-mensagens');
  const form = panel.querySelector('#chat-form');
  const input = panel.querySelector('#chat-input');
  const btnEnviar = panel.querySelector('#chat-enviar');
  const btnLimpar = panel.querySelector('#chat-limpar');
  const sugestoesEl = panel.querySelector('#chat-sugestoes');

  const sugestoes = [
    'Quantos leads ativos temos?',
    'Qual a taxa de conversão de leads em propostas?',
    'Quais lojas têm mais interesse no momento?',
    'Algum lead parado há mais de 30 dias?',
    'Quais propostas estão acima do R$/m² médio?',
    'Por que propostas costumam ser recusadas?',
    'Qual contrato vence primeiro?',
    'Qual a receita potencial máxima ocupando 100%?',
    'Compare R$/m² entre os contratos',
    'Quais corretores trazem mais negócios?'
  ];
  sugestoes.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn outline';
    chip.style.cssText = 'font-size:11px;padding:4px 10px';
    chip.textContent = s;
    chip.onclick = () => { input.value = s; input.focus(); };
    sugestoesEl.appendChild(chip);
  });

  if (historico.length === 0) {
    adicionarMensagem(mensagensEl, 'assistant',
      'Olá Fabricio! Sou o assistente de IA do Union 511. Tenho acesso a todos os dados do portfólio: lojas e áreas, contratos, propostas (todas, incluindo recusadas/expiradas/convertidas) e leads do CRM com timeline completa. Pergunte algo ou clique numa sugestão.');
  } else {
    historico.forEach(m => adicionarMensagem(mensagensEl, m.role, m.content));
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pergunta = input.value.trim();
    if (!pergunta) return;

    input.value = '';
    adicionarMensagem(mensagensEl, 'user', pergunta);
    historico.push({ role: 'user', content: pergunta });

    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Pensando...';
    const loadingEl = adicionarMensagem(mensagensEl, 'assistant', '🤔 ...', true);

    try {
      await atualizarContextoSeNecessario();
      const resposta = await chatComClaude(historico, contextoDb);
      loadingEl.remove();
      adicionarMensagem(mensagensEl, 'assistant', resposta);
      historico.push({ role: 'assistant', content: resposta });
    } catch (err) {
      loadingEl.remove();
      adicionarMensagem(mensagensEl, 'assistant', `⚠️ Erro: ${err.message}`);
      console.error(err);
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar';
    }
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  btnLimpar.addEventListener('click', () => {
    historico = [];
    mensagensEl.innerHTML = '';
    adicionarMensagem(mensagensEl, 'assistant',
      'Conversa reiniciada. Em que posso ajudar?');
  });
}

function adicionarMensagem(container, role, texto, temporaria = false) {
  const div = document.createElement('div');
  const ehUsuario = role === 'user';
  div.style.cssText = `
    margin-bottom:12px;padding:10px 14px;border-radius:8px;
    max-width:85%;font-size:13px;line-height:1.5;
    white-space:pre-wrap;word-wrap:break-word;
    ${ehUsuario
      ? 'background:#2563eb;color:white;margin-left:auto;text-align:left'
      : 'background:white;border:1px solid var(--border);color:var(--ink)'}
  `;
  if (temporaria) div.dataset.temp = '1';
  div.textContent = texto;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function atualizarContextoSeNecessario() {
  if (Date.now() - ultimaAtualizacaoContexto < TTL_CONTEXTO && contextoDb) return;
  contextoDb = await gerarContextoDb();
  ultimaAtualizacaoContexto = Date.now();
}

async function gerarContextoDb() {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [kpis, inquilinos, contratos, propostas, lojas, leads, cobMes, inad, despMes, dre] = await Promise.all([
    getKPIs().catch(() => null),
    getInquilinos().catch(() => []),
    getContratos('ativo').catch(() => []),
    getPropostas('all').catch(() => []),
    getLojasStatus().catch(() => []),
    getLeads('todos').catch(() => []),
    getCobrancas({ mes: mesAtual }).catch(() => []),
    getInadimplencia().catch(() => []),
    getDespesas({ mes: mesAtual }).catch(() => []),
    getDREMensal({}).catch(() => [])
  ]);

  const areaByCodigo = {};
  lojas.forEach(l => { areaByCodigo[l.codigo] = l.area_privativa; });

  const somaArea = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);
  const areaTotalPredio = somaArea(lojas.map(l => l.area_privativa));
  const areaInternas    = somaArea(lojas.filter(l => l.status === 'uso_interno').map(l => l.area_privativa));
  const areaLocavel     = areaTotalPredio - areaInternas;
  const areaOcupada     = somaArea(lojas.filter(l => l.status === 'ocupada').map(l => l.area_privativa));
  const areaDisponivel  = somaArea(lojas.filter(l => !['uso_interno','ocupada'].includes(l.status)).map(l => l.area_privativa));
  const receitaMes      = somaArea(contratos.map(c => c.valor_aluguel));
  const rsmMedioPonderado = areaOcupada > 0 ? (receitaMes / areaOcupada) : null;

  const linhas = [];
  linhas.push('## KPIs gerais');
  if (kpis) {
    Object.entries(kpis).forEach(([k, v]) => linhas.push('- ' + k + ': ' + v));
  }

  linhas.push('');
  linhas.push('## Áreas (m² privativa) — fonte: planilha NBR 12.721 Q2 oficial Union 511');
  linhas.push('- Área total do prédio: ' + areaTotalPredio.toFixed(2) + ' m²');
  linhas.push('- Área locável (excluindo 4 lojas em uso interno): ' + areaLocavel.toFixed(2) + ' m²');
  linhas.push('- Área ocupada por contratos vigentes: ' + areaOcupada.toFixed(2) + ' m²');
  linhas.push('- Área disponível para locação: ' + areaDisponivel.toFixed(2) + ' m²');
  linhas.push('- Receita cheia/mês atual: ' + formatMoney(receitaMes));
  if (rsmMedioPonderado) {
    linhas.push('- R$/m² médio ponderado (atual): R$ ' + rsmMedioPonderado.toFixed(2) + '/m²');
    linhas.push('- Projeção: ocupando 100% da área locável ao mesmo R$/m² médio: ' + formatMoney(areaLocavel * rsmMedioPonderado) + '/mês');
  }

  linhas.push('');
  linhas.push('## Lojas (' + lojas.length + ' total) — código, área privativa, status, inquilino atual');
  lojas.forEach(l => {
    const area = l.area_privativa ? Number(l.area_privativa).toFixed(2) + ' m²' : '—';
    const inq = l.inquilino_atual ? ' · ' + l.inquilino_atual : '';
    linhas.push('- Loja ' + l.codigo + ' | ' + area + ' | ' + l.status + inq);
  });

  linhas.push('');
  linhas.push('## Inquilinos ativos (' + inquilinos.length + ')');
  inquilinos.slice(0, 30).forEach(i => {
    linhas.push('- ' + (i.nome_fantasia || i.razao_social) + ' (' + i.razao_social + ') — ' + (i.documento || 's/doc') + ' — ' + (i.segmento || 'sem segmento'));
  });

  linhas.push('');
  linhas.push('## Contratos ativos (' + contratos.length + ') — com m² e R$/m² calculado');
  contratos.slice(0, 30).forEach(c => {
    const lojasArr = Array.isArray(c.lojas) ? c.lojas : [];
    const lojasStr = lojasArr.join(',');
    const areas = lojasArr.map(cod => Number(areaByCodigo[cod] || 0));
    const areaTotal = areas.reduce((s, a) => s + a, 0);
    const rsm = areaTotal > 0 ? (Number(c.valor_aluguel) / areaTotal) : null;
    const detalheArea = lojasArr.length > 1
      ? lojasArr.map(cod => 'L' + cod + '=' + (areaByCodigo[cod] || '?') + 'm²').join(' + ') + ' = ' + areaTotal.toFixed(2) + ' m²'
      : areaTotal.toFixed(2) + ' m²';
    linhas.push(
      '- ' + (c.inquilino_nome || c.inquilino_razao_social || '?') +
      ' | lojas ' + lojasStr +
      ' | ' + detalheArea +
      ' | ' + formatMoney(c.valor_aluguel) + '/mês' +
      (rsm ? ' (R$ ' + rsm.toFixed(2) + '/m²)' : '') +
      ' | início ' + fmtBR(c.data_inicio) +
      ' | prazo ' + c.prazo_meses + 'm' +
      ' | término ' + fmtBR(c.data_termino) +
      ' | reajuste ' + (c.indice_reajuste || '?') +
      ' | garantia ' + (LABELS_GARANTIA[c.tipo_garantia] || c.tipo_garantia || '?')
    );
  });

  // PROPOSTAS — todas (ativas + recusadas + expiradas + convertidas)
  const propAtivas = propostas.filter(p => ['em_analise', 'aceita_aguardando_docs'].includes(p.status));
  const propRecusadas = propostas.filter(p => p.status === 'recusada');
  const propExpiradas = propostas.filter(p => p.status === 'expirada');
  const propConvertidas = propostas.filter(p => p.status === 'convertida_em_contrato');

  linhas.push('');
  linhas.push('## Propostas (' + propostas.length + ' total) — todas com R$/m² calculado e benchmarks');
  linhas.push('Resumo: ' + propAtivas.length + ' ativas, ' + propRecusadas.length + ' recusadas, ' + propExpiradas.length + ' expiradas, ' + propConvertidas.length + ' convertidas em contrato');
  linhas.push('Benchmarks de mercado: conservador R$ 152/m², medio R$ 176/m², ancora R$ 193/m²');

  propostas.slice(0, 40).forEach(p => {
    const lojasArr = Array.isArray(p.lojas) ? p.lojas : [];
    const lojasStr = lojasArr.join(',');
    const areaPropostaLojas = lojasArr.reduce((s, cod) => s + Number(areaByCodigo[cod] || 0), 0);
    const areaUsar = p.area_total || areaPropostaLojas;
    const rsm = areaUsar > 0 ? (Number(p.valor_aluguel) / Number(areaUsar)) : null;
    const vsMedio = rsm ? ((rsm - 176) / 176 * 100).toFixed(1) : null;
    const vsCons = rsm ? ((rsm - 152) / 152 * 100).toFixed(1) : null;
    const partes = [
      '- ' + (p.cliente_nome || '?'),
      'ramo ' + (p.ramo || '?'),
      'lojas ' + (lojasStr || '?'),
      (areaUsar ? Number(areaUsar).toFixed(2) + ' m²' : 'sem area'),
      formatMoney(p.valor_aluguel) + '/mes',
      (rsm ? 'R$ ' + rsm.toFixed(2) + '/m² (' + (vsMedio >= 0 ? '+' : '') + vsMedio + '% vs medio, ' + (vsCons >= 0 ? '+' : '') + vsCons + '% vs conservador)' : ''),
      'carencia ' + (p.meses_carencia == null ? '?' : p.meses_carencia) + 'm',
      'prazo ' + (p.prazo_opcoes || '?'),
      'garantia ' + (LABELS_GARANTIA[p.tipo_garantia] || p.tipo_garantia || '?') + (p.detalhes_garantia ? ' (' + p.detalhes_garantia + ')' : ''),
      'status ' + (LABELS_STATUS_PROPOSTA[p.status] || p.status),
      'data ' + fmtBR(p.data_proposta),
      (p.corretor ? 'corretor ' + p.corretor : ''),
      (p.cv ? 'CV ' + p.cv : ''),
      (p.motivo_recusa ? 'MOTIVO RECUSA: ' + p.motivo_recusa : ''),
      (p.observacoes ? 'obs: ' + p.observacoes : '')
    ].filter(x => x && x.trim());
    linhas.push(partes.join(' | '));
  });

  // LEADS (CRM) — todos, com timeline completa
  const leadsAtivos = leads.filter(l => ['interessado', 'visitou', 'em_analise'].includes(l.status));
  const leadsVirou = leads.filter(l => l.status === 'virou_proposta');
  const leadsDesistiu = leads.filter(l => l.status === 'desistiu');
  const totalEncerrados = leadsVirou.length + leadsDesistiu.length;
  const taxaConversao = totalEncerrados > 0 ? (leadsVirou.length / totalEncerrados * 100).toFixed(1) : null;

  const interessePorLoja = {};
  leads.forEach(l => {
    (l.lojas || []).forEach(cod => {
      interessePorLoja[cod] = (interessePorLoja[cod] || 0) + 1;
    });
  });
  const topLojasCobicadas = Object.entries(interessePorLoja)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cod, qt]) => 'Loja ' + cod + ' (' + qt + (qt === 1 ? ' lead' : ' leads') + ')');

  const hoje = Date.now();
  const leadsParados = leadsAtivos.filter(l => {
    const ultData = l.ultima_interacao_data || l.updated_at || l.created_at;
    if (!ultData) return false;
    const dias = (hoje - new Date(ultData)) / 86400000;
    return dias > 30;
  });

  let cicloMedio = null;
  if (leadsVirou.length > 0) {
    const ciclos = leadsVirou
      .filter(l => l.data_inicio && l.data_fim)
      .map(l => (new Date(l.data_fim) - new Date(l.data_inicio)) / 86400000);
    if (ciclos.length > 0) {
      cicloMedio = (ciclos.reduce((a, b) => a + b, 0) / ciclos.length).toFixed(0);
    }
  }

  linhas.push('');
  linhas.push('## Leads / CRM (' + leads.length + ' total)');
  linhas.push('Resumo do funil:');
  linhas.push('- Ativos: ' + leadsAtivos.length + ' (' + leads.filter(l=>l.status==='interessado').length + ' interessados, ' + leads.filter(l=>l.status==='visitou').length + ' visitaram, ' + leads.filter(l=>l.status==='em_analise').length + ' em analise)');
  linhas.push('- Viraram proposta: ' + leadsVirou.length);
  linhas.push('- Desistiram: ' + leadsDesistiu.length);
  if (taxaConversao !== null) {
    linhas.push('- Taxa de conversao: ' + taxaConversao + '%');
  }
  if (cicloMedio !== null) {
    linhas.push('- Tempo medio do ciclo (inicio ate virar proposta): ' + cicloMedio + ' dias');
  }
  if (topLojasCobicadas.length > 0) {
    linhas.push('- Top lojas com maior interesse: ' + topLojasCobicadas.join(', '));
  }
  if (leadsParados.length > 0) {
    linhas.push('- ATENCAO: ' + leadsParados.length + ' lead(s) parado(s) ha mais de 30 dias');
  }


  if (leads.length > 0) {
    linhas.push('');
    linhas.push('Detalhe de cada lead com timeline completa:');
    leads.slice(0, 30).forEach(l => {
      const lojasStr = (l.lojas || []).join(',') || '—';
      const ultData = l.ultima_interacao_data || l.updated_at || l.created_at;
      const diasDesde = ultData ? Math.floor((hoje - new Date(ultData)) / 86400000) : null;
      let tempoStr = 'sem data';
      if (diasDesde === 0) tempoStr = 'hoje';
      else if (diasDesde !== null) tempoStr = 'ha ' + diasDesde + ' dias';

      const partes = [];
      partes.push('LEAD: ' + (l.cliente_nome || '?'));
      if (l.empresa) partes.push('empresa: ' + l.empresa);
      partes.push('ramo: ' + (l.ramo_atividade || '?'));
      partes.push('corretor: ' + (l.corretor || '?'));
      partes.push('lojas de interesse: ' + lojasStr);
      partes.push('status: ' + (LABELS_STATUS_LEAD[l.status] || l.status));
      partes.push('iniciado em ' + fmtBR(l.data_inicio));
      if (l.data_fim) partes.push('encerrado em ' + fmtBR(l.data_fim));
      partes.push('ultima atualizacao: ' + tempoStr);

      linhas.push('');
      linhas.push('• ' + partes.join(' | '));

      if (l.observacoes) linhas.push('  notas: ' + l.observacoes);
      if (l.motivo_desistencia) linhas.push('  MOTIVO DESISTENCIA: ' + l.motivo_desistencia);

      const interacoes = Array.isArray(l.interacoes) ? l.interacoes : [];
      if (interacoes.length > 0) {
        linhas.push('  Timeline com ' + interacoes.length + ' interacoes:');
        interacoes.forEach(i => {
          const dt = i.data ? fmtBR(i.data) : '?';
          const tipo = LABELS_TIPO_INTER[i.tipo] || i.tipo || 'evento';
          linhas.push('    - ' + dt + ' [' + tipo + '] ' + (i.conteudo || ''));
        });
      } else {
        linhas.push('  (sem interacoes registradas)');
      }
    });
  }

  // FINANCEIRO
  linhas.push('');
  linhas.push('## Financeiro (mes ' + mesAtual + ')');
  if (cobMes.length > 0) {
    const cheio = cobMes.reduce((s,c) => s + Number(c.valor_cheio || 0), 0);
    const desc = cobMes.reduce((s,c) => s + Number(c.desconto_concedido || 0), 0);
    const dev = cobMes.reduce((s,c) => s + Number(c.valor_devido || 0), 0);
    const pago = cobMes.filter(c => c.status === 'paga').reduce((s,c) => s + Number(c.valor_pago || c.valor_devido || 0), 0);
    linhas.push('Cobrancas do mes: ' + cobMes.length + ' | Cheio ' + formatMoney(cheio) + ' | Descontos ' + formatMoney(desc) + ' | A receber ' + formatMoney(dev) + ' | Recebido ' + formatMoney(pago));
    cobMes.slice(0, 30).forEach(c => {
      linhas.push('- ' + (c.nome_fantasia || c.razao_social) + ' | venc ' + fmtBR(c.vencimento) + ' | ' + formatMoney(c.valor_devido) + ' | ' + c.status);
    });
  }
  if (inad.length > 0) {
    const totalAt = inad.reduce((s,c) => s + Number(c.total_atualizado || 0), 0);
    linhas.push('');
    linhas.push('## INADIMPLENCIA: ' + inad.length + ' em atraso (total atualizado ' + formatMoney(totalAt) + ')');
    inad.forEach(c => {
      linhas.push('- ' + (c.nome_fantasia || c.razao_social) + ' | comp ' + fmtBR(c.competencia) + ' | ' + c.dias_atraso + ' dias atraso | saldo ' + formatMoney(c.saldo_devedor) + ' + multa ' + formatMoney(c.multa_calc) + ' + juros ' + formatMoney(c.juros_calc) + ' = ' + formatMoney(c.total_atualizado));
    });
  }
  if (despMes.length > 0) {
    const totalD = despMes.reduce((s,d) => s + Number(d.valor || 0), 0);
    const pagaD = despMes.filter(d => d.status === 'paga').reduce((s,d) => s + Number(d.valor_pago || d.valor || 0), 0);
    linhas.push('');
    linhas.push('## Despesas do mes: total ' + formatMoney(totalD) + ' | pago ' + formatMoney(pagaD));
    despMes.forEach(d => {
      linhas.push('- [' + d.categoria + '] ' + d.descricao + ' | venc ' + fmtBR(d.vencimento) + ' | ' + formatMoney(d.valor) + ' | ' + d.status);
    });
  }
  if (dre.length > 0) {
    linhas.push('');
    linhas.push('## DRE - ultimos meses (regime de caixa)');
    dre.slice(0, 6).forEach(m => {
      const mes = new Date(m.mes).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      linhas.push('- ' + mes + ' | Receita ' + formatMoney(m.receita_recebida) + ' - Despesa ' + formatMoney(m.despesa_paga) + ' = ' + formatMoney(m.resultado_caixa));
    });
  }

  return linhas.join('\n');
}
