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
  const path = `${entidade_tipo}/${entidade_id}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supa.storage.from('arquivos').upload(path, file);
  if (upErr) throw upErr;

  // Registra na tabela
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

export async function getDownloadURL(storage_path) {
  if (MOCK_MODE || storage_path.startsWith('http') || storage_path.startsWith('file:') || storage_path.startsWith('blob:')) {
    return storage_path;
  }
  const supa = await getSupabase();
  const { data } = await supa.storage.from('arquivos').createSignedUrl(storage_path, 3600); // 1h
  return data?.signedUrl;
}
