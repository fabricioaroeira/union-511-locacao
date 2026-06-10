// =====================================================================
// Renderização da aba Financeiro com sub-tabs
// =====================================================================
import {
  getCobrancas, getInadimplencia, getDespesas, getFornecedores,
  getReajustes, getDREMensal, atualizarStatusAtrasadas, getContratos
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
  const cobrancas = await getCobrancas({ mes: _mesAtual });
  const inad = await getInadimplencia();
  const elBadge = document.getElementById('fin-cnt-inad');
  if (elBadge) elBadge.textContent = inad.length > 0 ? `(${inad.length})` : '';

  if (cobrancas.length === 0) {
    box.innerHTML = `
      <div style="padding:30px;text-align:center;color:var(--ink-soft);background:#f8fafc;border-radius:8px;border:1px dashed var(--line)">
        Nenhuma cobrança em ${_mesAtual}. Clique em <strong>⚙ Gerar cobranças do mês</strong> pra criar.
      </div>`;
    return;
  }

  const totalCheio = cobrancas.reduce((s, c) => s + Number(c.valor_cheio || 0), 0);
  const totalDesc = cobrancas.reduce((s, c) => s + Number(c.desconto_concedido || 0), 0);
  const totalDev = cobrancas.reduce((s, c) => s + Number(c.valor_devido || 0), 0);
  const totalPago = cobrancas.filter(c => c.status === 'paga').reduce((s, c) => s + Number(c.valor_pago || c.valor_devido || 0), 0);

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi"><div class="kpi-label">Receita cheia</div><div class="kpi-value">${formatMoney(totalCheio)}</div></div>
      <div class="kpi amber"><div class="kpi-label">Descontos concedidos</div><div class="kpi-value">${formatMoney(totalDesc)}</div></div>
      <div class="kpi"><div class="kpi-label">A receber líquido</div><div class="kpi-value">${formatMoney(totalDev)}</div></div>
      <div class="kpi green"><div class="kpi-label">Recebido</div><div class="kpi-value">${formatMoney(totalPago)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Inquilino</th><th>Lojas</th><th>Vencimento</th>
        <th style="text-align:right">Cheio</th><th style="text-align:right">Desconto</th><th style="text-align:right">Devido</th>
        <th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${cobrancas.map(c => {
          const b = STATUS_BADGE[c.status] || STATUS_BADGE.pendente;
          const nome = c.nome_fantasia || c.razao_social;
          const lojas = Array.isArray(c.lojas) ? c.lojas.join(', ') : '—';
          const vencFmt = fmtBR(c.vencimento);
          const podeAcao = c.status !== 'paga' && c.status !== 'cancelada' && Number(c.valor_devido) > 0;
          return `<tr>
            <td><strong>${nome}</strong></td>
            <td style="font-size:12px">${lojas}</td>
            <td>${vencFmt}${c.dias_atraso > 0 ? `<br><span style="color:#991b1b;font-size:11px">${c.dias_atraso} dia(s) atraso</span>` : ''}</td>
            <td style="text-align:right">${formatMoney(c.valor_cheio)}</td>
            <td style="text-align:right;color:${Number(c.desconto_concedido) > 0 ? '#854F0B' : 'var(--ink-soft)'}">${Number(c.desconto_concedido) > 0 ? '−' + formatMoney(c.desconto_concedido) : '—'}${c.desconto_descricao ? '<br><span style="font-size:10px;color:var(--ink-soft)">' + c.desconto_descricao + '</span>' : ''}</td>
            <td style="text-align:right"><strong>${formatMoney(c.valor_devido)}</strong></td>
            <td><span class="badge" style="background:${b.bg};color:${b.cor}">${b.txt}</span></td>
            <td>${podeAcao ? `<button class="btn outline sm" data-pagar="${c.id}">✓ Pagar</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  box.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = cobrancas.find(x => x.id === btn.dataset.pagar);
      if (c) abrirFormPagamento(c);
    });
  });
}

async function renderInadimplencia(box) {
  const inad = await getInadimplencia();
  const elBadge = document.getElementById('fin-cnt-inad');
  if (elBadge) elBadge.textContent = inad.length > 0 ? `(${inad.length})` : '';

  if (inad.length === 0) {
    box.innerHTML = `<div style="padding:30px;text-align:center;color:#166534;background:#dcfce7;border-radius:8px">✓ Nenhuma inadimplência. Todos os pagamentos em dia!</div>`;
    return;
  }

  const totalDevido = inad.reduce((s, c) => s + Number(c.saldo_devedor || 0), 0);
  const totalAtualizado = inad.reduce((s, c) => s + Number(c.total_atualizado || 0), 0);

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi" style="background:#fee2e2"><div class="kpi-label">Cobranças em atraso</div><div class="kpi-value" style="color:#991b1b">${inad.length}</div></div>
      <div class="kpi" style="background:#fee2e2"><div class="kpi-label">Saldo devedor original</div><div class="kpi-value" style="color:#991b1b">${formatMoney(totalDevido)}</div></div>
      <div class="kpi" style="background:#fee2e2"><div class="kpi-label">Total atualizado (com multa+juros)</div><div class="kpi-value" style="color:#991b1b">${formatMoney(totalAtualizado)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Inquilino</th><th>Competência</th><th>Vencimento</th><th>Dias atraso</th>
        <th style="text-align:right">Saldo devedor</th><th style="text-align:right">Multa</th><th style="text-align:right">Juros</th>
        <th style="text-align:right">Total atualizado</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${inad.map(c => `<tr>
          <td><strong>${c.nome_fantasia || c.razao_social}</strong></td>
          <td>${fmtBR(c.competencia)}</td>
          <td>${fmtBR(c.vencimento)}</td>
          <td style="color:#991b1b;font-weight:600">${c.dias_atraso}</td>
          <td style="text-align:right">${formatMoney(c.saldo_devedor)}</td>
          <td style="text-align:right;color:#991b1b">${formatMoney(c.multa_calc)}</td>
          <td style="text-align:right;color:#991b1b">${formatMoney(c.juros_calc)}</td>
          <td style="text-align:right;color:#991b1b;font-weight:700">${formatMoney(c.total_atualizado)}</td>
          <td><button class="btn outline sm" data-pagar-inad="${c.id}">✓ Receber</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
  box.querySelectorAll('[data-pagar-inad]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = inad.find(x => x.id === btn.dataset.pagarInad);
      if (c) abrirFormPagamento(c);
    });
  });
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
  const dre = await getDREMensal({});
  if (dre.length === 0) {
    box.innerHTML = `<div style="padding:30px;text-align:center;color:var(--ink-soft)">Sem dados financeiros ainda.</div>`;
    return;
  }

  const ultimo = dre[0];
  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
      <div class="kpi green"><div class="kpi-label">Receita recebida (último mês)</div><div class="kpi-value">${formatMoney(ultimo.receita_recebida)}</div></div>
      <div class="kpi amber"><div class="kpi-label">Despesas pagas</div><div class="kpi-value">${formatMoney(ultimo.despesa_paga)}</div></div>
      <div class="kpi"><div class="kpi-label">Resultado de caixa</div><div class="kpi-value" style="color:${Number(ultimo.resultado_caixa) >= 0 ? 'var(--green)' : 'var(--red)'}">${formatMoney(ultimo.resultado_caixa)}</div></div>
      <div class="kpi accent"><div class="kpi-label">Receita líquida prevista</div><div class="kpi-value">${formatMoney(ultimo.receita_liquida_prevista)}</div></div>
    </div>
    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);margin:18px 0 8px">Histórico mensal</h3>
    <table>
      <thead><tr>
        <th>Mês</th>
        <th style="text-align:right">Receita cheia</th>
        <th style="text-align:right">Descontos</th>
        <th style="text-align:right">A receber</th>
        <th style="text-align:right">Recebido</th>
        <th style="text-align:right">Despesa total</th>
        <th style="text-align:right">Despesa paga</th>
        <th style="text-align:right">Resultado caixa</th>
      </tr></thead>
      <tbody>
        ${dre.slice(0, 24).map(m => {
          const mes = new Date(m.mes).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          const res = Number(m.resultado_caixa);
          return `<tr>
            <td><strong>${mes}</strong></td>
            <td style="text-align:right">${formatMoney(m.receita_cheia)}</td>
            <td style="text-align:right;color:#854F0B">${Number(m.descontos_concedidos) > 0 ? '−' + formatMoney(m.descontos_concedidos) : '—'}</td>
            <td style="text-align:right">${formatMoney(m.receita_liquida_prevista)}</td>
            <td style="text-align:right;color:#166534">${formatMoney(m.receita_recebida)}</td>
            <td style="text-align:right">${formatMoney(m.despesa_total)}</td>
            <td style="text-align:right;color:#991b1b">${formatMoney(m.despesa_paga)}</td>
            <td style="text-align:right;font-weight:700;color:${res >= 0 ? '#166534' : '#991b1b'}">${formatMoney(res)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}
