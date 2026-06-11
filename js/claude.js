// =====================================================================
// Cliente para a Edge Function claude-proxy
// =====================================================================
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client.js';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/claude-proxy`;

async function authHeaders() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token || SUPABASE_ANON_KEY;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': SUPABASE_ANON_KEY
  };
}

// ===== Extrair dados de contrato (PDF) =====
export async function extrairContratoDoPDF(pdfFile) {
  if (!pdfFile) throw new Error('Arquivo PDF não fornecido');
  if (pdfFile.type !== 'application/pdf') throw new Error('Arquivo precisa ser PDF');
  const base64 = await arquivoParaBase64(pdfFile);
  const headers = await authHeaders();
  const r = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'extract_contract', pdf_base64: base64 })
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(`Falha na extração: ${msg}`);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'Resposta inválida do proxy');
  return out.data;
}

// ===== Extrair dados de proposta (PDF) =====
export async function extrairPropostaDoPDF(pdfFile) {
  if (!pdfFile) throw new Error('Arquivo PDF não fornecido');
  if (pdfFile.type !== 'application/pdf') throw new Error('Arquivo precisa ser PDF');
  const base64 = await arquivoParaBase64(pdfFile);
  const headers = await authHeaders();
  const r = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'extract_proposal', pdf_base64: base64 })
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(`Falha na extração: ${msg}`);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'Resposta inválida do proxy');
  return out.data;
}

// ===== Extrair dados de documento administrativo (PDF) =====
// Aceita seguros, certidões, vistorias, AVCB, alvarás
export async function extrairDocumentoDoPDF(pdfFile) {
  if (!pdfFile) throw new Error('Arquivo PDF não fornecido');
  if (pdfFile.type !== 'application/pdf') throw new Error('Arquivo precisa ser PDF');
  const base64 = await arquivoParaBase64(pdfFile);
  const headers = await authHeaders();
  const r = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'extract_document', pdf_base64: base64 })
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(`Falha na extração: ${msg}`);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'Resposta inválida do proxy');
  return out.data;
}

// ===== Chat com Claude =====
export async function chatComClaude(messages, dbContext = '') {
  const headers = await authHeaders();
  const r = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'chat', messages, db_context: dbContext })
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(`Falha no chat: ${msg}`);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'Resposta inválida do proxy');
  return out.reply;
}

// ===== Helper: converte File para base64 =====
function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}
