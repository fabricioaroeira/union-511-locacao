// =====================================================================
// Modais de gestão financeira (pagamento, despesa, fornecedor, reajuste)
// =====================================================================
import {
  marcarCobrancaPaga, marcarCobrancaParcial,
  saveDespesa, saveFornecedor, getFornecedores,
  aplicarReajuste, buscarIGPMdoBCB, getIGPMUltimosMeses, calcularReajusteIGPM,
  marcarDespesaPaga
} from './data-layer.js';
import { abrirModal, campo, fecharModal } from './modal.js';
import { el } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';

const CATEGORIAS_DESPESA = [
  { value: 'iptu', label: 'IPTU' },
  { value: 'condominio', label: 'Condomínio' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'reforma', label: 'Reforma' },
  { value: 'honorarios', label: 'Honorários (advogado/contador)' },
  { value: 'comissao', label: 'Comissão de corretagem' },
  { value: 'administrativa', label: 'Administrativa/bancária' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'tributo', label: 'Tributo' },
  { value: 'outro', label: 'Outro' }
];

// =====================================================================
// Modal: Confirmar pagamento de COBRANÇA
// =====================================================================
export function abrirFormPagamento(cobranca) {
  const body = el('div');
  const sec = el('div', { className: 'form-section' });
  const hojeIso = new Date().toISOString().slice(0, 10);
  const valorDevido = Number(cobranca.valor_devido);

  // Detecta atraso
  const venc = new Date(cobranca.vencimento + 'T00:00:00');
  const diasAtraso = Math.max(0, Math.floor((Date.now() - venc.getTime()) / 86400000));

  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({ name: 'data_pagamento', label: 'Data do pagamento', type: 'date', value: hojeIso, required: true }));
  grid.appendChild(campo({ name: 'valor_pago', label: 'Valor recebido (R$)', type: 'number', value: valorDevido.toFixed(2), required: true, hint: 'Devido: R$ ' + valorDevido.toFixed(2).replace('.', ',') }));
  sec.appendChild(grid);

  if (diasAtraso > 0) {
    const multa = Math.round(valorDevido * 0.10 * 100) / 100;
    const juros = Math.round(valorDevido * 0.01 * diasAtraso / 30 * 100) / 100;
    const aviso = el('div', { style: 'padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;margin-bottom:12px;font-size:13px;color:#854F0B' });
    aviso.innerHTML = `<strong>⚠ Pagamento em atraso — ${diasAtraso} dia(s)</strong><br>Cláusula 5.8 do contrato: multa 10% + juros 1% a.m. pro rata die.`;
    sec.appendChild(aviso);
    const gridEnc = el('div', { className: 'form-grid' });
    gridEnc.appendChild(campo({ name: 'multa', label: 'Multa (R$)', type: 'number', value: multa.toFixed(2), hint: '10% sobre o débito' }));
    gridEnc.appendChild(campo({ name: 'juros', label: 'Juros (R$)', type: 'number', value: juros.toFixed(2), hint: '1% a.m. pro rata die' }));
    gridEnc.appendChild(campo({ name: 'correcao', label: 'Correção IGP-M (R$)', type: 'number', value: '0' }));
    sec.appendChild(gridEnc);
  }

  sec.appendChild(campo({ name: 'observacoes', label: 'Observações', type: 'textarea', full: true, rows: 2 }));
  body.appendChild(sec);

  // Botão extra: pagamento parcial
  const acoes = el('div', { style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line)' });
  const btnParcial = el('button', { type: 'button', className: 'btn outline', style: 'font-size:12px' }, 'Foi pagamento parcial');
  btnParcial.addEventListener('click', () => {
    fecharModal();
    abrirFormPagamentoParcial(cobranca);
  });
  acoes.appendChild(btnParcial);
  body.appendChild(acoes);

  abrirModal({
    titulo: 'Confirmar pagamento',
    body,
    submitLabel: '✓ Marcar como pago',
    onSubmit: async () => {
      const fd = new FormData(body.closest('form'));
      await marcarCobrancaPaga(cobranca.id, {
        data_pagamento: fd.get('data_pagamento'),
        valor_pago: Number(fd.get('valor_pago')),
        multa: Number(fd.get('multa') || 0),
        juros: Number(fd.get('juros') || 0),
        correcao: Number(fd.get('correcao') || 0),
        observacoes: fd.get('observacoes') || null
      });
      mostrarToast('Pagamento confirmado');
      await renderTudo();
    }
  });
}

function abrirFormPagamentoParcial(cobranca) {
  const body = el('div');
  const sec = el('div', { className: 'form-section' });
  sec.appendChild(el('div', { className: 'form-section-title' }, 'Pagamento parcial'));
  const aviso = el('div', { style: 'padding:10px;background:#fee2e2;color:#991b1b;border-radius:6px;font-size:12px;margin-bottom:12px' });
  aviso.innerHTML = '⚠ A cláusula 5.7 do contrato NÃO aceita pagamento parcial. Registrar mesmo assim?';
  sec.appendChild(aviso);
  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({ name: 'data_pagamento', label: 'Data', type: 'date', value: new Date().toISOString().slice(0, 10), required: true }));
  grid.appendChild(campo({ name: 'valor_pago', label: 'Valor recebido (R$)', type: 'number', required: true, hint: 'Devido: R$ ' + Number(cobranca.valor_devido).toFixed(2) }));
  sec.appendChild(grid);
  sec.appendChild(campo({ name: 'observacoes', label: 'Justificativa', type: 'textarea', full: true, rows: 2 }));
  body.appendChild(sec);

  abrirModal({
    titulo: 'Registrar pagamento parcial',
    body,
    submitLabel: 'Registrar mesmo assim',
    onSubmit: async () => {
      const fd = new FormData(body.closest('form'));
      await marcarCobrancaParcial(cobranca.id, {
        data_pagamento: fd.get('data_pagamento'),
        valor_pago: Number(fd.get('valor_pago')),
        observacoes: fd.get('observacoes')
      });
      mostrarToast('Pagamento parcial registrado');
      await renderTudo();
    }
  });
}

// =====================================================================
// Modal: nova/editar DESPESA
// =====================================================================
export async function abrirFormDespesa(despesa = null) {
  const fornecedores = await getFornecedores({ ativo: true }).catch(() => []);
  const body = el('div');

  const sec = el('div', { className: 'form-section' });
  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({
    name: 'categoria', label: 'Categoria', type: 'select',
    options: [{ value: '', label: '- Selecione -' }, ...CATEGORIAS_DESPESA],
    value: despesa?.categoria || '', required: true
  }));
  grid.appendChild(campo({
    name: 'fornecedor_id', label: 'Fornecedor', type: 'select',
    options: [{ value: '', label: '- (opcional) -' }, ...fornecedores.map(f => ({ value: f.id, label: f.nome }))],
    value: despesa?.fornecedor_id || ''
  }));
  grid.appendChild(campo({ name: 'descricao', label: 'Descrição', value: despesa?.descricao || '', required: true, full: true }));
  grid.appendChild(campo({ name: 'competencia', label: 'Competência (mês)', type: 'date', value: despesa?.competencia || new Date().toISOString().slice(0, 10), required: true }));
  grid.appendChild(campo({ name: 'vencimento', label: 'Vencimento', type: 'date', value: despesa?.vencimento || new Date().toISOString().slice(0, 10), required: true }));
  grid.appendChild(campo({ name: 'valor', label: 'Valor (R$)', type: 'number', value: despesa?.valor || '', required: true }));
  sec.appendChild(grid);
  sec.appendChild(campo({ name: 'observacoes', label: 'Observações', type: 'textarea', value: despesa?.observacoes || '', full: true, rows: 2 }));
  body.appendChild(sec);

  abrirModal({
    titulo: despesa ? 'Editar despesa' : 'Nova despesa',
    body,
    submitLabel: despesa ? 'Salvar' : 'Criar despesa',
    onSubmit: async () => {
      const fd = new FormData(body.closest('form'));
      const input = {
        id: despesa?.id,
        categoria: fd.get('categoria'),
        fornecedor_id: fd.get('fornecedor_id') || null,
        descricao: fd.get('descricao'),
        competencia: fd.get('competencia'),
        vencimento: fd.get('vencimento'),
        valor: Number(fd.get('valor')),
        observacoes: fd.get('observacoes') || null
      };
      await saveDespesa(input);
      mostrarToast(despesa ? 'Despesa atualizada' : 'Despesa criada');
      await renderTudo();
    }
  });
}

export function abrirFormPagamentoDespesa(despesa) {
  const body = el('div');
  const sec = el('div', { className: 'form-section' });
  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({ name: 'data_pagamento', label: 'Data do pagamento', type: 'date', value: new Date().toISOString().slice(0, 10), required: true }));
  grid.appendChild(campo({ name: 'valor_pago', label: 'Valor pago (R$)', type: 'number', value: Number(despesa.valor).toFixed(2), required: true, hint: 'Valor da despesa: R$ ' + Number(despesa.valor).toFixed(2) }));
  sec.appendChild(grid);
  body.appendChild(sec);

  abrirModal({
    titulo: 'Confirmar pagamento de despesa',
    body,
    submitLabel: '✓ Marcar como paga',
    onSubmit: async () => {
      const fd = new FormData(body.closest('form'));
      await marcarDespesaPaga(despesa.id, {
        data_pagamento: fd.get('data_pagamento'),
        valor_pago: Number(fd.get('valor_pago'))
      });
      mostrarToast('Despesa paga');
      await renderTudo();
    }
  });
}

// =====================================================================
// Modal: novo/editar FORNECEDOR
// =====================================================================
export function abrirFormFornecedor(fornecedor = null) {
  const body = el('div');
  const sec = el('div', { className: 'form-section' });
  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({ name: 'nome', label: 'Nome / Razão social', value: fornecedor?.nome || '', required: true, full: true }));
  grid.appendChild(campo({ name: 'documento', label: 'CNPJ / CPF', value: fornecedor?.documento || '' }));
  grid.appendChild(campo({
    name: 'categoria', label: 'Categoria principal', type: 'select',
    options: [{ value: '', label: '-' }, ...CATEGORIAS_DESPESA],
    value: fornecedor?.categoria || ''
  }));
  grid.appendChild(campo({ name: 'email', label: 'Email', type: 'email', value: fornecedor?.email || '' }));
  grid.appendChild(campo({ name: 'telefone', label: 'Telefone', value: fornecedor?.telefone || '' }));
  sec.appendChild(grid);
  sec.appendChild(campo({ name: 'observacoes', label: 'Observações', type: 'textarea', value: fornecedor?.observacoes || '', full: true, rows: 2 }));
  body.appendChild(sec);

  abrirModal({
    titulo: fornecedor ? 'Editar fornecedor' : 'Novo fornecedor',
    body,
    submitLabel: fornecedor ? 'Salvar' : 'Criar fornecedor',
    onSubmit: async () => {
      const fd = new FormData(body.closest('form'));
      await saveFornecedor({
        id: fornecedor?.id,
        nome: fd.get('nome'),
        documento: fd.get('documento') || null,
        categoria: fd.get('categoria') || null,
        email: fd.get('email') || null,
        telefone: fd.get('telefone') || null,
        observacoes: fd.get('observacoes') || null
      });
      mostrarToast(fornecedor ? 'Fornecedor atualizado' : 'Fornecedor criado');
      await renderTudo();
    }
  });
}

// =====================================================================
// Modal: aplicar REAJUSTE com IGP-M
// =====================================================================
export async function abrirFormReajuste(contrato) {
  const body = el('div');

  // Busca IGP-M dos últimos 12 meses (BCB)
  const aviso = el('div', { style: 'padding:12px;background:#f8fafc;border-radius:6px;font-size:13px;margin-bottom:12px' });
  aviso.innerHTML = '🔄 Buscando IGP-M dos últimos 12 meses na API do Banco Central...';
  body.appendChild(aviso);

  const sec = el('div', { className: 'form-section' });
  const grid = el('div', { className: 'form-grid' });
  grid.appendChild(campo({ name: 'valor_anterior', label: 'Valor atual (R$)', type: 'number', value: Number(contrato.valor_aluguel).toFixed(2), required: true }));
  grid.appendChild(campo({ name: 'valor_novo', label: 'Novo valor (R$)', type: 'number', required: true }));
  grid.appendChild(campo({ name: 'variacao_pct', label: 'Variação (%)', type: 'number', step: '0.0001' }));
  grid.appendChild(campo({ name: 'indice', label: 'Índice', type: 'select', options: [{ value: 'IGP-M', label: 'IGP-M' }, { value: 'IPCA', label: 'IPCA' }], value: contrato.indice_reajuste || 'IGP-M' }));
  grid.appendChild(campo({ name: 'data_efetivacao', label: 'Data de efetivação', type: 'date', value: new Date().toISOString().slice(0, 10), required: true }));
  sec.appendChild(grid);
  sec.appendChild(campo({ name: 'observacoes', label: 'Observações', type: 'textarea', full: true, rows: 2 }));
  body.appendChild(sec);

  abrirModal({
    titulo: 'Aplicar reajuste anual',
    body,
    submitLabel: '✓ Aplicar reajuste',
    onSubmit: async () => {
      const fd = new FormData(body.closest('form'));
      const periodoInicio = new Date(fd.get('data_efetivacao'));
      const periodoFim = new Date(periodoInicio);
      periodoFim.setFullYear(periodoFim.getFullYear() + 1);
      periodoFim.setDate(periodoFim.getDate() - 1);
      await aplicarReajuste({
        contrato_id: contrato.id,
        valor_anterior: Number(fd.get('valor_anterior')),
        valor_novo: Number(fd.get('valor_novo')),
        variacao_pct: Number(fd.get('variacao_pct') || 0),
        indice: fd.get('indice'),
        periodo_inicio: periodoInicio.toISOString().slice(0, 10),
        periodo_fim: periodoFim.toISOString().slice(0, 10),
        data_efetivacao: fd.get('data_efetivacao'),
        observacoes: fd.get('observacoes')
      });
      mostrarToast('Reajuste aplicado!');
      await renderTudo();
    }
  });

  // Em background, busca IGP-M e preenche
  try {
    let igpm = await getIGPMUltimosMeses(12);
    if (!igpm || igpm.length < 12) {
      await buscarIGPMdoBCB(24);
      igpm = await getIGPMUltimosMeses(12);
    }
    if (igpm && igpm.length >= 12) {
      const { variacaoPct, valorNovo } = calcularReajusteIGPM(igpm, Number(contrato.valor_aluguel));
      const inpNovo = body.querySelector('[name="valor_novo"]');
      const inpVar = body.querySelector('[name="variacao_pct"]');
      if (inpNovo) inpNovo.value = valorNovo.toFixed(2);
      if (inpVar) inpVar.value = variacaoPct.toFixed(4);
      aviso.innerHTML = `✓ IGP-M acumulado 12m: <strong>${variacaoPct.toFixed(2)}%</strong> · Novo valor sugerido: <strong>R$ ${valorNovo.toFixed(2).replace('.', ',')}</strong>`;
      aviso.style.background = '#dcfce7';
      aviso.style.color = '#166534';
    } else {
      aviso.innerHTML = '⚠ Não foi possível obter IGP-M completo. Preencha manualmente.';
    }
  } catch (e) {
    aviso.innerHTML = '⚠ Erro ao buscar IGP-M: ' + e.message + '. Preencha manualmente.';
    aviso.style.background = '#fee2e2';
    aviso.style.color = '#991b1b';
  }
}
