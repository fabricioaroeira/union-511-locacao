// =====================================================================
// Renderização da aba Financeiro com sub-tabs
// =====================================================================
import {
  getCobrancas, getInadimplencia, getDespesas, getFornecedores,
  getReajustes, getDREMensal, atualizarStatusAtrasadas, getContratos,
  getCobrancasSiengeDoMes, getInadimplenciaSienge, getDREMensalSienge
} from './data-layer.js';
import {
  abrirFormPagamento, abrirFormDespesa, abrirFormPagamentoDespesa,
  abrirFormFornecedor, abrirFormReajuste
} from './forms-financeiro.js';
import { formatMoney, fmtBR } from './utils.js';
import { mostrarToast } from './render.js';

let _subtabAtual = 'cobrancas';
let _mesAtual = new Date().toISOString().slice(0, 7);

export function setFinSubtab(tab) { _subtabAtual = tab; renderFinanceiro(); }
export function setFinMes(mes) { _mesAtual = mes; renderFinanceiro(); }

export async function renderFinanceiro() {
  const box = document.getElementById('fin-conteudo');
  if (!box) return;
  box.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft)">Carregando...</div>';

  await atualizarStatusAtrasadas().catch(() => {});

  if (_subtabAtual === 'cobrancas') return renderCobrancas(box);
  if (_subtabAtual === 'inadimplencia') return renderInadimplencia(box);
  if (_subtabAtual === 'despesas') return renderDespesas(box);
  if (_subtabAtual === 'reajustes') return renderReajustes(box);
  if (_subtabAtual === 'resumo') return renderResumo(box);
}

const STATUS_BADGE = {
  pendente: { txt: 'Pendente', cor: '#854F0B', bg: '#fef3c7' },
  paga: { txt: 'Paga', cor: '#166534', bg: '#dcfce7' },
  atrasada: { txt: 'Atrasada', cor: '#991b1b', bg: '#fee2e2' },
  parcial: { txt: 'Parcial', cor: '#9a3412', bg: '#fed7aa' },
  cancelada: { txt: 'Cancelada', cor: '#475569', bg: '#e2e8f0' }
};

async function renderCobrancas(box) {
  // SIENGE como fonte oficial: lista todas as parcelas do mês (todos os componentes: aluguel/cond/IPTU)
  const parcelas = await getCobrancasSiengeDoMes(_mesAtual);
  const inadSienge = await getInadimplenciaSienge();
  const elBadge = document.getElementById('fin-cnt-inad');
  if (elBadge) elBadge.textContent = inadSienge.length > 0 ? `(${inadSienge.length})` : '';

  if (parcelas.length === 0) {
    box.innerHTML = `
      <div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">
        Nenhuma parcela SIENGE em <strong>${_mesAtual}</strong>. Importe o "Saldo Devedor Presente" dos contratos na aba <strong>💰 SIENGE</strong> da ficha pra ver as cobranças aqui.
      </div>`;
    return;
  }

  const total = parcelas.reduce((s, p) => s + Number(p.valor_corrigido || 0), 0);
  const totalPagas = parcelas.filter(p => p.status === 'paga').reduce((s, p) => s + Number(p.valor_pago || 0), 0);
  const pendentes = parcelas.filter(p => p.status !== 'paga');
  const totalPendente = pendentes.reduce((s, p) => s + Number(p.valor_corrigido || 0), 0);
  const qtdAtrasadas = parcelas.filter(p => p.status === 'atrasada').length;

  const compLbl = { aluguel: 'Aluguel', condominio: 'Condomínio', iptu: 'IPTU', recibo: 'Recibo', outros: 'Outros' };

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi"><div class="kpi-label">Total do mês (SIENGE)</div><div class="kpi-value">${formatMoney(total)}</div></div>
      <div class="kpi green"><div class="kpi-label">Recebido</div><div class="kpi-value">${formatMoney(totalPagas)}</div></div>
      <div class="kpi amber"><div class="kpi-label">A receber</div><div class="kpi-value">${formatMoney(totalPendente)}</div></div>
      <div class="kpi" style="background:${qtdAtrasadas > 0 ? '#fee2e2' : '#f8fafc'}"><div class="kpi-label">Atrasadas</div><div class="kpi-value" style="color:${qtdAtrasadas > 0 ? '#991b1b' : 'var(--ink-soft)'}">${qtdAtrasadas}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Inquilino</th><th>Componente / Título</th><th>Vencimento</th>
        <th style="text-align:right">Valor</th><th>Status</th><th>Pagamento</th>
      </tr></thead>
      <tbody>
        ${parcelas.map(p => {
          const b = STATUS_BADGE[p.status] || STATUS_BADGE.pendente;
          const vencFmt = p.data_vencimento ? new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          const pagFmt = p.data_pagamento ? new Date(p.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          return `<tr>
            <td><strong>${p.contrato_nome || '—'}</strong></td>
            <td style="font-size:12px"><span style="color:#15803d;font-weight:600">${compLbl[p.componente] || p.componente}</span><br><span style="color:#94a3b8;font-size:11px">${p.sienge_codigo || ''} ${p.parcela_rotulo ? '· ' + p.parcela_rotulo : ''}</span></td>
            <td>${vencFmt}</td>
            <td style="text-align:right"><strong>${formatMoney(p.valor_corrigido)}</strong></td>
            <td><span class="badge" style="background:${b.bg};color:${b.cor}">${b.txt}</span></td>
            <td style="font-size:11px;color:var(--ink-soft)">${pagFmt}${p.valor_pago ? '<br>' + formatMoney(p.valor_pago) : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;color:#1e40af">
      💡 Fonte: SIENGE (Saldo Devedor Presente). Pra atualizar status de pagamentos, reimporte o PDF do contrato pela ficha → aba <strong>💰 SIENGE</strong>.
    </div>
  `;
}

async function renderInadimplencia(box) {
  const inad = await getInadimplenciaSienge();
  const elBadge = document.getElementById('fin-cnt-inad');
  if (elBadge) elBadge.textContent = inad.length > 0 ? `(${inad.length})` : '';

  if (inad.length === 0) {
    box.innerHTML = `<div style="padding:30px;text-align:center;color:#166534;background:#dcfce7;border-radius:8px">✓ Nenhuma inadimplência. Todas as parcelas SIENGE em dia!</div>`;
    return;
  }

  const totalInad = inad.reduce((s, p) => s + Number(p.valor_corrigido || 0), 0);
  const compLbl = { aluguel: 'Aluguel', condominio: 'Condomínio', iptu: 'IPTU', recibo: 'Recibo', outros: 'Outros' };

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi" style="background:#fee2e2"><div class="kpi-label">Parcelas atrasadas</div><div class="kpi-value" style="color:#991b1b">${inad.length}</div></div>
      <div class="kpi" style="background:#fee2e2"><div class="kpi-label">Total a receber</div><div class="kpi-value" style="color:#991b1b">${formatMoney(totalInad)}</div></div>
      <div class="kpi"><div class="kpi-label">Contratos afetados</div><div class="kpi-value">${new Set(inad.map(p => p.contrato_id)).size}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Inquilino</th><th>Componente</th><th>Vencimento</th><th>Dias atraso</th>
        <th style="text-align:right">Valor</th>
      </tr></thead>
      <tbody>
        ${inad.map(p => {
          const venc = p.data_vencimento ? new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
          return `<tr>
            <td><strong>${p.contrato_nome || '—'}</strong></td>
            <td style="font-size:12px"><span style="color:#15803d;font-weight:600">${compLbl[p.componente] || p.componente}</span><br><span style="color:#94a3b8;font-size:11px">${p.sienge_codigo || ''} ${p.parcela_rotulo ? '· ' + p.parcela_rotulo : ''}</span></td>
            <td>${venc}</td>
            <td style="color:#991b1b;font-weight:600">${p.dias_atraso || 0}d</td>
            <td style="text-align:right;color:#991b1b;font-weight:700">${formatMoney(p.valor_corrigido)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;color:#1e40af">
      💡 Quando uma parcela for paga no SIENGE, reimporte o PDF na ficha do contrato → aba <strong>💰 SIENGE</strong> pra atualizar o status aqui.
    </div>
  `;
}

async function renderDespesas(box) {
  const despesas = await getDespesas({ mes: _mesAtual });
  const totalPrev = despesas.reduce((s, d) => s + Number(d.valor || 0), 0);
  const totalPago = despesas.filter(d => d.status === 'paga').reduce((s, d) => s + Number(d.valor_pago || d.valor || 0), 0);

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:repeat(3,140px);gap:10px;flex:1">
        <div class="kpi"><div class="kpi-label">Despesas previstas</div><div class="kpi-value">${formatMoney(totalPrev)}</div></div>
        <div class="kpi green"><div class="kpi-label">Já pagas</div><div class="kpi-value">${formatMoney(totalPago)}</div></div>
        <div class="kpi amber"><div class="kpi-label">A pagar</div><div class="kpi-value">${formatMoney(totalPrev - totalPago)}</div></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn outline" id="btn-novo-fornecedor">+ Fornecedor</button>
        <button class="btn" id="btn-nova-despesa">+ Despesa</button>
      </div>
    </div>
    ${despesas.length === 0 ? `<div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">Nenhuma despesa em ${_mesAtual}.</div>` : `
    <table>
      <thead><tr>
        <th>Categoria</th><th>Descrição</th><th>Fornecedor</th>
        <th>Vencimento</th><th style="text-align:right">Valor</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${despesas.map(d => {
          const b = STATUS_BADGE[d.status] || STATUS_BADGE.pendente;
          return `<tr>
            <td><span class="badge" style="background:#f1f5f9;color:#475569">${d.categoria}</span></td>
            <td>${d.descricao}</td>
            <td>${d.fornecedores?.nome || '—'}</td>
            <td>${fmtBR(d.vencimento)}</td>
            <td style="text-align:right"><strong>${formatMoney(d.valor)}</strong></td>
            <td><span class="badge" style="background:${b.bg};color:${b.cor}">${b.txt}</span></td>
            <td>
              ${d.status !== 'paga' ? `<button class="btn outline sm" data-pagar-desp="${d.id}">✓ Pagar</button>` : ''}
              <button class="btn outline sm" data-editar-desp="${d.id}">✏️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    `}
  `;
  document.getElementById('btn-nova-despesa')?.addEventListener('click', () => abrirFormDespesa());
  document.getElementById('btn-novo-fornecedor')?.addEventListener('click', () => abrirFormFornecedor());
  box.querySelectorAll('[data-pagar-desp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = despesas.find(x => x.id === btn.dataset.pagarDesp);
      if (d) abrirFormPagamentoDespesa(d);
    });
  });
  box.querySelectorAll('[data-editar-desp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = despesas.find(x => x.id === btn.dataset.editarDesp);
      if (d) abrirFormDespesa(d);
    });
  });
}

async function renderReajustes(box) {
  const [reajustes, contratos] = await Promise.all([
    getReajustes(),
    getContratos('ativo')
  ]);

  // Identifica contratos próximos de aniversário (60 dias)
  const hoje = new Date();
  const proximos = contratos.map(c => {
    const ini = c.data_inicio ? new Date(c.data_inicio.split('/').reverse().join('-')) : null;
    if (!ini) return null;
    const aniversarioAno = new Date(hoje.getFullYear(), ini.getMonth(), ini.getDate());
    if (aniversarioAno < hoje) aniversarioAno.setFullYear(aniversarioAno.getFullYear() + 1);
    const diasAte = Math.floor((aniversarioAno - hoje) / 86400000);
    return { contrato: c, aniversario: aniversarioAno, diasAte };
  }).filter(x => x && x.diasAte <= 60).sort((a, b) => a.diasAte - b.diasAte);

  box.innerHTML = `
    <div style="margin-bottom:14px">
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);margin-bottom:10px">Reajustes próximos (próximos 60 dias)</h3>
      ${proximos.length === 0 ? '<div style="color:var(--ink-soft);font-size:13px">Nenhum contrato faz aniversário nos próximos 60 dias.</div>' : `
      <table>
        <thead><tr><th>Inquilino</th><th>Início</th><th>Aniversário</th><th>Dias</th><th>Valor atual</th><th>Índice</th><th>Ações</th></tr></thead>
        <tbody>
          ${proximos.map(p => `<tr>
            <td><strong>${p.contrato.inquilino_nome || p.contrato.inquilino_razao_social || '—'}</strong></td>
            <td>${fmtBR(p.contrato.data_inicio)}</td>
            <td>${p.aniversario.toLocaleDateString('pt-BR')}</td>
            <td>${p.diasAte}</td>
            <td>${formatMoney(p.contrato.valor_aluguel)}</td>
            <td>${p.contrato.indice_reajuste || 'IGP-M'}</td>
            <td><button class="btn sm" data-reajustar="${p.contrato.id}">⚙ Aplicar reajuste</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      `}
    </div>
    <div>
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);margin-bottom:10px">Histórico de reajustes</h3>
      ${reajustes.length === 0 ? '<div style="color:var(--ink-soft);font-size:13px">Nenhum reajuste registrado ainda.</div>' : `
      <table>
        <thead><tr><th>Data</th><th>Índice</th><th>Variação</th><th>Valor anterior</th><th>Valor novo</th><th>Período</th></tr></thead>
        <tbody>
          ${reajustes.map(r => `<tr>
            <td>${fmtBR(r.data_efetivacao)}</td>
            <td><span class="badge" style="background:#dbeafe;color:#0C447C">${r.indice}</span></td>
            <td style="color:#166534;font-weight:600">+${Number(r.variacao_pct).toFixed(2)}%</td>
            <td>${formatMoney(r.valor_anterior)}</td>
            <td><strong>${formatMoney(r.valor_novo)}</strong></td>
            <td style="font-size:11px;color:var(--ink-soft)">${fmtBR(r.periodo_inicio)} a ${fmtBR(r.periodo_fim)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      `}
    </div>
  `;
  box.querySelectorAll('[data-reajustar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = contratos.find(x => x.id === btn.dataset.reajustar);
      if (c) abrirFormReajuste(c);
    });
  });
}

async function renderResumo(box) {
  const dre = await getDREMensalSienge(12);
  if (dre.length === 0) {
    box.innerHTML = `<div style="padding:30px;text-align:center;color:var(--ink-soft)">Sem dados financeiros ainda. Importe os PDFs do SIENGE pelas fichas dos contratos.</div>`;
    return;
  }

  const ultimo = dre[0];
  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
      <div class="kpi green"><div class="kpi-label">Receita recebida (último mês)</div><div class="kpi-value">${formatMoney(ultimo.receita_recebida)}</div></div>
      <div class="kpi amber"><div class="kpi-label">Despesas pagas</div><div class="kpi-value">${formatMoney(ultimo.despesa_paga)}</div></div>
      <div class="kpi"><div class="kpi-label">Resultado de caixa</div><div class="kpi-value" style="color:${Number(ultimo.resultado_caixa) >= 0 ? 'var(--green)' : 'var(--red)'}">${formatMoney(ultimo.resultado_caixa)}</div></div>
    </div>
    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);margin:18px 0 8px">Histórico mensal (DRE caixa — receita SIENGE + despesas locais)</h3>
    <table>
      <thead><tr>
        <th>Mês</th>
        <th style="text-align:right">Receita recebida</th>
        <th style="text-align:right">Despesa paga</th>
        <th style="text-align:right">Resultado caixa</th>
      </tr></thead>
      <tbody>
        ${dre.map(m => {
          const mes = new Date(m.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          const res = Number(m.resultado_caixa);
          return `<tr>
            <td><strong>${mes}</strong></td>
            <td style="text-align:right;color:#166534">${formatMoney(m.receita_recebida)}</td>
            <td style="text-align:right;color:#991b1b">${formatMoney(m.despesa_paga)}</td>
            <td style="text-align:right;font-weight:700;color:${res >= 0 ? '#166534' : '#991b1b'}">${formatMoney(res)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;color:#1e40af">
      💡 Receita extraída do SIENGE (parcelas com data_pagamento no mês). Despesas vêm do módulo local de despesas.
    </div>
  `;
}
