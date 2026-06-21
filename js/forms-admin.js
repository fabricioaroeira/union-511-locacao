// =====================================================================
// Modal de administração de usuários (apenas papel = 'admin')
// =====================================================================
import { abrirModal, fecharModal, confirmarAcao } from './modal.js';
import { el } from './utils.js';
import { mostrarToast } from './render.js';
import {
  getUsuarios, atualizarPapelUsuario, atualizarAtivoUsuario, getMeuPapel,
  criarUsuario, alterarSenhaUsuario, alterarNomeUsuario, excluirUsuario
} from './data-layer.js';

const LABELS_ROLE = {
  admin:        { txt: 'Admin',        cor: '#7c3aed', bg: '#f3e8ff' },
  gestor:       { txt: 'Gestor',       cor: '#1e40af', bg: '#dbeafe' },
  corretor:     { txt: 'Corretor',     cor: '#15803d', bg: '#dcfce7' },
  visualizador: { txt: 'Visualizador', cor: '#64748b', bg: '#f1f5f9' }
};

export async function abrirAdminUsuarios() {
  const papel = await getMeuPapel();
  if (papel !== 'admin') {
    mostrarToast('Apenas administradores podem acessar', 'error');
    return;
  }

  const body = el('div');
  body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-soft)">⏳ Carregando usuários...</div>';

  abrirModal({
    titulo: '👥 Administração de Usuários',
    body,
    submitLabel: 'Fechar',
    maxWidth: '780px',
    onSubmit: async () => {}
  });

  await renderListaUsuarios(body);
}

async function renderListaUsuarios(body) {
  try {
    const usuarios = await getUsuarios();
    body.innerHTML = '';

    const topo = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px' });
    topo.innerHTML =
      '<div style="font-size:13px;color:var(--ink-soft)">' +
      usuarios.length + ' usuário' + (usuarios.length !== 1 ? 's' : '') + ' cadastrado' + (usuarios.length !== 1 ? 's' : '') +
      '</div>';
    const btnNovo = el('button', { type: 'button', className: 'btn', style: 'background:var(--accent);color:#fff' }, '+ Novo usuário');
    btnNovo.onclick = () => abrirFormNovoUsuario(body);
    topo.appendChild(btnNovo);
    body.appendChild(topo);

    const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    usuarios.forEach(u => lista.appendChild(renderItemUsuario(u, body)));
    body.appendChild(lista);
  } catch (err) {
    body.innerHTML = '<div style="padding:20px;color:#991b1b">Erro: ' + escapeHtml(err.message) + '</div>';
  }
}

function renderItemUsuario(u, body) {
  const item = el('div', {
    style: 'padding:12px 14px;background:#fff;border:1px solid var(--line);border-radius:8px;display:grid;grid-template-columns:1fr 130px 110px;gap:12px;align-items:center'
  });
  if (!u.ativo) item.style.opacity = '.6';

  const col1 = el('div', { style: 'min-width:0' });
  const nomeWrap = el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:3px' });
  const nomeEl = el('div', {
    style: 'font-weight:600;font-size:13px;color:var(--ink);cursor:pointer;padding:2px 4px;border-radius:4px'
  }, u.nome || '(sem nome)');
  nomeEl.title = 'Clique pra editar';
  nomeEl.onclick = () => editarNomeInline(u, nomeEl);
  nomeWrap.appendChild(nomeEl);
  const lapis = el('span', { style: 'font-size:10px;color:#94a3b8' }, '✏️');
  nomeWrap.appendChild(lapis);
  col1.appendChild(nomeWrap);

  const emailEl = el('div', { style: 'font-size:11px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, u.email || '(sem email)');
  col1.appendChild(emailEl);

  const acoes = el('div', { style: 'display:flex;gap:6px;margin-top:6px' });
  const btnSenha = el('button', { type: 'button', className: 'btn ghost sm', style: 'font-size:10px;padding:3px 8px' }, '🔑 Senha');
  btnSenha.onclick = () => abrirFormSenha(u);
  acoes.appendChild(btnSenha);
  const btnExcluir = el('button', { type: 'button', className: 'btn ghost sm', style: 'font-size:10px;padding:3px 8px;color:#dc2626' }, '🗑️ Excluir');
  btnExcluir.onclick = () => confirmarExcluir(u, body);
  acoes.appendChild(btnExcluir);
  col1.appendChild(acoes);

  item.appendChild(col1);

  const selPapel = el('select', { style: 'padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:12px;width:100%' });
  ['admin', 'gestor', 'corretor', 'visualizador'].forEach(r => {
    const opt = el('option', { value: r }, LABELS_ROLE[r].txt);
    if (r === u.role) opt.selected = true;
    selPapel.appendChild(opt);
  });
  selPapel.onchange = async () => {
    const novo = selPapel.value;
    try {
      await atualizarPapelUsuario(u.user_id, novo);
      u.role = novo;
      mostrarToast('Papel alterado pra ' + LABELS_ROLE[novo].txt, 'success');
    } catch (err) {
      mostrarToast('Erro: ' + err.message, 'error');
      selPapel.value = u.role;
    }
  };
  item.appendChild(selPapel);

  const cbWrap = el('label', { style: 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);cursor:pointer;justify-content:center' });
  const cb = el('input', { type: 'checkbox' });
  cb.checked = !!u.ativo;
  cbWrap.appendChild(cb);
  cbWrap.appendChild(document.createTextNode(' Ativo'));
  cb.onchange = async () => {
    try {
      await atualizarAtivoUsuario(u.user_id, cb.checked);
      u.ativo = cb.checked;
      item.style.opacity = cb.checked ? '1' : '.6';
      mostrarToast(cb.checked ? 'Usuário ativado' : 'Usuário desativado', 'success');
    } catch (err) {
      mostrarToast('Erro: ' + err.message, 'error');
      cb.checked = !cb.checked;
    }
  };
  item.appendChild(cbWrap);

  return item;
}

function editarNomeInline(u, nomeEl) {
  const inp = el('input', {
    type: 'text', value: u.nome || '',
    style: 'font-weight:600;font-size:13px;padding:2px 4px;border:1px solid var(--accent);border-radius:4px;width:200px'
  });
  nomeEl.replaceWith(inp);
  inp.focus(); inp.select();

  const salvar = async () => {
    const novo = inp.value.trim();
    if (!novo || novo === u.nome) {
      inp.replaceWith(nomeEl);
      return;
    }
    inp.disabled = true;
    try {
      await alterarNomeUsuario(u.user_id, novo);
      u.nome = novo;
      nomeEl.textContent = novo;
      mostrarToast('Nome atualizado', 'success');
    } catch (err) {
      mostrarToast('Erro: ' + err.message, 'error');
    }
    inp.replaceWith(nomeEl);
  };
  inp.onblur = salvar;
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = u.nome || ''; inp.blur(); }
  };
}

function abrirFormNovoUsuario(parentBody) {
  const body = el('div');
  body.innerHTML =
    '<div class="form-grid">' +
      '<div class="form-field full"><label>Email *</label><input type="email" name="email" required placeholder="exemplo@dominio.com"></div>' +
      '<div class="form-field full"><label>Nome completo</label><input type="text" name="nome" placeholder="Maria Souza"></div>' +
      '<div class="form-field"><label>Papel *</label><select name="role" required>' +
        '<option value="visualizador">Visualizador</option>' +
        '<option value="corretor">Corretor</option>' +
        '<option value="gestor">Gestor</option>' +
        '<option value="admin">Admin</option>' +
      '</select></div>' +
      '<div class="form-field"><label>Senha inicial *</label>' +
        '<input type="text" name="password" required minlength="6" placeholder="mín. 6 caracteres">' +
        '<small style="font-size:10px;color:var(--ink-soft)">Usuário acessa com essa senha e pode trocar depois.</small>' +
      '</div>' +
    '</div>';

  abrirModal({
    titulo: '+ Novo usuário', body, submitLabel: 'Criar usuário',
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      const email = fd.get('email');
      const nome = fd.get('nome');
      const role = fd.get('role');
      const password = fd.get('password');
      if (!email || !password) throw new Error('Email e senha são obrigatórios');
      if (password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres');
      await criarUsuario({ email, password, nome, role });
      mostrarToast('Usuário "' + (nome || email) + '" criado', 'success');
      await renderListaUsuarios(parentBody);
    }
  });
}

function abrirFormSenha(u) {
  const body = el('div');
  body.innerHTML =
    '<div style="padding:10px;background:#f8fafc;border-radius:6px;margin-bottom:14px;font-size:13px">' +
      '<strong>' + escapeHtml(u.nome || '(sem nome)') + '</strong><br>' +
      '<span style="font-size:11px;color:var(--ink-soft)">' + escapeHtml(u.email || '') + '</span>' +
    '</div>' +
    '<div class="form-grid">' +
      '<div class="form-field full"><label>Nova senha *</label>' +
        '<input type="text" name="password" required minlength="6" placeholder="mín. 6 caracteres">' +
        '<small style="font-size:10px;color:var(--ink-soft)">A senha atual será substituída imediatamente.</small>' +
      '</div>' +
    '</div>';

  abrirModal({
    titulo: '🔑 Alterar senha', body, submitLabel: 'Atualizar senha',
    onSubmit: async () => {
      const form = body.closest('form');
      const fd = new FormData(form);
      const password = fd.get('password');
      if (!password || password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres');
      await alterarSenhaUsuario(u.user_id, password);
      mostrarToast('Senha de ' + (u.nome || u.email) + ' atualizada', 'success');
    }
  });
}

async function confirmarExcluir(u, parentBody) {
  const ok = await confirmarAcao({
    titulo: 'Excluir usuário',
    mensagem: 'Tem certeza que quer excluir "' + (u.nome || u.email) + '"? Esta ação é PERMANENTE — o usuário perde acesso ao app e o perfil dele é apagado.',
    confirmLabel: 'Excluir definitivamente',
    perigo: true
  });
  if (!ok) return;
  try {
    await excluirUsuario(u.user_id);
    mostrarToast('Usuário excluído', 'success');
    await renderListaUsuarios(parentBody);
  } catch (err) {
    mostrarToast('Erro: ' + err.message, 'error');
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
