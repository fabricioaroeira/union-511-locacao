// =====================================================================
// Autenticação
// =====================================================================
// Em modo MOCK: aceita qualquer email/senha (para desenvolvimento).
// Em modo real: usa Supabase Auth.
// =====================================================================

import { getSupabase, MOCK_MODE } from './supabase-client.js';

const MOCK_USER_KEY = 'union511_mock_user';

export { MOCK_MODE };

// ---------------------------------------------------------------------
// Está logado?
// ---------------------------------------------------------------------
export async function isLogged() {
  if (MOCK_MODE) {
    return localStorage.getItem(MOCK_USER_KEY) !== null;
  }
  const supa = await getSupabase();
  const { data: { session } } = await supa.auth.getSession();
  return !!session;
}

// ---------------------------------------------------------------------
// Usuário atual
// ---------------------------------------------------------------------
export async function getCurrentUser() {
  if (MOCK_MODE) {
    const raw = localStorage.getItem(MOCK_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  const supa = await getSupabase();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  // Busca perfil
  const { data: perfil } = await supa.from('perfis').select('*').eq('user_id', user.id).single();
  return { id: user.id, email: user.email, ...(perfil || {}) };
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------
export async function signIn(email, senha) {
  if (MOCK_MODE) {
    if (!email) throw new Error('Email obrigatório');
    const user = {
      id: 'mock-' + email,
      email: email,
      nome: 'Fabrício (modo demo)',
      papel: 'admin'
    };
    localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
    return user;
  }
  const supa = await getSupabase();
  const { data, error } = await supa.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message);
  return data.user;
}

// ---------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------
export async function signOut() {
  if (MOCK_MODE) {
    localStorage.removeItem(MOCK_USER_KEY);
    return;
  }
  const supa = await getSupabase();
  await supa.auth.signOut();
}

// ---------------------------------------------------------------------
// Guard de página: redireciona pra login se não estiver logado
// ---------------------------------------------------------------------
export async function requireAuth() {
  if (!(await isLogged())) {
    window.location.href = './login.html';
    throw new Error('Não autenticado');
  }
}
