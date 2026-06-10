// =====================================================================
// Chat Widget Flutuante - canto inferior direito
// Reusa a infraestrutura do Claude (data-layer + claude.js)
// =====================================================================
import { chatComClaude } from './claude.js';
import {
  getInquilinos, getContratos, getLojasStatus, getPropostas, getKPIs, getLeads,
  getCobrancas, getInadimplencia, getDespesas, getDREMensal
} from './data-layer.js';
import { fmtBR, formatMoney, LABELS_GARANTIA, LABELS_STATUS_PROPOSTA } from './utils.js';

const LABELS_STATUS_LEAD = {
  interessado: 'Interessado', visitou: 'Visitou', em_analise: 'Em análise',
  virou_proposta: 'Virou proposta', desistiu: 'Desistiu'
};
const LABELS_TIPO_INTER = {
  nota: 'Nota', visita: 'Visita', ligacao: 'Ligação',
  email: 'Email', mudanca_status: 'Mudança status', reuniao: 'Reunião'
};

// Estado do widget (independente da aba Chat IA)
let historico = [];
let contextoDb = '';
let ultimaAtualizacao = 0;
const TTL = 30 * 1000;
let timerFechar = null;

export function initChatWidget() {
  const widget = document.getElementById('chat-widget');
  const trigger = document.getElementById('chat-widget-trigger');
  const painel = document.getElementById('chat-widget-painel');
  const btnClose = document.getElementById('chat-widget-close');
  const mensagensEl = document.getElementById('chat-widget-mensagens');
  const sugestoesEl = document.getElementById('chat-widget-sugestoes');
  const form = document.getElementById('chat-widget-form');
  const input = document.getElementById('chat-widget-input');
  const btnEnviar = document.getElementById('chat-widget-enviar');

  if (!widget || !trigger || !painel) return;

  // Hover pra abrir (desktop). No mobile, clique
  const abrir = () => {
    if (timerFechar) { clearTimeout(timerFechar); timerFechar = null; }
    if (widget.classList.contains('aberto')) return;
    widget.classList.add('aberto');
    if (mensagensEl.children.length === 0) {
      addMsg(mensagensEl, 'bot', 'Olá! Sou o assistente IA do Union 511. Tenho acesso a todos os dados: lojas, contratos, propostas, leads. Pergunte algo ou clique numa sugestão abaixo.');
    }
    setTimeout(() => input?.focus(), 250);
  };
  const fechar = () => {
    widget.classList.remove('aberto');
  };
  const fecharComDelay = () => {
    if (timerFechar) clearTimeout(timerFechar);
    timerFechar = setTimeout(fechar, 400);
  };

  // Trigger: hover (desktop) + click (mobile/sempre)
  trigger.addEventListener('mouseenter', abrir);
  trigger.addEventListener('click', () => {
    if (widget.classList.contains('aberto')) fechar();
    else abrir();
  });
  // Manter aberto quando o mouse está dentro do widget inteiro
  widget.addEventListener('mouseleave', fecharComDelay);
  widget.addEventListener('mouseenter', () => {
    if (timerFechar) { clearTimeout(timerFechar); timerFechar = null; }
  });
  // Botão close
  btnClose.addEventListener('click', (e) => { e.stopPropagation(); fechar(); });

  // Sugestões rápidas
  const sugestoes = [
    'Quantos leads ativos?',
    'Algum lead parado?',
    'Resumo do mês',
    'Qual contrato vence primeiro?',
    'R$/m² médio do portfólio?',
    'Quais lojas têm mais interesse?'
  ];
  sugestoes.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chat-widget-chip';
    chip.textContent = s;
    chip.onclick = () => { input.value = s; input.focus(); };
    sugestoesEl.appendChild(chip);
  });

  // Submit
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pergunta = input.value.trim();
    if (!pergunta) return;

    input.value = '';
    addMsg(mensagensEl, 'user', pergunta);
    historico.push({ role: 'user', content: pergunta });

    btnEnviar.disabled = true;
    const loadingEl = addMsg(mensagensEl, 'bot', '🤔 ...');

    try {
      if (Date.now() - ultimaAtualizacao > TTL || !contextoDb) {
        contextoDb = await gerarContexto();
        ultimaAtualizacao = Date.now();
      }
      const resposta = await chatComClaude(historico, contextoDb);
      loadingEl.remove();
      addMsg(mensagensEl, 'bot', resposta);
      historico.push({ role: 'assistant', content: resposta });
    } catch (err) {
      loadingEl.remove();
      addMsg(mensagensEl, 'bot', '⚠️ Erro: ' + (err.message || err));
      console.error('Chat widget erro:', err);
    } finally {
      btnEnviar.disabled = false;
    }
  });

  // Enter envia, Shift+Enter quebra linha
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

function addMsg(container, tipo, texto) {
  const div = document.createElement('div');
  div.className = 'chat-widget-msg ' + tipo;
  div.textContent = texto;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function gerarContexto() {
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

  const linhas = [];

  linhas.push('## KPIs gerais');
  if (kpis) Object.entries(kpis).forEach(([k, v]) => linhas.push('- ' + k + ': ' + v));

  const somaArea = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);
  const areaTotalPredio = somaArea(lojas.map(l => l.area_privativa));
  const areaInternas = somaArea(lojas.filter(l => l.status === 'uso_interno').map(l => l.area_privativa));
  const areaLocavel = areaTotalPredio - areaInternas;
  const areaOcupada = somaArea(lojas.filter(l => l.status === 'ocupada').map(l => l.area_privativa));
  const receitaMes = somaArea(contratos.map(c => c.valor_aluguel));
  const rsmMedio = areaOcupada > 0 ? receitaMes / areaOcupada : null;

  linhas.push('');
  linhas.push('## Áreas e financeiro');
  linhas.push('- Área total: ' + areaTotalPredio.toFixed(2) + ' m²');
  linhas.push('- Área locável: ' + areaLocavel.toFixed(2) + ' m²');
  linhas.push('- Área ocupada: ' + areaOcupada.toFixed(2) + ' m²');
  linhas.push('- Receita atual: ' + formatMoney(receitaMes));
  if (rsmMedio) {
    linhas.push('- R$/m² médio ponderado: R$ ' + rsmMedio.toFixed(2));
    linhas.push('- Projeção 100% ocupação: ' + formatMoney(areaLocavel * rsmMedio) + '/mês');
  }

  linhas.push('');
  linhas.push('## Lojas (' + lojas.length + ')');
  lojas.forEach(l => {
    const area = l.area_privativa ? Number(l.area_privativa).toFixed(2) + ' m²' : '—';
    const inq = l.inquilino_atual ? ' · ' + l.inquilino_atual : '';
    linhas.push('- Loja ' + l.codigo + ' | ' + area + ' | ' + l.status + inq);
  });

  linhas.push('');
  linhas.push('## Inquilinos ativos (' + inquilinos.length + ')');
  inquilinos.slice(0, 30).forEach(i => {
    linhas.push('- ' + (i.nome_fantasia || i.razao_social) + ' (' + i.razao_social + ') — ' + (i.segmento || 'sem segmento'));
  });

  linhas.push('');
  linhas.push('## Contratos ativos (' + contratos.length + ')');
  contratos.slice(0, 30).forEach(c => {
    const lojasArr = Array.isArray(c.lojas) ? c.lojas : [];
    const areaTotal = lojasArr.reduce((s, cod) => s + Number(areaByCodigo[cod] || 0), 0);
    const rsm = areaTotal > 0 ? (Number(c.valor_aluguel) / areaTotal) : null;
    linhas.push('- ' + (c.inquilino_nome || c.inquilino_razao_social || '?')
      + ' | lojas ' + lojasArr.join(',')
      + ' | ' + areaTotal.toFixed(2) + 'm²'
      + ' | ' + formatMoney(c.valor_aluguel) + '/mês'
      + (rsm ? ' (R$ ' + rsm.toFixed(2) + '/m²)' : '')
      + ' | término ' + fmtBR(c.data_termino)
      + ' | garantia ' + (LABELS_GARANTIA[c.tipo_garantia] || c.tipo_garantia || '?'));
  });

  linhas.push('');
  linhas.push('## Propostas (' + propostas.length + ' total)');
  const propAt = propostas.filter(p => ['em_analise','aceita_aguardando_docs'].includes(p.status));
  const propRe = propostas.filter(p => p.status === 'recusada');
  const propEx = propostas.filter(p => p.status === 'expirada');
  const propCo = propostas.filter(p => p.status === 'convertida_em_contrato');
  linhas.push('Resumo: ' + propAt.length + ' ativas, ' + propRe.length + ' recusadas, ' + propEx.length + ' expiradas, ' + propCo.length + ' convertidas');
  propostas.slice(0, 30).forEach(p => {
    const lojasArr = Array.isArray(p.lojas) ? p.lojas : [];
    const areaProp = lojasArr.reduce((s, cod) => s + Number(areaByCodigo[cod] || 0), 0);
    const areaUsar = p.area_total || areaProp;
    const rsm = areaUsar > 0 ? (Number(p.valor_aluguel) / Number(areaUsar)) : null;
    linhas.push('- ' + (p.cliente_nome || '?') + ' | ramo ' + (p.ramo || '?')
      + ' | lojas ' + lojasArr.join(',')
      + ' | ' + formatMoney(p.valor_aluguel) + '/mês'
      + (rsm ? ' (R$ ' + rsm.toFixed(2) + '/m²)' : '')
      + ' | status ' + (LABELS_STATUS_PROPOSTA[p.status] || p.status)
      + (p.corretor ? ' | corretor ' + p.corretor : '')
      + (p.motivo_recusa ? ' | MOTIVO RECUSA: ' + p.motivo_recusa : ''));
  });

  const leadsAtivos = leads.filter(l => ['interessado','visitou','em_analise'].includes(l.status));
  const leadsVirou = leads.filter(l => l.status === 'virou_proposta');
  const leadsDesistiu = leads.filter(l => l.status === 'desistiu');
  const total = leadsVirou.length + leadsDesistiu.length;
  const taxa = total > 0 ? (leadsVirou.length / total * 100).toFixed(1) : null;

  linhas.push('');
  linhas.push('## Leads / CRM (' + leads.length + ' total)');
  linhas.push('- Ativos: ' + leadsAtivos.length + ' | Viraram proposta: ' + leadsVirou.length + ' | Desistiram: ' + leadsDesistiu.length);
  if (taxa) linhas.push('- Taxa de conversão: ' + taxa + '%');

  const hoje = Date.now();
  leads.slice(0, 20).forEach(l => {
    const lojasStr = (l.lojas || []).join(',') || '—';
    const ult = l.ultima_interacao_data || l.updated_at || l.created_at;
    const diasDesde = ult ? Math.floor((hoje - new Date(ult)) / 86400000) : null;
    const tempoStr = diasDesde === 0 ? 'hoje' : (diasDesde !== null ? 'há ' + diasDesde + ' dias' : '');
    linhas.push('');
    linhas.push('• LEAD: ' + (l.cliente_nome || '?')
      + (l.empresa ? ' (' + l.empresa + ')' : '')
      + ' | ramo ' + (l.ramo_atividade || '?')
      + ' | corretor ' + (l.corretor || '?')
      + ' | lojas ' + lojasStr
      + ' | status: ' + (LABELS_STATUS_LEAD[l.status] || l.status)
      + ' | iniciado ' + fmtBR(l.data_inicio)
      + (tempoStr ? ' | última: ' + tempoStr : ''));
    if (l.observacoes) linhas.push('  notas: ' + l.observacoes);
    if (l.motivo_desistencia) linhas.push('  DESISTÊNCIA: ' + l.motivo_desistencia);
    if (inters.length > 0) {
      linhas.push('  Timeline (' + inters.length + '):');
      inters.forEach(i => {
        const dt = i.data ? fmtBR(i.data) : '?';
        const tipo = LABELS_TIPO_INTER[i.tipo] || i.tipo;
        linhas.push('    - ' + dt + ' [' + tipo + '] ' + (i.conteudo || ''));
      });
    }
  });

  // FINANCEIRO
  linhas.push('');
  linhas.push('## Financeiro (mes ' + mesAtual + ')');
  if (cobMes.length > 0) {
    const cheio = cobMes.reduce((s,c) => s + Number(c.valor_cheio || 0), 0);
    const desc = cobMes.reduce((s,c) => s + Number(c.desconto_concedido || 0), 0);
    const dev = cobMes.reduce((s,c) => s + Number(c.valor_devido || 0), 0);
    const pago = cobMes.filter(c => c.status === 'paga').reduce((s,c) => s + Number(c.valor_pago || c.valor_devido || 0), 0);
    linhas.push('Cobrancas: ' + cobMes.length + ' | Cheio ' + formatMoney(cheio) + ' | Descontos ' + formatMoney(desc) + ' | A receber ' + formatMoney(dev) + ' | Recebido ' + formatMoney(pago));
    cobMes.slice(0, 20).forEach(c => {
      linhas.push('- ' + (c.nome_fantasia || c.razao_social) + ' | venc ' + fmtBR(c.vencimento) + ' | ' + formatMoney(c.valor_devido) + ' | ' + c.status);
    });
  }
  if (inad.length > 0) {
    const totalAt = inad.reduce((s,c) => s + Number(c.total_atualizado || 0), 0);
    linhas.push('');
    linhas.push('## INADIMPLENCIA: ' + inad.length + ' em atraso (total ' + formatMoney(totalAt) + ')');
    inad.forEach(c => {
      linhas.push('- ' + (c.nome_fantasia || c.razao_social) + ' | ' + c.dias_atraso + ' dias | total ' + formatMoney(c.total_atualizado));
    });
  }
  if (despMes.length > 0) {
    const totalD = despMes.reduce((s,d) => s + Number(d.valor || 0), 0);
    linhas.push('');
    linhas.push('## Despesas: total ' + formatMoney(totalD));
    despMes.forEach(d => {
      linhas.push('- [' + d.categoria + '] ' + d.descricao + ' | ' + formatMoney(d.valor) + ' | ' + d.status);
    });
  }
  if (dre.length > 0) {
    linhas.push('');
    linhas.push('## DRE - ultimos meses');
    dre.slice(0, 6).forEach(m => {
      const mes = new Date(m.mes).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      linhas.push('- ' + mes + ' | Receita ' + formatMoney(m.receita_recebida) + ' - Despesa ' + formatMoney(m.despesa_paga) + ' = ' + formatMoney(m.resultado_caixa));
    });
  }

  return linhas.join('\n');
}
