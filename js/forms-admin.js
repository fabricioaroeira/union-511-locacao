// =====================================================================
// Modal de administração: gerenciar usuários e papéis
// Acessível apenas pra papel = 'admin'
// =====================================================================
import { abrirModal, fecharModal, confirmarAcao } from './modal.js';
import { el } from './utils.js';
import { mostrarToast } from './render.js';
import { getUsuarios, atualizarPapelUsuario, atualizarAtivoUsuario, getMeuPapel } from './data-layer.js';

const LABELS_ROLE = {
  admin:        { lbl: 'Admin',        cor: '#7c3aed', desc: 'Tudo: vê, edita, exclui, gerencia usuários' },
  gestor:       { lbl: 'Gestor',       cor: '#1e40af', desc: 'CRUD em tudo (sem gerenciar admins)' },
  corretor:     { lbl: 'Corretor',     cor: '#15803d', desc: 'Lê tudo, cria/edita só propostas e leads próprios' },
  visualizador: { lbl: 'Visualizador', cor: '#64748b', desc: 'Só leitura em tudo' },
};

export async function abrirAdminUsuarios() {
  // Confere que é admin
  const meuPapel = await getMeuPapel().catch(() => null);
  if (meuPapel !== 'admin') {
    mostrarToast('Acesso restrito a administradores', 'error');
    return;
  }

  const body = el('div');

  // === Cabeçalho explicativo ===
  const head = el('div', { className: 'form-section', style: { marginBottom: '12px' } });
  head.innerHTML = `
    <div style="padding:12px;background:#f1f5f9;border-left:4px solid var(--accent);border-radius:6px;font-size:13px;color:var(--ink)">
      <strong>Gerenciamento de usuários — Union 511</strong><br>
      <span style="color:var(--ink-soft)">Mude papéis aqui no app. Pra <strong>adicionar/remover usuários</strong> use o <a href="https://supabase.com/dashboard/project/nqmciizayetxojuthqjp/auth/users" target="_blank" rel="noopener">painel Auth do Supabase</a> — quando o usuário for criado lá, aparece automaticamente aqui como Visualizador.</span>
    </div>
  `;
  body.appendChild(head);

  // === Legenda de papéis ===
  const legenda = el('div', { className: 'form-section' });
  legenda.appendChild(el('div', { className: 'form-section-title' }, 'Níveis de acesso'));
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:10px';
  Object.entries(LABELS_ROLE).forEach(([key, info]) => {
    const card = el('div');
    card.style.cssText = `padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;border-left:3px solid ${info.cor}`;
    card.innerHTML = `<div style="font-weight:600;font-size:13px;color:${info.cor};margin-bottom:4px">${info.lbl}</div><div style="font-size:11px;color:var(--ink-soft);line-height:1.4">${info.desc}</div>`;
    grid.appendChild(card);
  });
  legenda.appendChild(grid);
  body.appendChild(legenda);

  // === Lista de usuários ===
  const sec = el('div', { className: 'form-section' });
  sec.appendChild(el('div', { className: 'form-section-title' }, 'Usuários'));
  const lista = el('div', { id: 'admin-users-list' });
  lista.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px">Carregando usuários...</div>';
  sec.appendChild(lista);
  body.appendChild(sec);

  abrirModal({
    titulo: '⚙️ Administração de usuários',
    body,
    submitLabel: 'Fechar',
    maxWidth: '780px',
    onSubmit: async () => { /* só fecha */ }
  });

  // Renderiza a lista depois do modal aberto
  await renderListaUsuarios(lista);
}

async function renderListaUsuarios(container) {
  try {
    const usuarios = await getUsuarios();
    if (!usuarios || usuarios.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px">Nenhum usuário cadastrado.</div>';
      return;
    }
    container.innerHTML = '';
    usuarios.forEach(u => container.appendChild(renderItemUsuario(u, container)));
  } catch (err) {
    container.innerHTML = '<div style="padding:20px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:6px;font-size:13px">Erro ao carregar usuários: ' + (err.message || err) + '</div>';
  }
}

function renderItemUsuario(u, listaContainer) {
  const row = el('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 160px 110px 110px;gap:10px;align-items:center;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;font-size:13px';

  // === Nome + email ===
  const infoCol = el('div');
  infoCol.style.cssText = 'min-width:0';
  infoCol.innerHTML = `
    <div style="font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.nome || '(sem nome)')}</div>
    <div style="font-size:11px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.email || '')}</div>
  `;
  row.appendChild(infoCol);

  // === Dropdown de papel ===
  const sel = el('select');
  sel.style.cssText = 'padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:white';
  Object.entries(LABELS_ROLE).forEach(([key, info]) => {
    const opt = el('option', { value: key }, info.lbl);
    if (key === u.role) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!u.ativo) sel.disabled = true;

  sel.addEventListener('change', async () => {
    const novoPapel = sel.value;
    const ok = await confirmarAcao({
      titulo: 'Mudar papel',
      mensagem: `Confirma mudar "${u.nome || u.email}" para ${LABELS_ROLE[novoPapel].lbl}?`,
      confirmLabel: 'Mudar papel',
      perigo: novoPapel === 'admin'
    });
    if (!ok) {
      sel.value = u.role; // volta
      return;
    }
    sel.disabled = true;
    try {
      await atualizarPapelUsuario(u.user_id, novoPapel);
      u.role = novoPapel;
      mostrarToast('Papel atualizado: ' + LABELS_ROLE[novoPapel].lbl);
    } catch (err) {
      sel.value = u.role; // volta
      mostrarToast('Erro: ' + (err.message || err), 'error');
    } finally {
      sel.disabled = !u.ativo;
    }
  });
  row.appendChild(sel);

  // === Toggle ativo ===
  const ativoBtn = el('button', { type: 'button' });
  ativoBtn.style.cssText = `padding:6px 10px;border:1px solid ${u.ativo ? '#16a34a' : '#94a3b8'};background:${u.ativo ? '#dcfce7' : '#f1f5f9'};color:${u.ativo ? '#15803d' : '#64748b'};border-radius:4px;font-size:11px;font-weight:600;cursor:pointer`;
  ativoBtn.textContent = u.ativo ? '✓ Ativo' : '✕ Inativo';
  ativoBtn.addEventListener('click', async () => {
    const novoEstado = !u.ativo;
    const ok = await confirmarAcao({
      titulo: novoEstado ? 'Reativar usuário' : 'Desativar usuário',
      mensagem: novoEstado
        ? `Reativar "${u.nome || u.email}"? Ele voltará a poder fazer login no app.`
        : `Desativar "${u.nome || u.email}"? Ele perde acesso imediato ao app, mas a conta dele permanece no Supabase.`,
      confirmLabel: novoEstado ? 'Reativar' : 'Desativar',
      perigo: !novoEstado
    });
    if (!ok) return;
    ativoBtn.disabled = true;
    try {
      await atualizarAtivoUsuario(u.user_id, novoEstado);
      u.ativo = novoEstado;
      mostrarToast(novoEstado ? 'Usuário reativado' : 'Usuário desativado');
      // Re-renderiza o item
      const novoItem = renderItemUsuario(u, listaContainer);
      row.replaceWith(novoItem);
    } catch (err) {
      mostrarToast('Erro: ' + (err.message || err), 'error');
      ativoBtn.disabled = false;
    }
  });
  row.appendChild(ativoBtn);

  // === Último login ===
  const ultimoCol = el('div');
  ultimoCol.style.cssText = 'font-size:11px;color:var(--ink-soft);text-align:right';
  if (u.last_sign_in_at) {
    const data = new Date(u.last_sign_in_at);
    ultimoCol.textContent = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else {
    ultimoCol.textContent = 'Nunca logou';
  }
  row.appendChild(ultimoCol);

  return row;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
