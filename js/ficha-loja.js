// =====================================================================
// FICHA DA LOJA — gestão completa de um contrato/loja num lugar só
// Substitui o conteúdo da aba "Lojas Locadas" quando uma linha é clicada.
// =====================================================================
import { el, fmtBR, parseBR, addMonths, mesesEntre, formatMoney, LABELS_GARANTIA } from './utils.js';
import {
  getContrato, getArquivos, getDocumentosByContrato, TIPOS_DOCUMENTO,
  getGestoesPorContrato, atualizarGestaoAtivo, getHistoricoContrato
} from './data-layer.js';
import { abrirFormContrato } from './forms-contrato.js';
import { getArquivoUrl } from './upload.js';
import { mostrarToast, renderTudo } from './render.js';

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

export function abrirFichaLoja(contratoId) {
  _contratoAtivo = contratoId;
  _abaAtiva = 'resumo';
  renderFicha();
}

export function fecharFichaLoja() {
  _contratoAtivo = null;
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

  // Loading
  card.innerHTML = '<div style="padding:60px;text-align:center;color:var(--ink-soft)">⏳ Carregando ficha da loja...</div>';

  try {
    const [contrato, arquivos, documentos, gestoes, historico] = await Promise.all([
      getContrato(_contratoAtivo),
      getArquivos('contrato', _contratoAtivo).catch(() => []),
      getDocumentosByContrato(_contratoAtivo).catch(() => []),
      getGestoesPorContrato(_contratoAtivo).catch(() => []),
      getHistoricoContrato(_contratoAtivo).catch(() => [])
    ]);

    if (!contrato) {
      card.innerHTML = '<div style="padding:40px;text-align:center;color:#991b1b">Contrato não encontrado.</div>';
      return;
    }

    card.innerHTML = '';
    card.appendChild(montarFicha(contrato, { arquivos, documentos, gestoes, historico }));
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
  const tabs = [
    { id: 'resumo',     label: '📊 Resumo' },
    { id: 'dados',      label: '📝 Dados do contrato' },
    { id: 'documentos', label: '📄 Documentos (' + dados.documentos.length + ')' },
    { id: 'gestoes',    label: '🤖 Gestões (' + dados.gestoes.filter(g => g.ativo).length + ')' },
    { id: 'arquivos',   label: '📎 Arquivos (' + dados.arquivos.length + ')' },
    { id: 'historico',  label: '🕐 Histórico (' + dados.historico.length + ')' }
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
      <div class="ficha-kpi">
        <div class="ficha-kpi-label">Aluguel mensal</div>
        <div class="ficha-kpi-valor">${formatMoney(c.valor_aluguel)}</div>
        <div class="ficha-kpi-extra">vence dia ${String(c.dia_vencimento).padStart(2,'0')}</div>
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
  } else if (aba === 'documentos') {
    container.appendChild(renderListaDocumentos(dados.documentos, contrato.id));
  } else if (aba === 'gestoes') {
    container.appendChild(renderListaGestoes(dados.gestoes, contrato.id));
  } else if (aba === 'arquivos') {
    container.appendChild(renderListaArquivos(dados.arquivos, contrato.id));
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

  // Bloco 1: condições principais
  const bloco1 = el('div', { className: 'resumo-bloco' });
  bloco1.innerHTML = `
    <h3>📋 Condições do contrato</h3>
    <div class="resumo-grid">
      <div><strong>Aluguel:</strong> ${formatMoney(c.valor_aluguel)}/mês</div>
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
  `;
  div.appendChild(bloco1);

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
        <div class="resumo-stat-num">${dados.documentos.length}</div>
        <div class="resumo-stat-label">documento(s) cadastrado(s)</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-num">${dados.arquivos.length}</div>
        <div class="resumo-stat-label">arquivo(s) anexado(s)</div>
      </div>
      <div class="resumo-stat">
        <div class="resumo-stat-num">${dados.historico.length}</div>
        <div class="resumo-stat-label">alteração(ões) registrada(s)</div>
      </div>
    </div>
  `;
  div.appendChild(bloco2);

  return div;
}

// =====================================================================
// ABA: DADOS (botão pra editar via modal existente)
// =====================================================================
function renderAbaDados(c) {
  const div = el('div', { className: 'ficha-bloco' });
  div.innerHTML = `
    <h3>Dados estruturados do contrato</h3>
    <p style="color:var(--ink-soft);font-size:13px;margin-bottom:14px">
      Use o botão abaixo para editar todos os campos do contrato no formulário detalhado (mesmo formulário usado para criar novos contratos).
    </p>
  `;
  const btn = el('button', { type: 'button', className: 'btn' }, '✏️ Editar dados do contrato');
  btn.style.cssText = 'background:var(--accent);color:#fff';
  btn.onclick = async () => {
    abrirFormContrato(c.id);
    // Quando fechar o modal, recarrega ficha
    setTimeout(() => renderFicha(), 500);
  };
  div.appendChild(btn);
  return div;
}

// =====================================================================
// ABA: DOCUMENTOS (apólices, certidões, AVCB)
// =====================================================================
function renderListaDocumentos(documentos, contratoId) {
  const div = el('div', { className: 'ficha-bloco' });
  div.innerHTML = '<h3>📄 Documentos cadastrados</h3>';

  if (!documentos || documentos.length === 0) {
    div.innerHTML += '<div class="ficha-vazio">Nenhum documento cadastrado. Adicione apólice de seguro, AVCB, certidões e outros documentos pelo formulário de edição do contrato.</div>';
  } else {
    const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' });
    documentos.forEach(d => {
      const dias = diasAte(d.data_validade);
      const cor = corUrgencia(dias);
      const item = el('div', { className: 'ficha-item' });
      item.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:600;color:var(--ink);font-size:13px">${escapeHtml(TIPOS_DOCUMENTO[d.tipo] || d.tipo)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px">${escapeHtml(d.descricao || (d.numero ? 'Nº ' + d.numero : '—'))}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--ink)">Vence ${d.data_validade ? new Date(d.data_validade).toLocaleDateString('pt-BR') : '—'}</div>
          <div style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${cor.bg};color:${cor.txt};margin-top:3px">${dias == null ? '—' : (dias < 0 ? 'Vencido ' + Math.abs(dias) + 'd' : 'Em ' + dias + 'd')}</div>
        </div>
      `;
      lista.appendChild(item);
    });
    div.appendChild(lista);
  }
  const btn = el('button', { type: 'button', className: 'btn ghost sm', style: 'margin-top:14px' }, '+ Gerenciar documentos');
  btn.onclick = () => abrirFormContrato(contratoId);
  div.appendChild(btn);
  return div;
}

// =====================================================================
// ABA: GESTÕES (lista compacta com toggle)
// =====================================================================
function renderListaGestoes(gestoes, contratoId) {
  const div = el('div', { className: 'ficha-bloco' });
  div.innerHTML = '<h3>🤖 Gestões automáticas (geradas por IA)</h3>';

  if (!gestoes || gestoes.length === 0) {
    div.innerHTML += '<div class="ficha-vazio">Nenhuma gestão cadastrada para este contrato. O kit padrão pode ser gerado via SQL.</div>';
    return div;
  }

  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' });
  gestoes.forEach(g => {
    const dias = g.data_evento ? diasAte(new Date(g.data_evento).toLocaleDateString('pt-BR')) : null;
    const cor = corUrgencia(dias);
    const icone = ICONES_TIPO_GESTAO[g.tipo] || '📌';
    const item = el('div', { className: 'ficha-item' + (g.ativo ? '' : ' inativa') });
    item.innerHTML = `
      <div style="font-size:22px;width:32px;text-align:center">${icone}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--ink);font-size:13px">${escapeHtml(g.titulo)}</div>
        <div style="font-size:11px;color:var(--ink-soft);margin-top:3px">${escapeHtml(g.descricao || '')}</div>
        ${g.clausula_origem ? '<div style="font-size:10px;color:#94a3b8;margin-top:3px;font-style:italic">📑 ' + escapeHtml(g.clausula_origem) + '</div>' : ''}
      </div>
      <div style="text-align:right;min-width:110px">
        <div style="font-weight:700;color:var(--ink);font-size:12px">${g.data_evento ? new Date(g.data_evento).toLocaleDateString('pt-BR') : 'sem data'}</div>
        ${dias != null ? '<div style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:' + cor.bg + ';color:' + cor.txt + ';margin-top:3px">' + (dias < 0 ? 'Atrasado ' + Math.abs(dias) + 'd' : 'Em ' + dias + 'd') + '</div>' : ''}
        <label style="display:block;margin-top:6px;font-size:10px;color:var(--ink-soft);cursor:pointer">
          <input type="checkbox" data-toggle ${g.ativo ? 'checked' : ''}> ativa
        </label>
      </div>
    `;
    const cb = item.querySelector('[data-toggle]');
    cb.onchange = async (ev) => {
      try {
        await atualizarGestaoAtivo(g.id, ev.target.checked);
        item.classList.toggle('inativa', !ev.target.checked);
        g.ativo = ev.target.checked;
        mostrarToast(ev.target.checked ? 'Gestão reativada' : 'Gestão desativada', 'success');
      } catch (err) {
        ev.target.checked = !ev.target.checked;
        mostrarToast('Erro: ' + err.message, 'error');
      }
    };
    lista.appendChild(item);
  });
  div.appendChild(lista);
  return div;
}

// =====================================================================
// ABA: ARQUIVOS (PDFs anexados)
// =====================================================================
function renderListaArquivos(arquivos, contratoId) {
  const div = el('div', { className: 'ficha-bloco' });
  div.innerHTML = '<h3>📎 Arquivos anexados</h3>';

  if (!arquivos || arquivos.length === 0) {
    div.innerHTML += '<div class="ficha-vazio">Nenhum arquivo anexado. Adicione PDFs (contrato assinado, aditivos, laudos) pelo formulário de edição.</div>';
  } else {
    const lista = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:10px' });
    const LABELS_CAT = { contrato_assinado:'Contrato', aditivo:'Aditivos', termo:'Termos', laudo:'Laudos', fianca:'Garantia', documentos_pessoais:'Documentos pessoais', comprovante:'Comprovante', planta:'Planta', outro:'Outros' };
    arquivos.forEach(a => {
      const tam = a.tamanho_bytes ? (a.tamanho_bytes / 1024).toFixed(1) + ' KB' : '';
      const item = el('div', { className: 'ficha-item' });
      item.innerHTML = `
        <div style="font-size:22px">📄</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--ink);font-size:13px">${escapeHtml(LABELS_CAT[a.categoria] || a.categoria || 'Arquivo')}</div>
          <div style="font-size:11px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.nome_original || '')} ${tam ? '· ' + tam : ''}</div>
        </div>
        <button type="button" class="btn outline sm" data-ver style="font-size:11px">👁 Ver</button>
      `;
      item.querySelector('[data-ver]').onclick = async () => {
        try {
          const url = await getArquivoUrl(a.storage_path);
          if (url) window.open(url, '_blank');
          else mostrarToast('Arquivo não encontrado', 'error');
        } catch (err) {
          mostrarToast('Erro: ' + err.message, 'error');
        }
      };
      lista.appendChild(item);
    });
    div.appendChild(lista);
  }
  const btn = el('button', { type: 'button', className: 'btn ghost sm', style: 'margin-top:14px' }, '+ Gerenciar arquivos');
  btn.onclick = () => abrirFormContrato(contratoId);
  div.appendChild(btn);
  return div;
}

// =====================================================================
// ABA: HISTÓRICO de alterações
// =====================================================================
function renderListaHistorico(historico) {
  const div = el('div', { className: 'ficha-bloco' });
  div.innerHTML = '<h3>🕐 Histórico de alterações</h3>';

  if (!historico || historico.length === 0) {
    div.innerHTML += '<div class="ficha-vazio">Nenhuma alteração registrada ainda. O histórico passa a registrar mudanças a partir de agora (cadastro do audit log).</div>';
    return div;
  }

  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:10px' });
  historico.forEach(h => {
    const data = new Date(h.alterado_em).toLocaleString('pt-BR');
    const item = el('div', { className: 'ficha-historico-item' });
    let descricao = '';
    if (h.acao === 'INSERT') {
      descricao = '<strong>Contrato criado</strong>';
    } else if (h.acao === 'ENCERRADO') {
      descricao = '<strong style="color:#dc2626">Contrato encerrado</strong>';
    } else if (h.campos_alterados) {
      const campos = Object.entries(h.campos_alterados).map(([k, v]) =>
        '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">• ' +
        '<strong>' + escapeHtml(LABEL_CAMPO[k] || k) + ':</strong> ' +
        escapeHtml(String(v.antes ?? '—')) + ' → ' + escapeHtml(String(v.depois ?? '—')) +
        '</div>'
      ).join('');
      descricao = '<strong>Alteração</strong>' + campos;
    } else {
      descricao = '<strong>' + escapeHtml(h.acao) + '</strong>';
    }

    item.innerHTML = `
      <div style="font-size:11px;color:var(--ink-soft);min-width:130px">${data}</div>
      <div style="flex:1">${descricao}</div>
    `;
    lista.appendChild(item);
  });
  div.appendChild(lista);
  return div;
}
