// BUILD: 1782244772 - forcar push
// =====================================================================
// FICHA DA LOJA — gestão completa de um contrato/loja num lugar só
// Substitui o conteúdo da aba "Lojas Locadas" quando uma linha é clicada.
// =====================================================================
import { el, fmtBR, parseBR, addMonths, mesesEntre, formatMoney, LABELS_GARANTIA } from './utils.js';
import {
  getContrato, getArquivos, getDocumentosByContrato, TIPOS_DOCUMENTO,
  saveDocumento, deleteDocumento,
  getGestoesPorContrato, atualizarGestaoAtivo, getHistoricoContrato,
  getInquilinos, getLojasStatus, saveContrato,
  getAnexosContrato,
  getReajustes, aplicarReajuste,
  getSiengeParcelas, getSaldoSiengePorContrato, importarSiengePDF,
  getOcorrenciasPorGestao, marcarOcorrenciaCumprida, reabrirOcorrencia
} from './data-layer.js';
import { abrirFormContrato } from './forms-contrato.js';
import { campo, lojasPicker, abrirModal, confirmarAcao } from './modal.js';
import { getArquivoUrl, uploadPdfStorage } from './upload.js';
import { extrairDocumentoDoPDF } from './claude.js';
import { mostrarToast, renderTudo } from './render.js';

function toIsoDate(brStr) {
  if (!brStr) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(brStr)) return brStr.slice(0,10);
  const m = String(brStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Labels traduzidos pros campos do histórico
const LABEL_CAMPO = {
  valor_aluguel: 'Aluguel',
  dia_vencimento: 'Dia de vencimento',
  meses_carencia: 'Meses de carência',
  prazo_meses: 'Prazo (meses)',
  data_inicio: 'Início',
  data_termino: 'Término',
  indice_reajuste: 'Índice de reajuste',
  tipo_garantia: 'Tipo de garantia',
  detalhes_garantia: 'Detalhes da garantia',
  status: 'Status',
  observacoes: 'Observações'
};

const ICONES_TIPO_GESTAO = {
  carencia_fim: '⏳', reajuste_aniversario: '📈', marco_5anos: '⚖️',
  aviso_devolucao: '📤', termino: '🏁', garantia_pendencia: '🛡️',
  validacao_fianca: '🔍', comprovantes: '🧾', vistoria: '🔧',
  seguro: '🔥', destinacao: '📋'
};

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function diasAte(dataStr) {
  if (!dataStr) return null;
  const d = parseBR(dataStr) || new Date(dataStr);
  if (!d || isNaN(d)) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  return Math.floor((d - hoje) / 86400000);
}

function corUrgencia(dias) {
  if (dias == null) return { bg:'#f1f5f9', txt:'#475569' };
  if (dias < 0)    return { bg:'#fef2f2', txt:'#7f1d1d' };
  if (dias <= 30)  return { bg:'#fef2f2', txt:'#dc2626' };
  if (dias <= 90)  return { bg:'#fff7ed', txt:'#ea580c' };
  if (dias <= 180) return { bg:'#fefce8', txt:'#ca8a04' };
  return { bg:'#f0fdf4', txt:'#16a34a' };
}

// =====================================================================
// Estado global da ficha (qual contrato + qual aba está ativa)
// =====================================================================
let _contratoAtivo = null;
let _abaAtiva = 'resumo';
let _htmlOriginalCard = null;   // Snapshot do HTML do card pra restaurar ao voltar

export function abrirFichaLoja(contratoId) {
  _contratoAtivo = contratoId;
  _abaAtiva = 'resumo';
  renderFicha();
}

export function fecharFichaLoja() {
  _contratoAtivo = null;
  // Restaura o HTML original do card (com #ocupadas-titulo e #tbl-ocup) pra que renderTabelaOcupadas consiga voltar a renderizar a lista
  const card = document.querySelector('#ocupadas .card');
  if (card && _htmlOriginalCard) {
    card.innerHTML = _htmlOriginalCard;
    // Re-anexa listener do botão "+ Novo contrato" (perdido no innerHTML)
    const btnNovo = card.querySelector('#btn-novo-contrato');
    if (btnNovo) {
      btnNovo.addEventListener('click', async () => {
        const { abrirFormContrato } = await import('./forms-contrato.js');
        abrirFormContrato();
      });
    }
  }
}

export function getFichaLojaAtiva() {
  return _contratoAtivo;
}

// =====================================================================
// Renderiza a ficha inteira dentro do card de Lojas Locadas
// =====================================================================
async function renderFicha() {
  if (!_contratoAtivo) return;
  const card = document.querySelector('#ocupadas .card');
  if (!card) return;

  // Salva o HTML original do card (lista de lojas) na primeira abertura
  // pra poder restaurar quando clicar em "← Voltar à lista"
  if (_htmlOriginalCard === null) {
    _htmlOriginalCard = card.innerHTML;
  }

  // Loading
  card.innerHTML = '<div style="padding:60px;text-align:center;color:var(--ink-soft)">⏳ Carregando ficha da loja...</div>';

  try {
    const [contrato, anexos, gestoes, historico, lojasStatus, reajustes, siengeParcelas, saldoSienge] = await Promise.all([
      getContrato(_contratoAtivo),
      getAnexosContrato(_contratoAtivo).catch(() => []),
      getGestoesPorContrato(_contratoAtivo).catch(() => []),
      getHistoricoContrato(_contratoAtivo).catch(() => []),
      getLojasStatus().catch(() => []),
      getReajustes(_contratoAtivo).catch(() => []),
      getSiengeParcelas(_contratoAtivo).catch(() => []),
      getSaldoSiengePorContrato(_contratoAtivo).catch(() => null)
    ]);

    if (!contrato) {
      card.innerHTML = '<div style="padding:40px;text-align:center;color:#991b1b">Contrato não encontrado.</div>';
      return;
    }

    card.innerHTML = '';
    card.appendChild(montarFicha(contrato, { anexos, gestoes, historico, lojasStatus, reajustes, siengeParcelas, saldoSienge }));
  } catch (err) {
    console.error('Erro ao montar ficha:', err);
    card.innerHTML = '<div style="padding:40px;color:#991b1b">Erro: ' + escapeHtml(err.message) + '</div>';
  }
}

function montarFicha(contrato, dados) {
  const wrapper = el('div', { className: 'ficha-loja' });

  // Botão voltar
  const btnVoltar = el('button', {
    type: 'button',
    className: 'btn ghost sm',
    style: 'margin-bottom:12px;font-size:12px'
  }, '← Voltar à lista');
  btnVoltar.onclick = async () => {
    fecharFichaLoja();
    await renderTudo();
  };
  wrapper.appendChild(btnVoltar);

  // ============== HEADER COM RESUMO VISUAL ==============
  wrapper.appendChild(montarHeader(contrato, dados));

  // ============== TABS ==============
  const tabBar = el('div', { className: 'ficha-tabs' });
  const totalAnexos = (dados.anexos || []).length;
  const qtdSienge = (dados.siengeParcelas || []).length;
  const qtdReaj = (dados.reajustes || []).length;
  const tabs = [
    { id: 'resumo',    label: '📊 Resumo' },
    { id: 'dados',     label: '📝 Dados do contrato' },
    { id: 'reajustes', label: '📜 Reajustes' + (qtdReaj ? ' (' + qtdReaj + ')' : '') },
    { id: 'anexos',    label: '📄 Anexos (' + totalAnexos + ')' },
    { id: 'sienge',    label: '💰 Financeiro' + (qtdSienge ? ' (' + qtdSienge + ')' : '') },
    { id: 'gestoes',   label: '🤖 Gestões (' + dados.gestoes.filter(g => g.ativo).length + ')' },
    { id: 'historico', label: '🕐 Histórico (' + dados.historico.length + ')' }
  ];

  const conteudo = el('div', { className: 'ficha-conteudo' });

  tabs.forEach(t => {
    const btn = el('button', {
      type: 'button',
      className: 'ficha-tab' + (_abaAtiva === t.id ? ' active' : ''),
      'data-tab': t.id
    }, t.label);
    btn.onclick = () => {
      _abaAtiva = t.id;
      tabBar.querySelectorAll('.ficha-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t.id));
      renderConteudoAba(conteudo, t.id, contrato, dados);
    };
    tabBar.appendChild(btn);
  });
  wrapper.appendChild(tabBar);
  wrapper.appendChild(conteudo);

  renderConteudoAba(conteudo, _abaAtiva, contrato, dados);

  return wrapper;
}

function montarHeader(c, dados) {
  const header = el('div', { className: 'ficha-header' });
  const lojas = (c.lojas || []).join(', ');
  const nome = c.nome_fantasia || c.razao_social || '(sem nome)';
  const termino = c.data_termino || fmtBR(addMonths(parseBR(c.data_inicio), c.prazo_meses));
  const diasTermino = diasAte(termino);
  const corTermino = corUrgencia(diasTermino);

  // Próxima gestão (mais urgente)
  const proximaGestao = (dados.gestoes || [])
    .filter(g => g.ativo && g.data_evento)
    .sort((a,b) => new Date(a.data_evento) - new Date(b.data_evento))[0];
  const diasProxGestao = proximaGestao ? diasAte(new Date(proximaGestao.data_evento).toLocaleDateString('pt-BR')) : null;
  const corProx = corUrgencia(diasProxGestao);

  // Status badge
  const statusBadge = c.parcial
    ? '<span class="badge parcial">Parcialmente locada</span>'
    : '<span class="badge ocupada">Locada</span>';

  header.innerHTML = `
    <div class="ficha-header-top">
      <div>
        <div class="ficha-header-titulo">Loja ${escapeHtml(lojas)}</div>
        <div class="ficha-header-sub">${escapeHtml(nome)}</div>
        <div class="ficha-header-meta">${escapeHtml(c.razao_social || '')} · CNPJ ${escapeHtml(c.documento || '—')}</div>
      </div>
      <div>${statusBadge}</div>
    </div>
    <div class="ficha-kpis">
      <div class="ficha-kpi" style="background:#E6F1FB">
        <div class="ficha-kpi-label" style="color:#185FA5">Cobrança deste mês</div>
        ${(() => {
          const saldo = dados.saldoSienge;
          if (!saldo || !saldo.tem_sienge) {
            return `<div class="ficha-kpi-valor" style="color:var(--ink-soft);font-size:14px">Sem dados SIENGE</div>
              <div class="ficha-kpi-extra" style="color:#185FA5">Importe o PDF na aba Financeiro</div>`;
          }
          const valorMes = Number(saldo.valor_mes_atual || 0);
          if (valorMes > 0) {
            return `<div class="ficha-kpi-valor" style="color:#0C447C">${formatMoney(valorMes)}</div>
              <div class="ficha-kpi-extra" style="color:#185FA5">Aluguel + Cond + IPTU · vence dia ${String(c.dia_vencimento).padStart(2,'0')}</div>`;
          }
          // Tem SIENGE mas valor=0 → em carência ou sem parcela no mês
          const prox = saldo.proxima_parcela;
          const proxTxt = prox && prox.valor && prox.data
            ? `próx ${new Date(prox.data + 'T00:00:00').toLocaleDateString('pt-BR')} · ${formatMoney(prox.valor)}`
            : 'sem próxima parcela cadastrada';
          return `<div class="ficha-kpi-valor" style="color:#0C447C">R$ 0,00</div>
            <div class="ficha-kpi-extra" style="color:#185FA5">Sem cobrança este mês · ${proxTxt}</div>`;
        })()}
      </div>
      <div class="ficha-kpi" style="background:#FAEEDA">
        <div class="ficha-kpi-label" style="color:#854F0B">Aluguel contratual</div>
        <div class="ficha-kpi-valor" style="color:#633806">${formatMoney(c.valor_base || c.valor_aluguel)}</div>
        <div class="ficha-kpi-extra" style="color:#854F0B">${
          c.valor_base && Number(c.valor_base) !== Number(c.valor_aluguel)
            ? 'base · vigente R$ ' + Number(c.valor_aluguel).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : 'base · sem reajustes'
        }</div>
      </div>
      <div class="ficha-kpi">
        <div class="ficha-kpi-label">Vigência</div>
        <div class="ficha-kpi-valor">${escapeHtml(c.data_inicio || '—')}</div>
        <div class="ficha-kpi-extra">→ ${escapeHtml(termino)}</div>
      </div>
      <div class="ficha-kpi" style="background:${corTermino.bg}">
        <div class="ficha-kpi-label">Dias até término</div>
        <div class="ficha-kpi-valor" style="color:${corTermino.txt}">${diasTermino == null ? '—' : (diasTermino < 0 ? 'Vencido' : diasTermino + ' dias')}</div>
        <div class="ficha-kpi-extra">prazo ${c.prazo_meses}m</div>
      </div>
      <div class="ficha-kpi" style="background:${corProx.bg}">
        <div class="ficha-kpi-label">Próxima gestão</div>
        <div class="ficha-kpi-valor" style="color:${corProx.txt};font-size:14px">${proximaGestao ? escapeHtml(proximaGestao.titulo) : '—'}</div>
        <div class="ficha-kpi-extra">${proximaGestao ? new Date(proximaGestao.data_evento).toLocaleDateString('pt-BR') + (diasProxGestao != null ? ' (' + (diasProxGestao < 0 ? 'atrasado ' + Math.abs(diasProxGestao) + 'd' : 'em ' + diasProxGestao + 'd') + ')' : '') : 'nenhuma agendada'}</div>
      </div>
    </div>
  `;
  return header;
}

function renderConteudoAba(container, aba, contrato, dados) {
  container.innerHTML = '';

  if (aba === 'resumo') {
    container.appendChild(renderResumo(contrato, dados));
  } else if (aba === 'dados') {
    container.appendChild(renderAbaDados(contrato));
  } else if (aba === 'reajustes') {
    container.appendChild(montarBlocoReajustes(contrato, dados.reajustes || []));
  } else if (aba === 'anexos') {
    container.appendChild(renderListaAnexos(dados.anexos, contrato.id));
  } else if (aba === 'sienge') {
    container.appendChild(renderAbaSienge(contrato, dados.siengeParcelas || [], dados.saldoSienge));
  } else if (aba === 'gestoes') {
    container.appendChild(renderListaGestoes(dados.gestoes, contrato.id));
  } else if (aba === 'historico') {
    container.appendChild(renderListaHistorico(dados.historico));
  }
}

// =====================================================================
// ABA: RESUMO
// =====================================================================
function renderResumo(c, dados) {
  const div = el('div', { className: 'ficha-resumo' });
  const termino = c.data_termino || fmtBR(addMonths(parseBR(c.data_inicio), c.prazo_meses));
  const gestoesAtrasadas = (dados.gestoes || []).filter(g => {
    if (!g.ativo || !g.data_evento) return false;
    const d = diasAte(new Date(g.data_evento).toLocaleDateString('pt-BR'));
    return d != null && d < 0;
  }).length;

  // Bloco 1: condições do contrato (PAPEL — só dados contratuais imutáveis)
  // Cobrança real e reajustes lançados ficam em abas próprias (Financeiro + Reajustes)
  const bloco1 = el('div', { className: 'resumo-bloco' });
  bloco1.innerHTML = `
    <h3>📋 Condições contratuais <span style="font-size:11px;color:#94a3b8;font-weight:400">(do papel)</span></h3>
    <div class="resumo-grid">
      <div><strong>Aluguel base:</strong> ${formatMoney(c.valor_base || c.valor_aluguel)}/mês</div>
      <div><strong>Dia vencimento:</strong> ${String(c.dia_vencimento).padStart(2,'0')}</div>
      <div><strong>Carência:</strong> ${c.meses_carencia || 0} meses</div>
      <div><strong>Prazo:</strong> ${c.prazo_meses} meses (${(c.prazo_meses/12).toFixed(1)} anos)</div>
      <div><strong>Início:</strong> ${escapeHtml(c.data_inicio || '—')}</div>
      <div><strong>Término:</strong> ${escapeHtml(termino)}</div>
      <div><strong>Índice de reajuste:</strong> ${escapeHtml(c.indice_reajuste || '—')}</div>
      <div><strong>Garantia:</strong> ${LABELS_GARANTIA[c.tipo_garantia] || c.tipo_garantia || '—'}</div>
    </div>
    ${c.detalhes_garantia ? '<div class="resumo-obs"><strong>Detalhes da garantia:</strong><br>' + escapeHtml(c.detalhes_garantia) + '</div>' : ''}
    ${c.observacoes ? '<div class="resumo-obs"><strong>Observações:</strong><br>' + escapeHtml(c.observacoes) + '</div>' : ''}
    <div style="margin-top:10px;padding:8px 10px;background:#f0f9ff;border-left:3px solid #0369a1;border-radius:4px;font-size:11px;color:#0c4a6e">
      💡 <strong>Cobranças reais</strong> (do mês) na aba <strong>💰 Financeiro</strong>. <strong>Reajustes lançados</strong> na aba <strong>📜 Reajustes</strong>.
    </div>
  `;
  div.appendChild(bloco1);

  // Bloco extra: características das lojas (exaustão + depósito)
  const lojasCodigos = c.lojas || [];
  const lojasInfo = (dados.lojasStatus || []).filter(l => lojasCodigos.includes(l.codigo));
  if (lojasInfo.length > 0) {
    const blocoLojas = el('div', { className: 'resumo-bloco' });
    const itens = lojasInfo.map(l => {
      const badgeEx = l.tem_exaustao
        ? '<span class="badge" style="background:#dcfce7;color:#15803d">Sim</span>'
        : '<span class="badge" style="background:#f1f5f9;color:#64748b">Não</span>';
      const dep = (l.area_deposito != null && Number(l.area_deposito) > 0)
        ? `<span style="color:#15803d;font-weight:600">${Number(l.area_deposito).toFixed(2).replace('.',',')} m²</span>`
        : '<span style="color:#94a3b8">sem depósito</span>';
      return `<div><strong>Loja ${escapeHtml(l.codigo)}:</strong> Exaustão ${badgeEx} · Depósito ${dep}</div>`;
    }).join('');
    blocoLojas.innerHTML = `
      <h3>🏪 Características das lojas</h3>
      <div class="resumo-grid">${itens}</div>
    `;
    div.appendChild(blocoLojas);
  }

  // Bloco 2: situação atual
  const bloco2 = el('div', { className: 'resumo-bloco' });
  bloco2.innerHTML = `
    <h3>🎯 Situação atual</h3>
    <div class="resumo-stats">
      <div class="resumo-stat ${gestoesAtrasadas > 0 ? 'alerta' : ''}">
        <div class="resumo-stat-num">${gestoesAtrasadas}</div>
        <div class="resumo-stat-label">gestão(ões) atrasada(s)</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-num">${(dados.anexos || []).length}</div>
        <div class="resumo-stat-label">anexo(s) cadastrado(s)</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-num">${(dados.anexos || []).filter(a => a.data_validade).length}</div>
        <div class="resumo-stat-label">com data de validade</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-num">${dados.historico.length}</div>
        <div class="resumo-stat-label">alteração(ões) registrada(s)</div>
      </div>
    </div>
  `;
  div.appendChild(bloco2);

  // Histórico de reajustes — movido pra aba própria "📜 Reajustes"

  // Bloco 3: Cláusulas-chave do contrato (lidas pela IA)
  div.appendChild(montarBlocoClausulas(c));

  return div;
}

// =====================================================================
// Bloco: Histórico de reajustes (aba Resumo)
// =====================================================================
function montarBlocoReajustes(c, reajustes) {
  const bloco = el('div', { className: 'resumo-bloco' });
  const valorBase = c.valor_base != null ? Number(c.valor_base) : Number(c.valor_aluguel);
  const vigente = Number(c.valor_aluguel);
  const reajustesOrd = [...(reajustes || [])].sort((a, b) =>
    new Date(a.data_efetivacao) - new Date(b.data_efetivacao)
  );

  const linhasReaj = reajustesOrd.map(r => {
    const variacao = (r.variacao_pct != null)
      ? (Number(r.variacao_pct) > 0 ? '+' : '') + Number(r.variacao_pct).toFixed(2) + '%'
      : '—';
    const tipo = r.indice ? escapeHtml(r.indice) : '<span style="color:#94a3b8">—</span>';
    const obs = r.observacoes ? '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">' + escapeHtml(r.observacoes) + '</div>' : '';
    return `
      <tr>
        <td>${fmtBR(r.data_efetivacao) || '?'}</td>
        <td>${tipo}</td>
        <td style="color:var(--ink-soft)">${formatMoney(r.valor_anterior)}</td>
        <td style="font-weight:600;color:#15803d">${formatMoney(r.valor_novo)}</td>
        <td style="font-weight:600">${variacao}</td>
        <td>${obs}</td>
      </tr>
    `;
  }).join('');

  bloco.innerHTML = `
    <h3 style="display:flex;justify-content:space-between;align-items:center">
      <span>💰 Histórico de reajustes</span>
      <button type="button" class="btn sm" data-novo-reaj style="font-size:11px">+ Lançar reajuste</button>
    </h3>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:12px">
      <div><strong>Valor base do contrato:</strong> ${formatMoney(valorBase)}</div>
      <div><strong>Valor vigente:</strong> <span style="color:#15803d;font-weight:700">${formatMoney(vigente)}</span></div>
      <div><strong>Reajustes lançados:</strong> ${reajustesOrd.length}</div>
    </div>
    ${reajustesOrd.length === 0
      ? '<div style="padding:14px;background:#f8fafc;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--ink-soft);font-size:12px">Nenhum reajuste lançado. O valor vigente é igual ao valor base do contrato.</div>'
      : '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:6px 8px">Vigência</th><th style="padding:6px 8px">Tipo</th><th style="padding:6px 8px">Anterior</th><th style="padding:6px 8px">Novo</th><th style="padding:6px 8px">Variação</th><th style="padding:6px 8px">Obs</th></tr></thead><tbody>' + linhasReaj + '</tbody></table>'
    }
  `;
  bloco.querySelector('[data-novo-reaj]').onclick = () => abrirFormReajuste(c, vigente);
  return bloco;
}

// Modal: Lançar reajuste
function abrirFormReajuste(contrato, valorVigenteAtual) {
  const body = el('div');
  body.innerHTML = `
    <div style="padding:10px;background:#eff6ff;border-left:3px solid #2563eb;border-radius:4px;margin-bottom:14px;font-size:12px;color:#1e40af">
      <strong>Valor vigente atual:</strong> ${formatMoney(valorVigenteAtual)}.
      O valor novo abaixo passa a vigorar a partir da data informada. As cobranças já criadas no passado não são alteradas.
    </div>
    <div class="form-grid">
      <div class="form-field"><label>Data de efetivação *</label>
        <input type="date" name="data_efetivacao" value="${new Date().toISOString().slice(0,10)}" required>
      </div>
      <div class="form-field"><label>Valor novo (R$) *</label>
        <input type="number" name="valor_novo" step="0.01" min="0" required placeholder="0,00">
      </div>
      <div class="form-field"><label>Tipo / Índice (opcional)</label>
        <select name="indice">
          <option value="">— (não especificado)</option>
          <option value="IGP-M">IGP-M</option>
          <option value="IPCA">IPCA</option>
          <option value="INPC">INPC</option>
          <option value="Negociação">Negociação</option>
          <option value="Outro">Outro</option>
        </select>
      </div>
      <div class="form-field"><label>Variação % (calculada)</label>
        <input type="text" name="variacao_calc" readonly placeholder="preencha o valor novo" style="background:#f8fafc">
      </div>
      <div class="form-field full"><label>Observações (opcional)</label>
        <textarea name="observacoes" rows="2" placeholder="Ex: renegociado com cliente em troca de prazo maior"></textarea>
      </div>
    </div>
  `;

  // Calcula % automaticamente conforme digita
  const inpNovo = body.querySelector('[name="valor_novo"]');
  const inpCalc = body.querySelector('[name="variacao_calc"]');
  const recalcular = () => {
    const v = Number(inpNovo.value);
    if (!v || valorVigenteAtual <= 0) { inpCalc.value = ''; return; }
    const pct = ((v - valorVigenteAtual) / valorVigenteAtual) * 100;
    inpCalc.value = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
  };
  inpNovo.addEventListener('input', recalcular);

  abrirModal({
    titulo: '💰 Lançar reajuste',
    body,
    submitLabel: 'Salvar reajuste',
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      const valorNovo = Number(fd.get('valor_novo'));
      const dataEf = fd.get('data_efetivacao');
      if (!valorNovo || valorNovo <= 0) throw new Error('Informe o valor novo.');
      if (!dataEf) throw new Error('Informe a data de efetivação.');
      const variacaoPct = valorVigenteAtual > 0
        ? ((valorNovo - valorVigenteAtual) / valorVigenteAtual) * 100
        : null;
      await aplicarReajuste({
        contrato_id: contrato.id,
        valor_anterior: valorVigenteAtual,
        valor_novo: valorNovo,
        indice: fd.get('indice') || null,
        variacao_pct: variacaoPct,
        data_efetivacao: dataEf,
        periodo_inicio: null,
        periodo_fim: null,
        observacoes: fd.get('observacoes') || null
      });
      mostrarToast('Reajuste lançado. Valor vigente atualizado para ' + formatMoney(valorNovo), 'success');
      await renderTudo();
      // Recarrega a ficha pra refletir o novo valor
      const { abrirFichaLoja } = await import('./ficha-loja.js');
      abrirFichaLoja(contrato.id);
    }
  });
}

// =====================================================================
// ABA: DADOS — campos editáveis direto (sem modal)
// =====================================================================
function renderAbaDados(c) {
  const wrapper = el('div');

  // Loading placeholder enquanto carrega inquilinos/lojas
  wrapper.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft);font-size:13px">⏳ Carregando formulário...</div>';

  // Carrega inquilinos + lojas em paralelo, depois monta o form
  (async () => {
    try {
      const [inquilinos, lojasStatus] = await Promise.all([getInquilinos(), getLojasStatus()]);
      wrapper.innerHTML = '';
      wrapper.appendChild(montarFormDados(c, inquilinos, lojasStatus));
    } catch (err) {
      wrapper.innerHTML = '<div style="padding:20px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:13px">⚠️ Erro ao carregar form: ' + err.message + '</div>';
    }
  })();

  return wrapper;
}

function montarFormDados(c, inquilinos, lojasStatus) {
  const form = el('form', { className: 'ficha-form-dados' });
  form.setAttribute('novalidate', 'true');

  // ============== SEÇÃO 1: INQUILINO ==============
  const sec1 = el('div', { className: 'ficha-bloco' });
  sec1.innerHTML = '<h3>👤 Inquilino</h3>';
  const inqOptions = [
    { value: '', label: '- Selecione -' },
    ...inquilinos.map(i => ({ value: i.id, label: (i.nome_fantasia ? i.nome_fantasia + ' - ' : '') + i.razao_social + ' (' + i.documento + ')' }))
  ];
  const grid1 = el('div', { className: 'form-grid' });
  grid1.appendChild(campo({ name: 'inquilino_id', label: 'Inquilino', type: 'select', options: inqOptions, value: c.inquilino_id || '', required: true, full: true }));
  sec1.appendChild(grid1);
  form.appendChild(sec1);

  // ============== SEÇÃO 2: LOJAS ==============
  const sec2 = el('div', { className: 'ficha-bloco' });
  sec2.innerHTML = '<h3>🏪 Lojas</h3>';
  const areaIndicador = el('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '6px' } });
  const picker = lojasPicker({
    lojasStatus,
    selecionadas: c.lojas || [],
    permitirOcupadas: true,
    onChange: (lojasSel, areaTotal) => {
      areaIndicador.innerHTML = areaTotal > 0
        ? '<strong style="color:var(--ink)">' + areaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' m²</strong> calculado a partir das lojas selecionadas'
        : '';
    }
  });
  sec2.appendChild(picker.el);
  sec2.appendChild(areaIndicador);
  setTimeout(() => {
    const a = picker.getAreaTotal ? picker.getAreaTotal() : 0;
    if (a > 0) areaIndicador.innerHTML = '<strong style="color:var(--ink)">' + a.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' m²</strong> calculado a partir das lojas selecionadas';
  }, 50);
  form.appendChild(sec2);

  // ============== SEÇÃO 3: PREÇO, PRAZO E DATAS ==============
  const sec3 = el('div', { className: 'ficha-bloco' });
  sec3.innerHTML = '<h3>💰 Preço, prazo e datas</h3>';
  const grid3 = el('div', { className: 'form-grid cols-3' });
  grid3.appendChild(campo({ name: 'valor_aluguel', label: 'Valor mensal (R$)', type: 'number', value: c.valor_aluguel, required: true }));
  grid3.appendChild(campo({ name: 'dia_vencimento', label: 'Dia vencimento', type: 'number', value: c.dia_vencimento || 1, required: true }));
  grid3.appendChild(campo({ name: 'meses_carencia', label: 'Carência (meses)', type: 'number', value: c.meses_carencia ?? 3 }));
  grid3.appendChild(campo({ name: 'data_assinatura', label: 'Data de assinatura', type: 'date', value: toIsoDate(c.data_assinatura), required: true }));
  grid3.appendChild(campo({ name: 'data_inicio', label: 'Início da vigência', type: 'date', value: toIsoDate(c.data_inicio), required: true }));
  grid3.appendChild(campo({ name: 'prazo_meses', label: 'Prazo (meses)', type: 'number', value: c.prazo_meses || 60, required: true }));
  sec3.appendChild(grid3);
  form.appendChild(sec3);

  // ============== SEÇÃO 4: REAJUSTE E GARANTIA ==============
  const sec4 = el('div', { className: 'ficha-bloco' });
  sec4.innerHTML = '<h3>📊 Reajuste e garantia</h3>';
  const grid4 = el('div', { className: 'form-grid' });
  grid4.appendChild(campo({
    name: 'indice_reajuste', label: 'Índice de reajuste', type: 'select',
    options: [
      { value: 'IGP-M', label: 'IGP-M/FGV' },
      { value: 'IPCA', label: 'IPCA' },
      { value: 'INPC', label: 'INPC' },
      { value: 'outro', label: 'Outro' }
    ],
    value: c.indice_reajuste || 'IGP-M'
  }));
  grid4.appendChild(campo({
    name: 'tipo_garantia', label: 'Tipo de garantia', type: 'select',
    options: [
      { value: 'fianca_pj', label: 'Fiança PJ' },
      { value: 'fianca_pessoal', label: 'Fiança Pessoal' },
      { value: 'seguro_fianca', label: 'Seguro Fiança' },
      { value: 'titulo_capitalizacao', label: 'Título de Capitalização' },
      { value: 'sem_garantia', label: 'Sem garantia' }
    ],
    value: c.tipo_garantia || 'fianca_pessoal',
    required: true
  }));
  grid4.appendChild(campo({ name: 'detalhes_garantia', label: 'Detalhes da garantia', type: 'textarea', value: c.detalhes_garantia, full: true }));
  sec4.appendChild(grid4);
  form.appendChild(sec4);

  // ============== SEÇÃO 5: ESPECIAIS ==============
  const sec5 = el('div', { className: 'ficha-bloco' });
  sec5.innerHTML = '<h3>📝 Observações e regras especiais</h3>';
  const grid5 = el('div', { className: 'form-grid' });
  const parcialCampo = el('div', { className: 'form-field full' });
  parcialCampo.innerHTML = '<label><input type="checkbox" name="parcial" ' + (c.parcial ? 'checked' : '') + '> Loja parcial / com vagas</label>';
  grid5.appendChild(parcialCampo);
  grid5.appendChild(campo({ name: 'observacoes', label: 'Observações', type: 'textarea', value: c.observacoes, full: true, rows: 4 }));
  sec5.appendChild(grid5);
  form.appendChild(sec5);

  // ============== BARRA DE AÇÃO (Salvar / Cancelar) ==============
  const barraAcao = el('div', { className: 'ficha-form-acoes' });
  const btnCancelar = el('button', { type: 'button', className: 'btn ghost' }, 'Descartar alterações');
  const btnSalvar = el('button', { type: 'button', className: 'btn' }, '💾 Salvar alterações');
  btnSalvar.style.cssText = 'background:var(--accent);color:#fff';
  barraAcao.appendChild(btnCancelar);
  barraAcao.appendChild(btnSalvar);
  form.appendChild(barraAcao);

  btnCancelar.onclick = () => renderFicha(); // recarrega tudo (descarta mudanças)

  btnSalvar.onclick = async () => {
    btnSalvar.disabled = true;
    const labelOriginal = btnSalvar.textContent;
    btnSalvar.textContent = '⏳ Salvando...';
    try {
      const fd = new FormData(form);
      const input = {
        id: c.id,
        inquilino_id: fd.get('inquilino_id'),
        valor_aluguel: Number(fd.get('valor_aluguel')),
        dia_vencimento: Number(fd.get('dia_vencimento')),
        meses_carencia: Number(fd.get('meses_carencia')),
        data_assinatura: fd.get('data_assinatura'),
        data_inicio: fd.get('data_inicio'),
        prazo_meses: Number(fd.get('prazo_meses')),
        indice_reajuste: fd.get('indice_reajuste'),
        tipo_garantia: fd.get('tipo_garantia'),
        detalhes_garantia: fd.get('detalhes_garantia'),
        parcial: !!fd.get('parcial'),
        observacoes: fd.get('observacoes'),
        lojas: picker.getSelected()
      };
      // Validações básicas
      if (!input.inquilino_id) throw new Error('Selecione um inquilino');
      if (input.lojas.length === 0) throw new Error('Selecione pelo menos uma loja');
      if (!input.valor_aluguel || input.valor_aluguel <= 0) throw new Error('Informe o valor do aluguel');
      if (!input.data_assinatura) throw new Error('Informe a data de assinatura');
      if (!input.data_inicio) throw new Error('Informe a data de início da vigência');
      if (!input.prazo_meses || input.prazo_meses <= 0) throw new Error('Informe o prazo do contrato');

      await saveContrato(input);
      mostrarToast('Alterações salvas com sucesso', 'success');
      // Recarrega a ficha pra refletir os novos dados (header + abas)
      renderFicha();
    } catch (err) {
      mostrarToast('Erro: ' + err.message, 'error');
      btnSalvar.disabled = false;
      btnSalvar.textContent = labelOriginal;
    }
  };

  return form;
}

// =====================================================================
// ABA: DOCUMENTOS / GESTÕES / ARQUIVOS / HISTÓRICO (restantes)
// =====================================================================

// Mapa de categorias unificadas (cobre tanto arquivos quanto documentos)
// Labels alinhados com TIPOS_DOCUMENTO da data-layer (tabela documentos unificada)
const LABEL_CATEGORIA = {
  contrato: 'Contrato (PDF original)',
  aditivo: 'Aditivo contratual',
  seguro_fianca: 'Seguro fiança',
  seguro_incendio: 'Seguro incêndio',
  certidao_negativa_federal: 'Certidão negativa federal',
  certidao_negativa_municipal: 'Certidão negativa municipal',
  certidao_negativa_estadual: 'Certidão negativa estadual',
  certidao_trabalhista: 'Certidão trabalhista',
  vistoria_inicial: 'Vistoria inicial',
  vistoria_final: 'Vistoria final',
  laudo_avcb: 'Laudo AVCB',
  alvara_funcionamento: 'Alvará de funcionamento',
  outros: 'Outros',
  // Legados (mantém pra retro-compat com itens já cadastrados)
  contrato_assinado: 'Contrato (PDF original)',
  termo: 'Termo', laudo: 'Laudo',
  fianca: 'Documento de garantia',
  documentos_pessoais: 'Documentos pessoais',
  comprovante: 'Comprovante', planta: 'Planta', outro: 'Outros',
  apolice_seguro: 'Apólice de seguro', avcb: 'Laudo AVCB',
  alvara: 'Alvará de funcionamento', certidao: 'Certidão', habite_se: 'Habite-se'
};

const ICONE_CATEGORIA = {
  contrato: '📜', aditivo: '📝',
  seguro_fianca: '🛡️', seguro_incendio: '🔥',
  certidao_negativa_federal: '📃', certidao_negativa_municipal: '📃',
  certidao_negativa_estadual: '📃', certidao_trabalhista: '📃',
  vistoria_inicial: '🔍', vistoria_final: '🔍',
  laudo_avcb: '🚒', alvara_funcionamento: '🏛️', outros: '📄',
  // Legados
  contrato_assinado: '📜', termo: '📋', laudo: '🧾',
  fianca: '🛡️', documentos_pessoais: '🪪', comprovante: '💵',
  planta: '🗺️', outro: '📄',
  apolice_seguro: '🔥', avcb: '🚒', alvara: '🏛️', certidao: '📃', habite_se: '🏠'
};

function renderListaAnexos(anexos, contratoId) {
  const div = el('div', { className: 'ficha-bloco' });
  const totalComValidade = (anexos || []).filter(a => a.data_validade).length;
  div.innerHTML =
    '<h3>📄 Anexos do contrato</h3>' +
    '<p style="color:var(--ink-soft);font-size:12px;margin-bottom:10px">' +
      'Contratos, aditivos, apólices, certidões e outros documentos. Anexe um PDF — a IA detecta o tipo e a data de validade automaticamente. ' +
      'Itens com <strong>data de validade</strong> geram alertas automáticos.' +
      (totalComValidade > 0 ? ' <em>· ' + totalComValidade + ' com validade cadastrada</em>' : '') +
    '</p>';

  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' });
  const renderLista = (anexosAtuais) => {
    lista.innerHTML = '';
    if (!anexosAtuais || anexosAtuais.length === 0) {
      lista.innerHTML = '<div class="ficha-vazio">Nenhum anexo ainda. Clique em "+ Anexar PDF" abaixo.</div>';
      return;
    }
    anexosAtuais.forEach(a => {
      const dias = a.data_validade ? diasAte(a.data_validade) : null;
      const cor = corUrgencia(dias);
      const icone = ICONE_CATEGORIA[a.categoria] || '📄';
      const labelCat = LABEL_CATEGORIA[a.categoria] || a.categoria;
      const item = el('div', { className: 'ficha-item' });
      const subBits = [];
      if (a.numero) subBits.push('Nº ' + a.numero);
      if (a.descricao && a.descricao !== a.nome_original) subBits.push(a.descricao);
      if (a.nome_original) subBits.push(a.nome_original);
      if (a.tamanho_bytes) subBits.push((a.tamanho_bytes / 1024).toFixed(1) + ' KB');
      const sub = subBits.join(' · ');
      item.innerHTML = `
        <div style="font-size:22px;width:32px;text-align:center">${icone}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--ink);font-size:13px">${escapeHtml(labelCat)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(sub) || '<em style="opacity:.6">—</em>'}</div>
        </div>
        <div style="text-align:right;min-width:160px">
          ${a.data_validade
            ? '<div style="font-size:11px;color:var(--ink)">Vence ' + new Date(a.data_validade).toLocaleDateString('pt-BR') + '</div>' +
              '<div style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:' + cor.bg + ';color:' + cor.txt + ';margin-top:3px">' +
              (dias == null ? '—' : (dias < 0 ? 'Vencido ' + Math.abs(dias) + 'd' : 'Em ' + dias + 'd')) + '</div>'
            : '<div style="font-size:10px;color:#94a3b8;font-style:italic">sem validade</div>'}
          <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px;flex-wrap:wrap">
            ${a.storage_path ? '<button type="button" class="btn outline sm" data-ver style="font-size:10px;padding:3px 8px">👁 Ver</button>' : ''}
            <button type="button" class="btn outline sm" data-edit style="font-size:10px;padding:3px 8px">✏️ Editar</button>
            <button type="button" class="btn outline sm" data-del style="font-size:10px;padding:3px 8px;color:#dc2626">🗑️</button>
          </div>
        </div>
      `;
      const btnVer = item.querySelector('[data-ver]');
      if (btnVer) {
        btnVer.onclick = async () => {
          try {
            const url = await getArquivoUrl(a.storage_path);
            if (url) window.open(url, '_blank');
            else mostrarToast('Arquivo não encontrado', 'error');
          } catch (err) { mostrarToast('Erro: ' + err.message, 'error'); }
        };
      }
      item.querySelector('[data-edit]').onclick = () => abrirFormAnexoInline(a, contratoId, recarregar);
      item.querySelector('[data-del]').onclick = async () => {
        const ok = await confirmarAcao({
          titulo: 'Excluir anexo',
          mensagem: 'Excluir "' + (labelCat) + '"? Esta ação não pode ser desfeita.',
          confirmLabel: 'Excluir', perigo: true
        });
        if (!ok) return;
        try {
          await deleteDocumento(a.id);
          mostrarToast('Anexo excluído', 'success');
          await recarregar();
        } catch (err) { mostrarToast('Erro ao excluir: ' + err.message, 'error'); }
      };
      lista.appendChild(item);
    });
  };
  renderLista(anexos);
  div.appendChild(lista);

  // Botão + form inline pra anexar novo
  const btnAdd = el('button', { type: 'button', className: 'btn', style: 'margin-top:14px' }, '+ Anexar PDF');
  const formContainer = el('div', { style: 'display:none;margin-top:12px' });
  div.appendChild(btnAdd);
  div.appendChild(formContainer);

  const recarregar = async () => {
    const novos = await getAnexosContrato(contratoId).catch(() => []);
    renderLista(novos);
  };

  btnAdd.onclick = () => {
    btnAdd.style.display = 'none';
    formContainer.style.display = 'block';
    formContainer.innerHTML = '';
    formContainer.appendChild(montarFormAnexoNovo(contratoId, async () => {
      formContainer.innerHTML = '';
      formContainer.style.display = 'none';
      btnAdd.style.display = 'inline-block';
      await recarregar();
    }));
  };

  return div;
}

// Mini-form pra anexar PDF novo (com IA preenchendo os campos)
function montarFormAnexoNovo(contratoId, onFim) {
  const box = el('div', { style: 'background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:14px' });
  box._fileParaUpload = null;
  box.innerHTML = `
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:12px;font-weight:600;color:var(--ink);margin-bottom:6px">Arquivo PDF *</label>
      <input type="file" data-file accept="application/pdf" style="font-size:12px">
      <div data-iastatus style="display:none;margin-top:8px;padding:8px 10px;border-radius:6px;font-size:11px"></div>
    </div>
  `;
  const camposBox = el('div', { 'data-campos': '' });
  box.appendChild(camposBox);

  const renderCamposForm = (preenchimento = {}) => {
    const tipoOptions = Object.entries(TIPOS_DOCUMENTO).map(([v, l]) => `<option value="${v}" ${preenchimento.tipo === v ? 'selected' : ''}>${l}</option>`).join('');
    camposBox.innerHTML = `
      <div class="form-grid">
        <div class="form-field"><label>Tipo *</label>
          <select data-campo="tipo" required>${tipoOptions}</select>
        </div>
        <div class="form-field"><label>Número / apólice</label>
          <input type="text" data-campo="numero" value="${preenchimento.numero || ''}">
        </div>
        <div class="form-field full"><label>Descrição</label>
          <input type="text" data-campo="descricao" value="${preenchimento.descricao || ''}">
        </div>
        <div class="form-field"><label>Data de emissão</label>
          <input type="date" data-campo="data_emissao" value="${preenchimento.data_emissao || ''}">
        </div>
        <div class="form-field"><label>Data de validade <small style="color:#94a3b8">(opcional — preenche pra gerar alerta)</small></label>
          <input type="date" data-campo="data_validade" value="${preenchimento.data_validade || ''}">
        </div>
        <div class="form-field full"><label>Observações</label>
          <textarea data-campo="observacoes" rows="2">${preenchimento.observacoes || ''}</textarea>
        </div>
      </div>
    `;
  };
  renderCamposForm();

  const acoes = el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px' });
  acoes.innerHTML = `
    <button type="button" class="btn ghost sm" data-cancel>Cancelar</button>
    <button type="button" class="btn sm" data-salvar>Salvar anexo</button>
  `;
  box.appendChild(acoes);

  const inputFile = box.querySelector('[data-file]');
  const iaStatus = box.querySelector('[data-iastatus]');
  inputFile.addEventListener('change', async () => {
    const f = inputFile.files?.[0];
    if (!f) return;
    box._fileParaUpload = f;
    iaStatus.style.display = 'block';
    iaStatus.style.background = '#eff6ff';
    iaStatus.style.color = '#1e40af';
    iaStatus.style.border = '1px solid #bfdbfe';
    iaStatus.innerHTML = '🤖 Claude está lendo o PDF e detectando tipo/validade...';
    try {
      const ext = await extrairDocumentoDoPDF(f);
      renderCamposForm({
        tipo: ext.tipo && TIPOS_DOCUMENTO[ext.tipo] ? ext.tipo : 'outros',
        numero: ext.numero,
        descricao: ext.descricao,
        data_emissao: ext.data_emissao,
        data_validade: ext.data_validade
      });
      const c = ext.confianca ?? '?';
      iaStatus.style.background = '#ecfdf5';
      iaStatus.style.color = '#065f46';
      iaStatus.style.border = '1px solid #6ee7b7';
      iaStatus.innerHTML = '✓ IA preencheu os campos (confiança ' + c + '/100). Revise antes de salvar.';
    } catch (err) {
      iaStatus.style.background = '#fef2f2';
      iaStatus.style.color = '#991b1b';
      iaStatus.style.border = '1px solid #fecaca';
      iaStatus.innerHTML = '⚠️ IA falhou: ' + err.message + '. Preencha manualmente.';
    }
  });

  box.querySelector('[data-cancel]').onclick = () => onFim();
  box.querySelector('[data-salvar]').onclick = async () => {
    const btn = box.querySelector('[data-salvar]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      if (!box._fileParaUpload) throw new Error('Escolha um PDF antes de salvar.');
      const get = (name) => box.querySelector(`[data-campo="${name}"]`)?.value || '';
      // 1) Faz upload do PDF pro storage PRIMEIRO (evita registro órfão se upload falhar)
      const { storage_path } = await uploadPdfStorage(box._fileParaUpload, {
        entidade_tipo: 'contrato',
        entidade_id: contratoId
      });
      // 2) Grava o registro JÁ com arquivo_url
