// =====================================================================
// Gerador de contexto completo do banco pra IA (compartilhado)
// Usado pelo chat.js (aba Chat IA) E pelo chat-widget.js (widget flutuante)
// Mantém uma única fonte da verdade pra evitar divergência de capacidades.
// =====================================================================
import {
  getInquilinos, getContratos, getLojasStatus, getPropostas, getKPIs, getLeads,
  getCobrancas, getInadimplencia, getDespesas, getDREMensal, getDocumentosTodos,
  getGestoesAtivas, getOcorrenciasPendentesGlobal,
  getReceitaConsolidadaPortfolio, getInadimplenciaSienge, getCobrancasSiengeDoMes, getDREMensalSienge
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
const TIPOS_DOC_LBL = {
  seguro_fianca: 'Seguro fianca',
  seguro_incendio: 'Seguro incendio',
  certidao_negativa_federal: 'Certidao federal',
  certidao_negativa_municipal: 'Certidao municipal',
  certidao_negativa_estadual: 'Certidao estadual',
  certidao_trabalhista: 'Certidao trabalhista',
  vistoria_inicial: 'Vistoria inicial',
  vistoria_final: 'Vistoria final',
  laudo_avcb: 'AVCB',
  alvara_funcionamento: 'Alvara funcionamento',
  outros: 'Outros'
};

export async function gerarContextoCompleto() {
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [kpis, inquilinos, contratos, propostas, lojas, leads, cobMes, inad, despMes, dre, documentos, gestoes, ocorrenciasPendentes,
         receitaConsol, inadSienge, cobSiengeMes, dreSienge] = await Promise.all([
    getKPIs().catch(() => null),
    getInquilinos().catch(() => []),
    getContratos('ativo').catch(() => []),
    getPropostas('all').catch(() => []),
    getLojasStatus().catch(() => []),
    getLeads('todos').catch(() => []),
    getCobrancas({ mes: mesAtual }).catch(() => []),
    getInadimplencia().catch(() => []),
    getDespesas({ mes: mesAtual }).catch(() => []),
    getDREMensal({}).catch(() => []),
    getDocumentosTodos().catch(() => []),
    getGestoesAtivas().catch(() => []),
    getOcorrenciasPendentesGlobal().catch(() => []),
    // SIENGE (fonte oficial financeira)
    getReceitaConsolidadaPortfolio().catch(() => null),
    getInadimplenciaSienge().catch(() => []),
    getCobrancasSiengeDoMes(mesAtual).catch(() => []),
    getDREMensalSienge(6).catch(() => [])
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

  // ===== KPIs =====
  linhas.push('## KPIs gerais');
  if (kpis) Object.entries(kpis).forEach(([k, v]) => linhas.push('- ' + k + ': ' + v));

  // ===== Áreas =====
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

  // ===== Lojas (TODAS, com depósito + exaustão) =====
  linhas.push('');
  linhas.push('## Lojas (' + lojas.length + ' total) — código, área privativa, depósito, exaustão, status, inquilino atual');
  lojas.forEach(l => {
    const area = l.area_privativa ? Number(l.area_privativa).toFixed(2) + ' m²' : '—';
    const dep = (l.area_deposito != null && Number(l.area_deposito) > 0)
      ? ' | depósito ' + Number(l.area_deposito).toFixed(2) + ' m²'
      : '';
    const ex = l.tem_exaustao ? ' | EXAUSTÃO' : '';
    const inq = l.inquilino_atual ? ' · ' + l.inquilino_atual : '';
    linhas.push('- Loja ' + l.codigo + ' | ' + area + dep + ex + ' | ' + l.status + inq);
  });
  const comExaustao = lojas.filter(l => l.tem_exaustao).map(l => l.codigo);
  const comDeposito = lojas.filter(l => l.area_deposito != null && Number(l.area_deposito) > 0);
  if (comExaustao.length > 0) linhas.push('Resumo exaustão: lojas ' + comExaustao.join(', '));
  if (comDeposito.length > 0) linhas.push('Resumo depósitos: ' + comDeposito.map(l => 'L' + l.codigo + '=' + Number(l.area_deposito).toFixed(2) + 'm²').join(', '));
  if (comExaustao.length === 0) linhas.push('Resumo exaustão: nenhuma loja com exaustão cadastrada.');
  if (comDeposito.length === 0) linhas.push('Resumo depósitos: nenhuma loja com depósito cadastrado.');

  // ===== Inquilinos =====
  linhas.push('');
  linhas.push('## Inquilinos ativos (' + inquilinos.length + ')');
  inquilinos.forEach(i => {
    linhas.push('- ' + (i.nome_fantasia || i.razao_social) + ' (' + i.razao_social + ') — ' + (i.documento || 's/doc') + ' — ' + (i.segmento || 'sem segmento'));
  });

  // ===== Contratos (TODOS, com cláusulas-chave) =====
  linhas.push('');
  linhas.push('## Contratos ativos (' + contratos.length + ') — com m² e R$/m² calculado + cláusulas-chave extraídas pela IA');
  contratos.forEach(c => {
    const lojasArr = Array.isArray(c.lojas) ? c.lojas : [];
    const lojasStr = lojasArr.join(',');
    const areas = lojasArr.map(cod => Number(areaByCodigo[cod] || 0));
    const areaTotal = areas.reduce((s, a) => s + a, 0);
    const rsm = areaTotal > 0 ? (Number(c.valor_aluguel) / areaTotal) : null;
    const detalheArea = lojasArr.length > 1
      ? lojasArr.map(cod => 'L' + cod + '=' + (areaByCodigo[cod] || '?') + 'm²').join(' + ') + ' = ' + areaTotal.toFixed(2) + ' m²'
      : areaTotal.toFixed(2) + ' m²';
    linhas.push(
      '- ' + (c.inquilino_nome || c.inquilino_razao_social || c.nome_fantasia || c.razao_social || '?') +
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
    const cl = c.clausulas_principais;
    if (cl && typeof cl === 'object' && Object.keys(cl).length > 0) {
      linhas.push('  CLÁUSULAS-CHAVE:');
      const renderCat = (label, obj) => {
        if (!obj || typeof obj !== 'object') return;
        const pares = Object.entries(obj).filter(([_, v]) => v != null && v !== '' && v !== false);
        if (pares.length === 0) return;
        linhas.push('    • ' + label + ': ' + pares.map(([k, v]) => k + '=' + (typeof v === 'object' ? JSON.stringify(v) : v)).join('; '));
      };
      renderCat('Financeiras', cl.financeiras);
      renderCat('Garantia', cl.garantia);
      renderCat('Uso/Cessão', cl.uso_cessao);
      renderCat('Devolução', cl.devolucao);
      renderCat('Encargos', cl.encargos);
      renderCat('Renovação', cl.renovacao);
    }
  });

  // ===== Propostas (TODAS) =====
  const propAtivas = propostas.filter(p => ['em_analise', 'em_negociacao', 'aceita_aguardando_docs'].includes(p.status));
  const propRecusadas = propostas.filter(p => p.status === 'recusada');
  const propExpiradas = propostas.filter(p => p.status === 'expirada');
  const propConvertidas = propostas.filter(p => p.status === 'convertida_em_contrato');
  linhas.push('');
  linhas.push('## Propostas (' + propostas.length + ' total) — todas com R$/m² calculado e benchmarks');
  linhas.push('Resumo: ' + propAtivas.length + ' ativas, ' + propRecusadas.length + ' recusadas, ' + propExpiradas.length + ' expiradas, ' + propConvertidas.length + ' convertidas em contrato');
  linhas.push('Benchmarks de mercado: conservador R$ 152/m², medio R$ 176/m², ancora R$ 193/m²');
  propostas.forEach(p => {
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

  // ===== Leads (TODOS) =====
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
    if (ciclos.length > 0) cicloMedio = (ciclos.reduce((a, b) => a + b, 0) / ciclos.length).toFixed(0);
  }

  linhas.push('');
  linhas.push('## Leads / CRM (' + leads.length + ' total)');
  linhas.push('Resumo do funil:');
  linhas.push('- Ativos: ' + leadsAtivos.length + ' (' + leads.filter(l=>l.status==='interessado').length + ' interessados, ' + leads.filter(l=>l.status==='visitou').length + ' visitaram, ' + leads.filter(l=>l.status==='em_analise').length + ' em analise)');
  linhas.push('- Viraram proposta: ' + leadsVirou.length);
  linhas.push('- Desistiram: ' + leadsDesistiu.length);
  if (taxaConversao !== null) linhas.push('- Taxa de conversao: ' + taxaConversao + '%');
  if (cicloMedio !== null) linhas.push('- Tempo medio do ciclo (inicio ate virar proposta): ' + cicloMedio + ' dias');
  if (topLojasCobicadas.length > 0) linhas.push('- Top lojas com maior interesse: ' + topLojasCobicadas.join(', '));
  if (leadsParados.length > 0) linhas.push('- ATENCAO: ' + leadsParados.length + ' lead(s) parado(s) ha mais de 30 dias');

  if (leads.length > 0) {
    linhas.push('');
    linhas.push('Detalhe de cada lead com timeline completa:');
    leads.forEach(l => {
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

  // ===== Financeiro SIENGE (fonte oficial) =====
  linhas.push('');
  linhas.push('## Financeiro — fonte SIENGE (Saldo Devedor Presente importado dos PDFs)');

  // Receita consolidada do portfolio
  if (receitaConsol) {
    const ctrsS = receitaConsol.contratos.filter(c => c.origem === 'sienge');
    const ctrsE = receitaConsol.contratos.filter(c => c.origem === 'estimado');
    linhas.push('- Receita consolidada do mes: ' + formatMoney(receitaConsol.total_geral)
      + ' (' + formatMoney(receitaConsol.total_sienge) + ' via SIENGE + '
      + formatMoney(receitaConsol.total_estimado) + ' estimado pelos contratos sem SIENGE)');
    linhas.push('- Contratos com SIENGE: ' + ctrsS.length + ' | sem SIENGE: ' + ctrsE.length);
  }

  // Cobranças SIENGE do mês corrente (todas as parcelas com vencimento no mes)
  if (cobSiengeMes && cobSiengeMes.length > 0) {
    const totalMes = cobSiengeMes.reduce((s, p) => s + Number(p.valor_corrigido || 0), 0);
    const pagasMes = cobSiengeMes.filter(p => p.status === 'paga');
    const totalPagasMes = pagasMes.reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    linhas.push('');
    linhas.push('## Cobranças SIENGE do mes (' + mesAtual + '): ' + cobSiengeMes.length + ' parcela(s) | total ' + formatMoney(totalMes) + ' | recebido ' + formatMoney(totalPagasMes));
    cobSiengeMes.forEach(p => {
      const venc = p.data_vencimento ? new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '?';
      linhas.push('- ' + p.contrato_nome + ' | ' + p.componente + ' ' + (p.sienge_codigo || '') + ' ' + (p.parcela_rotulo || '') + ' | venc ' + venc + ' | ' + formatMoney(p.valor_corrigido) + ' | status ' + p.status);
    });
  }

  // Inadimplência SIENGE (parcelas atrasadas)
  if (inadSienge && inadSienge.length > 0) {
    const totalInad = inadSienge.reduce((s, p) => s + Number(p.valor_corrigido || 0), 0);
    linhas.push('');
    linhas.push('## INADIMPLÊNCIA (parcelas SIENGE atrasadas): ' + inadSienge.length + ' parcela(s) | total ' + formatMoney(totalInad));
    inadSienge.forEach(p => {
      const venc = p.data_vencimento ? new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '?';
      linhas.push('- ' + p.contrato_nome + ' | ' + p.componente + ' ' + (p.sienge_codigo || '') + ' ' + (p.parcela_rotulo || '') + ' | venc ' + venc + ' | ' + formatMoney(p.valor_corrigido) + ' | ' + (p.dias_atraso || 0) + ' dias de atraso');
    });
  } else {
    linhas.push('');
    linhas.push('## INADIMPLÊNCIA: zero parcelas atrasadas no momento.');
  }

  // DRE caixa via SIENGE
  if (dreSienge && dreSienge.length > 0) {
    linhas.push('');
    linhas.push('## DRE caixa - últimos 6 meses (receita SIENGE + despesas locais)');
    dreSienge.forEach(m => {
      const mes = new Date(m.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      linhas.push('- ' + mes + ' | Receita ' + formatMoney(m.receita_recebida) + ' - Despesa ' + formatMoney(m.despesa_paga) + ' = ' + formatMoney(m.resultado_caixa));
    });
  }

  // Despesas (continua local — SIENGE não tem despesas operacionais)
  if (despMes.length > 0) {
    const totalD = despMes.reduce((s,d) => s + Number(d.valor || 0), 0);
    const pagaD = despMes.filter(d => d.status === 'paga').reduce((s,d) => s + Number(d.valor_pago || d.valor || 0), 0);
    linhas.push('');
    linhas.push('## Despesas do mes: total ' + formatMoney(totalD) + ' | pago ' + formatMoney(pagaD));
    despMes.forEach(d => {
      linhas.push('- [' + d.categoria + '] ' + d.descricao + ' | venc ' + fmtBR(d.vencimento) + ' | ' + formatMoney(d.valor) + ' | ' + d.status);
    });
  }

  // ===== Documentos =====
  const hojeDoc = new Date(); hojeDoc.setHours(0,0,0,0);
  if (documentos && documentos.length > 0) {
    linhas.push('');
    linhas.push('## Documentos cadastrados (' + documentos.length + ' total)');
    documentos.forEach(d => {
      const tipoLbl = TIPOS_DOC_LBL[d.tipo] || d.tipo;
      const inq = d.inquilino_nome_fantasia || d.inquilino_razao_social || 'inquilino ?';
      const val = d.data_validade ? new Date(d.data_validade) : null;
      let status = '';
      if (val) {
        const dias = Math.floor((val - hojeDoc) / 86400000);
        if (dias < 0) status = ' [VENCIDO ha ' + Math.abs(dias) + 'd]';
        else if (dias <= 7) status = ' [VENCE EM ' + dias + 'd - CRITICO]';
        else if (dias <= 30) status = ' [vence em ' + dias + 'd]';
        else status = ' [OK +' + dias + 'd]';
      }
      const validadeStr = d.data_validade ? new Date(d.data_validade).toLocaleDateString('pt-BR') : '?';
      const numero = d.numero ? ' n.' + d.numero : '';
      linhas.push('- [' + inq + '] ' + tipoLbl + numero + ' | vence ' + validadeStr + status);
    });
  } else {
    linhas.push('');
    linhas.push('## Documentos cadastrados');
    linhas.push('- Nenhum documento cadastrado ainda. Para cadastrar, edite um contrato e use a secao "Documentos do contrato".');
  }

  // ===== Gestões + Ocorrências =====
  if (gestoes && gestoes.length > 0) {
    linhas.push('');
    linhas.push('## Gestões ativas dos contratos (' + gestoes.length + ' regras)');
    gestoes.forEach(g => {
      const periodicidade = g.periodicidade_meses ? ' (a cada ' + g.periodicidade_meses + 'm)' : ' (evento único)';
      const inq = g.inquilino_nome_fantasia || g.inquilino_razao_social || g.razao_social || 'inquilino ?';
      linhas.push('- [' + inq + '] ' + (g.titulo || g.descricao || g.categoria || 'gestão') + periodicidade);
    });
  }
  if (ocorrenciasPendentes && ocorrenciasPendentes.length > 0) {
    linhas.push('');
    linhas.push('## Ocorrências PENDENTES de gestões (' + ocorrenciasPendentes.length + ' total) — itens que precisam ser cumpridos');
    const hojeOc = new Date(); hojeOc.setHours(0,0,0,0);
    let atrasadas = 0;
    ocorrenciasPendentes.forEach(o => {
      const prev = o.data_prevista ? new Date(o.data_prevista) : null;
      let status = '';
      if (prev) {
        const dias = Math.floor((prev - hojeOc) / 86400000);
        if (dias < 0) { status = ' [ATRASADO ha ' + Math.abs(dias) + 'd]'; atrasadas++; }
        else if (dias <= 7) status = ' [vence em ' + dias + 'd - urgente]';
        else status = ' [em ' + dias + 'd]';
      }
      const inq = o.inquilino_nome_fantasia || o.inquilino_razao_social || o.razao_social || 'inquilino ?';
      const dataStr = o.data_prevista ? new Date(o.data_prevista).toLocaleDateString('pt-BR') : '?';
      linhas.push('- [' + inq + '] ' + (o.titulo || o.descricao || 'item') + ' | previsto ' + dataStr + status);
    });
    if (atrasadas > 0) linhas.push('TOTAL ATRASADAS: ' + atrasadas);
  }

  // ===== Alertas/Pendências consolidados =====
  linhas.push('');
  linhas.push('## Alertas/Pendências consolidados (visão executiva)');
  const alertas = [];
  // Inadimplência SIENGE (substitui cobranças manuais que foram apagadas)
  if (inadSienge && inadSienge.length > 0) {
    const tot = inadSienge.reduce((s,p) => s + Number(p.valor_corrigido || 0), 0);
    alertas.push('• ' + inadSienge.length + ' parcela(s) SIENGE atrasada(s) — total ' + formatMoney(tot));
  }
  if (inad && inad.length > 0) {
    const tot = inad.reduce((s,c)=>s+Number(c.total_atualizado||0),0);
    alertas.push('• ' + inad.length + ' cobrança(s) manual inadimplente(s) — total atualizado ' + formatMoney(tot));
  }
  const docsVencidos = (documentos || []).filter(d => d.data_validade && new Date(d.data_validade) < hojeDoc);
  const docsVencendo = (documentos || []).filter(d => {
    if (!d.data_validade) return false;
    const dias = Math.floor((new Date(d.data_validade) - hojeDoc) / 86400000);
    return dias >= 0 && dias <= 30;
  });
  if (docsVencidos.length > 0) alertas.push('• ' + docsVencidos.length + ' documento(s) VENCIDO(s)');
  if (docsVencendo.length > 0) alertas.push('• ' + docsVencendo.length + ' documento(s) vencendo em até 30 dias');
  const ocAtrasadas = (ocorrenciasPendentes || []).filter(o => o.data_prevista && new Date(o.data_prevista) < hojeDoc);
  if (ocAtrasadas.length > 0) alertas.push('• ' + ocAtrasadas.length + ' ocorrência(s) de gestão ATRASADA(s)');
  if (leadsParados && leadsParados.length > 0) alertas.push('• ' + leadsParados.length + ' lead(s) parado(s) há mais de 30 dias');
  const propAceitas = propostas.filter(p => p.status === 'aceita_aguardando_docs');
  if (propAceitas.length > 0) alertas.push('• ' + propAceitas.length + ' proposta(s) aceita(s) aguardando documentação');
  if (alertas.length === 0) linhas.push('Nenhum alerta crítico no momento.');
  else alertas.forEach(a => linhas.push(a));

  return linhas.join('\n');
}
