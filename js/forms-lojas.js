// =====================================================================
// Formulário de edição em massa das áreas das lojas
// =====================================================================
import { getLojasStatus } from './data-layer.js';
import { getSupabase } from './supabase-client.js';
import { abrirModal } from './modal.js';
import { el } from './utils.js';
import { renderTudo, mostrarToast } from './render.js';

export async function abrirFormAreasLojas() {
  const lojas = await getLojasStatus();
  const body = el('div');

  body.appendChild(el('div', {
    style: { padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', marginBottom: '14px', fontSize: '12px', color: '#1e40af' }
  }, '💡 Informe área, área do depósito (se houver) e marque se possui sistema de exaustão. Depósito vazio = loja não tem depósito. Lojas em uso interno (02, 03, 49, 52) ficam bloqueadas.'));

  // Cabeçalho
  const header = el('div', {
    style: { display: 'grid', gridTemplateColumns: '55px 1fr 1fr 1fr 80px 110px', gap: '8px', padding: '8px 10px', background: '#f1f5f9', borderRadius: '6px', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }
  });
  header.innerHTML = '<div>Loja</div><div>Área privativa (m²)</div><div>Área total (m²)</div><div>Depósito (m²)</div><div style="text-align:center">Exaust.</div><div>Status</div>';
  body.appendChild(header);

  // Lista scrollável
  const lista = el('div', { style: { maxHeight: '450px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px' } });
  const inputs = {};
  lojas.forEach(l => {
    const linha = el('div', {
      style: { display: 'grid', gridTemplateColumns: '55px 1fr 1fr 1fr 80px 110px', gap: '8px', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }
    });
    const codigoLabel = el('div', { style: { fontWeight: '600', fontSize: '14px' } }, l.codigo);

    const inpPriv = el('input', {
      type: 'number',
      step: '0.01',
      placeholder: '0,00',
      value: l.area_privativa ?? '',
      style: { width: '100%', padding: '5px 8px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '4px' }
    });
    const inpTotal = el('input', {
      type: 'number',
      step: '0.01',
      placeholder: '0,00',
      value: l.area_total ?? '',
      style: { width: '100%', padding: '5px 8px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '4px' }
    });
    const inpDeposito = el('input', {
      type: 'number',
      step: '0.01',
      placeholder: '(vazio)',
      value: l.area_deposito ?? '',
      style: { width: '100%', padding: '5px 8px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '4px' }
    });
    const inpExaust = el('input', {
      type: 'checkbox',
      style: { width: '18px', height: '18px', cursor: 'pointer' }
    });
    inpExaust.checked = !!l.tem_exaustao;
    if (l.uso_interno) {
      inpPriv.disabled = true; inpTotal.disabled = true; inpDeposito.disabled = true; inpExaust.disabled = true;
      inpPriv.style.opacity = '0.4'; inpTotal.style.opacity = '0.4'; inpDeposito.style.opacity = '0.4'; inpExaust.style.opacity = '0.4';
    }
    inputs[l.codigo] = { priv: inpPriv, total: inpTotal, deposito: inpDeposito, exaust: inpExaust };

    let statusBadge = '';
    if (l.uso_interno) statusBadge = '<span style="color:#475569;font-size:11px">Bloqueada</span>';
    else if (l.status === 'ocupada') statusBadge = '<span style="color:#16a34a;font-size:11px">Locada</span>';
    else if (l.status === 'proposta_analise') statusBadge = '<span style="color:#d97706;font-size:11px">Proposta em análise</span>';
    else if (l.status === 'proposta_aceita') statusBadge = '<span style="color:#2563eb;font-size:11px">Proposta aceita</span>';
    else statusBadge = '<span style="color:#94a3b8;font-size:11px">Disponível</span>';

    linha.appendChild(codigoLabel);
    linha.appendChild(inpPriv);
    linha.appendChild(inpTotal);
    linha.appendChild(inpDeposito);
    const exaustWrap = el('div', { style: { textAlign: 'center' } });
    exaustWrap.appendChild(inpExaust);
    linha.appendChild(exaustWrap);
    const statusDiv = el('div'); statusDiv.innerHTML = statusBadge;
    linha.appendChild(statusDiv);

    lista.appendChild(linha);
  });
  body.appendChild(lista);

  // Resumo no rodapé
  const total = lojas.length;
  const comArea = lojas.filter(l => l.area_privativa).length;
  body.appendChild(el('div', {
    style: { marginTop: '12px', fontSize: '12px', color: 'var(--ink-soft)', textAlign: 'right' }
  }, `${comArea} de ${total} lojas com área cadastrada`));

  abrirModal({
    titulo: 'Editar áreas das lojas',
    body,
    submitLabel: 'Salvar áreas',
    maxWidth: '720px',
    onSubmit: async () => {
      const supa = await getSupabase();
      const updates = [];
      Object.entries(inputs).forEach(([codigo, { priv, total, deposito, exaust }]) => {
        if (priv.disabled) return; // pula uso interno
        const newPriv = priv.value ? Number(priv.value) : null;
        const newTotal = total.value ? Number(total.value) : null;
        const newDeposito = deposito.value ? Number(deposito.value) : null;
        const newExaust = !!exaust.checked;
        const original = lojas.find(l => l.codigo === codigo);
        const mudou = (newPriv ?? null) !== (original?.area_privativa ?? null) ||
                      (newTotal ?? null) !== (original?.area_total ?? null) ||
                      (newDeposito ?? null) !== (original?.area_deposito ?? null) ||
                      newExaust !== !!(original?.tem_exaustao);
        if (mudou) {
          updates.push({ codigo, area_privativa: newPriv, area_total: newTotal, area_deposito: newDeposito, tem_exaustao: newExaust });
        }
      });
      if (updates.length === 0) {
        mostrarToast('Nenhuma alteração para salvar', 'info');
        return;
      }
      let salvas = 0;
      for (const u of updates) {
        const { error } = await supa.from('lojas')
          .update({ area_privativa: u.area_privativa, area_total: u.area_total, area_deposito: u.area_deposito, tem_exaustao: u.tem_exaustao })
          .eq('codigo', u.codigo);
        if (error) {
          throw new Error(`Erro na loja ${u.codigo}: ${error.message}`);
        }
        salvas++;
      }
      mostrarToast(`${salvas} loja${salvas > 1 ? 's' : ''} atualizada${salvas > 1 ? 's' : ''}`, 'success');
      await renderTudo();
    }
  });
}
