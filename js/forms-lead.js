// =====================================================================
// Formulário de criar/editar Lead (CRM)
// =====================================================================
import { getLead, saveLead, getLojasStatus, adicionarInteracao, deleteLead, vincularLeadAProposta } from './data-layer.js';
import { abrirModal, campo, lojasPicker, fecharModal } from './modal.js';
import { el } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';
import { abrirFormProposta } from './forms-proposta.js';

const LABELS_STATUS_LEAD = {
  interessado: 'Interessado',
  visitou: 'Visitou',
  em_analise: 'Em análise',
  virou_proposta: 'Virou proposta',
  desistiu: 'Desistiu'
};

const LABELS_TIPO_INTER = {
  nota: '📝 Nota',
  visita: '🏢 Visita',
  ligacao: '📞 Ligação',
  email: '✉️ Email',
  reuniao: '🤝 Reunião',
  mudanca_status: '🔄 Mudança de status'
};

export async function abrirFormLead(id = null) {
  let dados = {};
  if (id) {
    dados = await getLead(id);
    if (!dados) { mostrarToast('Lead não encontrado', 'error'); return; }
  }

  const lojasStatus = await getLojasStatus();
  const body = el('div');

  // ====================
  // Seção 1: Cliente
  // ====================
  const sec1 = el('div', { className: 'form-section' });
  sec1.appendChild(el('div', { className: 'form-section-title' }, 'Cliente'));
  const grid1 = el('div', { className: 'form-grid' });
  grid1.appendChild(campo({ name: 'cliente_nome', label: 'Nome do cliente', value: dados.cliente_nome || '', required: true }));
  grid1.appendChild(campo({ name: 'empresa', label: 'Empresa / razão social', value: dados.empresa || '' }));
  grid1.appendChild(campo({ name: 'ramo_atividade', label: 'Ramo de atividade', value: dados.ramo_atividade || '', placeholder: 'Ex: Cafeteria, Pet shop, Estúdio fitness' }));
  grid1.appendChild(campo({ name: 'corretor', label: 'Corretor / origem', value: dados.corretor || '', placeholder: 'Ex: Biensky Imóveis' }));
  sec1.appendChild(grid1);
  body.appendChild(sec1);

  // ====================
  // Seção 2: Lojas de interesse
  // ====================
  const sec2 = el('div', { className: 'form-section' });
  sec2.appendChild(el('div', { className: 'form-section-title' }, 'Lojas de interesse'));
  const picker = lojasPicker({ lojasStatus, selecionadas: dados.lojas || [], permitirOcupadas: true });
  sec2.appendChild(picker.el);
  body.appendChild(sec2);

  // ====================
  // Seção 3: Status e datas
  // ====================
  const sec3 = el('div', { className: 'form-section' });
  sec3.appendChild(el('div', { className: 'form-section-title' }, 'Status do processo'));
  const grid3 = el('div', { className: 'form-grid' });
  const statusOptions = Object.entries(LABELS_STATUS_LEAD).map(([v, l]) => ({ value: v, label: l }));
  grid3.appendChild(campo({ name: 'status', label: 'Status atual', type: 'select', options: statusOptions, value: dados.status || 'interessado' }));
  grid3.appendChild(campo({ name: 'data_inicio', label: 'Data de início do estudo', type: 'date', value: dados.data_inicio || new Date().toISOString().slice(0,10) }));
  sec3.appendChild(grid3);

  const grid3b = el('div', { className: 'form-grid' });
  grid3b.appendChild(campo({ name: 'motivo_desistencia', label: 'Motivo de desistência (se aplicável)', value: dados.motivo_desistencia || '', placeholder: 'Preencha apenas se status = Desistiu', full: true }));
  grid3b.appendChild(campo({ name: 'observacoes', label: 'Observações gerais', type: 'textarea', value: dados.observacoes || '', full: true }));
  sec3.appendChild(grid3b);
  body.appendChild(sec3);

  // ====================
  // Seção 4: Timeline de interações (só ao editar)
  // ====================
  if (id) {
    const sec4 = el('div', { className: 'form-section' });
    sec4.appendChild(el('div', { className: 'form-section-title' }, 'Histórico de interações'));
    const timelineBox = el('div', { id: 'lead-timeline-box' });
    renderTimelineHTML(timelineBox, dados.interacoes || []);
    sec4.appendChild(timelineBox);

    // Form pra adicionar nova interação
    const novaInterBox = el('div', { style: 'margin-top:14px;padding:12px;background:#f8fafc;border:1px solid var(--line);border-radius:8px' });
    novaInterBox.innerHTML = `
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--ink-soft);font-weight:600;margin-bottom:8px">Adicionar nova interação</div>
      <div style="display:grid;grid-template-columns:130px 1fr auto;gap:8px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--ink-soft);display:block;margin-bottom:4px">Tipo</label>
          <select id="nova-inter-tipo" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;font-size:13px">
            ${Object.entries(LABELS_TIPO_INTER).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-soft);display:block;margin-bottom:4px">Descrição</label>
          <input id="nova-inter-conteudo" type="text" placeholder="O que aconteceu?" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;font-size:13px">
        </div>
        <button type="button" id="btn-nova-inter" class="btn">+ Adicionar</button>
      </div>
    `;
    sec4.appendChild(novaInterBox);
    body.appendChild(sec4);

    // Listener pro botão de adicionar interação
    setTimeout(() => {
      const btn = document.getElementById('btn-nova-inter');
      btn?.addEventListener('click', async () => {
        const tipo = document.getElementById('nova-inter-tipo').value;
        const conteudo = document.getElementById('nova-inter-conteudo').value.trim();
        if (!conteudo) { mostrarToast('Digite o conteúdo', 'error'); return; }
        btn.disabled = true;
        try {
          await adicionarInteracao(id, { tipo, conteudo });
          document.getElementById('nova-inter-conteudo').value = '';
          // Recarrega timeline
          const lead = await getLead(id);
          renderTimelineHTML(timelineBox, lead.interacoes || []);
          mostrarToast('Interação adicionada');
        } catch (err) {
          mostrarToast('Erro: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }, 100);
  }

  // ====================
  // Ações extras (excluir, converter em proposta)
  // ====================
  if (id) {
    const acoesBox = el('div', { style: 'margin-top:16px;padding-top:14px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap' });

    if (dados.status !== 'virou_proposta' && dados.status !== 'desistiu') {
      const btnConverter = el('button', { type: 'button', className: 'btn' }, '✓ Converter em proposta');
      btnConverter.addEventListener('click', async () => {
        fecharModal();
        // Abre o form de proposta pré-preenchido
        abrirFormProposta(null, {
          fromLead: id,
          preenchimento: {
            cliente_nome: dados.cliente_nome,
            ramo: dados.ramo_atividade,
            corretor: dados.corretor,
            lojas: dados.lojas || [],
            observacoes: 'Convertido do Lead iniciado em ' + (dados.data_inicio || '?') + '. ' + (dados.observacoes || '')
          }
        });
      });
      acoesBox.appendChild(btnConverter);
    }

    const btnExcluir = el('button', { type: 'button', className: 'btn outline', style: 'color:var(--red);border-color:var(--red)' }, '🗑 Excluir lead');
    btnExcluir.addEventListener('click', async () => {
      if (!confirm('Excluir este lead permanentemente? Toda a timeline também será apagada.')) return;
      try {
        await deleteLead(id);
        fecharModal();
        mostrarToast('Lead excluído');
        await renderTudo();
      } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
      }
    });
    acoesBox.appendChild(btnExcluir);

    body.appendChild(acoesBox);
  }

  abrirModal({
    titulo: id ? 'Editar lead' : 'Novo lead',
    body,
    submitLabel: id ? 'Salvar alterações' : 'Criar lead',
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      const statusNovo = fd.get('status');
      const input = {
        id,
        cliente_nome: fd.get('cliente_nome'),
        empresa: fd.get('empresa'),
        ramo_atividade: fd.get('ramo_atividade'),
        corretor: fd.get('corretor'),
        status: statusNovo,
        data_inicio: fd.get('data_inicio'),
        motivo_desistencia: fd.get('motivo_desistencia'),
        observacoes: fd.get('observacoes'),
        lojas: picker.getSelected()
      };
      if (!input.cliente_nome) throw new Error('Informe o nome do cliente');
      if (statusNovo === 'desistiu') {
        input.data_fim = new Date().toISOString().slice(0,10);
      }

      const lead = await saveLead(input);

      // Se mudou status, registra na timeline
      if (id && dados.status !== statusNovo) {
        await adicionarInteracao(lead.id, {
          tipo: 'mudanca_status',
          conteudo: `Status mudou de "${LABELS_STATUS_LEAD[dados.status] || dados.status}" para "${LABELS_STATUS_LEAD[statusNovo]}"`
            + (statusNovo === 'desistiu' && input.motivo_desistencia ? ` — motivo: ${input.motivo_desistencia}` : '')
        });
      }

      mostrarToast(id ? 'Lead atualizado' : 'Lead criado');
      await renderTudo();
    }
  });
}

function renderTimelineHTML(container, interacoes) {
  if (!interacoes || interacoes.length === 0) {
    container.innerHTML = '<div style="padding:14px;text-align:center;color:var(--ink-soft);font-size:13px">Nenhuma interação registrada ainda</div>';
    return;
  }
  container.innerHTML = interacoes.map(i => {
    const dataFmt = new Date(i.data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    return `
      <div style="padding:10px 12px;border-left:3px solid var(--accent);background:#f8fafc;margin-bottom:6px;border-radius:0 6px 6px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;font-weight:600;color:var(--accent)">${LABELS_TIPO_INTER[i.tipo] || i.tipo}</span>
          <span style="font-size:11px;color:var(--ink-soft)">${dataFmt}</span>
        </div>
        <div style="font-size:13px;color:var(--ink);line-height:1.4">${escapeHtml(i.conteudo)}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
