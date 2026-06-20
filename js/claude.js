// =====================================================================
// Cliente para a Edge Function claude-proxy
// =====================================================================
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client.js';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

async function authHeaders() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente para usar a IA.');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': SUPABASE_ANON_KEY
  };
}

async function callExtract(mode, pdfFile, label) {
  if (!pdfFile) throw new Error('Arquivo PDF não fornecido');
  if (pdfFile.type !== 'application/pdf') throw new Error('Arquivo precisa ser PDF');
  const base64 = await arquivoParaBase64(pdfFile);
  const headers = await authHeaders();
  const r = await fetch(FUNCTION_URL, {
    method: 'POST', headers,
    body: JSON.stringify({ mode, pdf_base64: base64 })
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); msg = j.error || msg; } catch(_){}
    throw new Error('Falha na ' + label + ': ' + msg);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'Resposta inválida do proxy');
  return out.data;
}

export async function extrairContratoDoPDF(pdfFile)    { return callExtract('extract_contract', pdfFile, 'extração'); }
export async function extrairPropostaDoPDF(pdfFile)    { return callExtract('extract_proposal', pdfFile, 'extração'); }
export async function extrairClausulasDoPDF(pdfFile)   { return callExtract('extract_clauses',  pdfFile, 'extração de cláusulas'); }
export async function extrairDocumentoDoPDF(pdfFile)   { return callExtract('extract_document', pdfFile, 'extração'); }

export async function chatComClaude(messages, dbContext = '') {
  const headers = await authHeaders();
  const r = await fetch(FUNCTION_URL, {
    method: 'POST', headers,
    body: JSON.stringify({ mode: 'chat', messages, db_context: dbContext })
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); msg = j.error || msg; } catch(_){}
    throw new Error('Falha no chat: ' + msg);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'Resposta inválida do proxy');
  return out.reply;
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}
