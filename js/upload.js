// =====================================================================
// Upload de arquivos (preparado para Supabase Storage)
// Em modo MOCK, salva blob URL em localStorage (limitado).
// =====================================================================
import { getSupabase, MOCK_MODE } from './supabase-client.js';

export async function uploadArquivo(file, { entidade_tipo, entidade_id, categoria = 'outro' }) {
  if (MOCK_MODE) {
    // Mock: cria object URL temporário
    const url = URL.createObjectURL(file);
    const arquivo = {
      id: 'a' + Date.now(),
      entidade_tipo, entidade_id, categoria,
      nome_original: file.name,
      storage_path: url,
      tamanho_bytes: file.size,
      mime_type: file.type
    };
    // Persiste no localStorage (próximo refresh perde — mock só)
    const key = 'union511_uploads_mock';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push(arquivo);
    localStorage.setItem(key, JSON.stringify(list));
    return arquivo;
  }

  const supa = await getSupabase();
  // Sanitiza nome do arquivo para o Supabase Storage (não aceita acentos, espaços, caracteres especiais)
  const nomeSanitizado = sanitizarNomeArquivo(file.name);
  const path = `${entidade_tipo}/${entidade_id}/${Date.now()}_${nomeSanitizado}`;
  const { error: upErr } = await supa.storage.from('arquivos').upload(path, file);
  if (upErr) throw upErr;

  // Registra na tabela (guarda o nome ORIGINAL para exibir ao usuário)
  const { data: { user } } = await supa.auth.getUser();
  const { data, error } = await supa.from('arquivos').insert({
    entidade_tipo, entidade_id, categoria,
    nome_original: file.name,
    storage_path: path,
    tamanho_bytes: file.size,
    mime_type: file.type,
    uploaded_by: user?.id
  }).select().single();
  if (error) throw error;
  return data;
}

function sanitizarNomeArquivo(nome) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Upload "leve" — só sobe o PDF pro Storage e retorna o storage_path.
// NÃO insere em `arquivos` (a tabela legada). Usado pelos anexos unificados
// (tabela `documentos_contrato`), onde o storage_path é gravado diretamente
// no campo arquivo_url. Evita o problema do CHECK constraint da arquivos.categoria.
export async function uploadPdfStorage(file, { entidade_tipo, entidade_id }) {
  if (MOCK_MODE) {
    return { storage_path: URL.createObjectURL(file) };
  }
  const supa = await getSupabase();
  const nomeSanitizado = sanitizarNomeArquivo(file.name);
  const path = `${entidade_tipo}/${entidade_id}/${Date.now()}_${nomeSanitizado}`;
  const { error: upErr } = await supa.storage.from('arquivos').upload(path, file);
  if (upErr) throw upErr;
  return { storage_path: path };
}

// Gera URL temporária (válida por 5 min) para visualizar/baixar um arquivo do Storage
export async function getArquivoUrl(storage_path) {
  if (!storage_path) return null;
  if (MOCK_MODE) return storage_path;
  const supa = await getSupabase();
  const { data, error } = await supa.storage.from('arquivos').createSignedUrl(storage_path, 300);
  if (error) throw new Error('Nao foi possivel gerar URL do arquivo: ' + error.message);
  return data && data.signedUrl ? data.signedUrl : null;
}
