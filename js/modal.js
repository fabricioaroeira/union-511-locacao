// =====================================================================
// Modal utilitário — base para todos os formulários
// =====================================================================
import { el } from './utils.js';

let activeModal = null;

export function abrirModal({ titulo, body, onSubmit, submitLabel = 'Salvar', maxWidth }) {
  fecharModal();

  const backdrop = el('div', { className: 'modal-backdrop' });
  const modal = el('div', { className: 'modal' });
  if (maxWidth) modal.style.maxWidth = maxWidth;

  modal.innerHTML = `
    <div class="modal-head">
      <div class="modal-title">${titulo}</div>
      <button class="modal-close" type="button">×</button>
    </div>
    <form class="modal-form">
      <div class="modal-body"></div>
      <div class="modal-foot">
        <div></div>
        <div class="right">
          <button type="button" class="btn ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn">${submitLabel}</button>
        </div>
      </div>
    </form>
  `;
  modal.querySelector('.modal-body').appendChild(body);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  activeModal = backdrop;

  modal.querySelector('.modal-close').addEventListener('click', fecharModal);
  modal.querySelector('[data-cancel]').addEventListener('click', fecharModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) fecharModal(); });

  modal.querySelector('.modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      await onSubmit();
      fecharModal();
    } catch (err) {
      console.error('Erro no modal onSubmit:', err);
      let errBox = modal.querySelector('.modal-error');
      if (!errBox) {
        errBox = document.createElement('div');
        errBox.className = 'modal-error';
        errBox.style.cssText = 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:10px 12px;border-radius:6px;margin:0 0 12px;font-size:13px';
        const body = modal.querySelector('.modal-body');
        body.parentNode.insertBefore(errBox, body);
      }
      errBox.textContent = '⚠️ Erro: ' + (err.message || err);
      btn.disabled = false;
      btn.textContent = submitLabel;
    }
  });

  const escHandler = e => { if (e.key === 'Escape') fecharModal(); };
  document.addEventListener('keydown', escHandler);
  backdrop._escHandler = escHandler;
}

export function fecharModal() {
  if (activeModal) {
    document.removeEventListener('keydown', activeModal._escHandler);
    activeModal.remove();
    activeModal = null;
  }
}

// ---------------------------------------------------------------------
// Helper para criar campo de formulário
// ---------------------------------------------------------------------
export function campo({ name, label, type = 'text', value = '', required = false, hint, options, full, placeholder, rows = 3 }) {
  const div = el('div', { className: 'form-field' + (full ? ' full' : '') });
  const lbl = el('label', {}, label + (required ? ' *' : ''));
  div.appendChild(lbl);

  let input;
  if (type === 'textarea') {
    input = el('textarea', { name, rows: String(rows), placeholder: placeholder || '' });
    input.value = value || '';
  } else if (type === 'select') {
    input = el('select', { name });
    options.forEach(opt => {
      const o = el('option', { value: opt.value }, opt.label);
      if (String(opt.value) === String(value)) o.selected = true;
      input.appendChild(o);
    });
  } else {
    input = el('input', { type, name, value: value ?? '', placeholder: placeholder || '' });
  }
  if (required) input.required = true;
  div.appendChild(input);

  if (hint) {
    const h = el('div', { className: 'hint' }, hint);
    div.appendChild(h);
  }
  return div;
}

// ---------------------------------------------------------------------
// Picker de lojas (grid de chips) com instrução e botão Limpar
// ---------------------------------------------------------------------
export function lojasPicker({ lojasStatus, selecionadas = [], permitirOcupadas = false, onChange = null }) {
  const wrapper = el('div');
  const contador = el('div', {
    style: { fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }
  });
  const instrucao = el('span', {}, '💡 Clique numa loja para selecionar. Clique de novo para remover.');
  const btnLimpar = el('button', {
    type: 'button',
    style: { fontSize: '11px', padding: '3px 10px', border: '1px solid var(--border)', background: 'white', borderRadius: '4px', cursor: 'pointer', color: 'var(--ink-soft)' }
  }, '✕ Limpar seleção');
  contador.appendChild(instrucao);
  contador.appendChild(btnLimpar);
  wrapper.appendChild(contador);

  const picker = el('div', { className: 'lojas-picker' });
  wrapper.appendChild(picker);

  const sel = new Set(selecionadas);

  function atualizarContagem() {
    const n = sel.size;
    instrucao.innerHTML = n === 0
      ? '💡 Clique numa loja para selecionar. Clique de novo para remover.'
      : '<strong>' + n + ' loja' + (n > 1 ? 's' : '') + ' selecionada' + (n > 1 ? 's' : '') + '</strong> — clique pra remover, ou em outra pra adicionar.';
  }

  lojasStatus.forEach(l => {
    const chip = el('div', { className: 'chip', textContent: l.codigo });
    chip.dataset.codigo = l.codigo;
    if (sel.has(l.codigo)) chip.classList.add('selected');

    let bloqueado = false;
    if (l.status === 'uso_interno') {
      chip.classList.add('interna');
      bloqueado = true;
    } else if (l.status === 'ocupada' && !permitirOcupadas) {
      chip.classList.add('ocupada');
      bloqueado = true;
    } else if (['proposta_aceita','proposta_analise'].includes(l.status)) {
      chip.classList.add('proposta');
    }

    if (!bloqueado) {
      chip.title = l.area_privativa ? 'Clique para selecionar / remover · ' + l.area_privativa + ' m²' : 'Clique para selecionar / remover';
      chip.addEventListener('click', () => {
        if (sel.has(l.codigo)) { sel.delete(l.codigo); chip.classList.remove('selected'); }
        else { sel.add(l.codigo); chip.classList.add('selected'); }
        atualizarContagem();
        if (onChange) onChange(getSelectedArr(), getAreaTotal());
      });
    }
    picker.appendChild(chip);
  });

  function getSelectedArr() { return Array.from(sel).sort((a,b) => Number(a) - Number(b)); }
  function getAreaTotal() {
    let total = 0;
    sel.forEach(cod => {
      const loja = lojasStatus.find(l => l.codigo === cod);
      if (loja && loja.area_privativa) total += Number(loja.area_privativa);
    });
    return Math.round(total * 100) / 100;
  }

  btnLimpar.addEventListener('click', () => {
    sel.clear();
    picker.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
    atualizarContagem();
    if (onChange) onChange(getSelectedArr(), getAreaTotal());
  });

  atualizarContagem();

  return {
    el: wrapper,
    getSelected: getSelectedArr,
    getAreaTotal: getAreaTotal,
    setSelected: (codigos) => {
      sel.clear();
      picker.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
      codigos.forEach(cod => {
        const codStr = String(cod);
        sel.add(codStr);
        const chip = picker.querySelector('.chip[data-codigo="' + codStr + '"]');
        if (chip && !chip.classList.contains('interna')) chip.classList.add('selected');
      });
      atualizarContagem();
      if (onChange) onChange(getSelectedArr(), getAreaTotal());
    }
  };
}
