// =====================================================================
// CAMADA DE DADOS — abstrai entre Mock (localStorage) e Supabase
// =====================================================================
// Toda função tem dois caminhos:
//   - MOCK_MODE = true:  usa dados locais (localStorage + seed)
//   - MOCK_MODE = false: consulta o banco Supabase via views
//
// Interface pública (use SEMPRE estas funções, nunca acesse direto):
//   - getKPIs()
//   - getLojasStatus()
//   - getInquilinos() / getInquilino(id) / saveInquilino(data)
//   - getContratos() / getContrato(id) / saveContrato(data) / encerrarContrato(id, motivo)
//   - getPropostas() / getProposta(id) / saveProposta(data) / converterPropostaEmContrato(id, ajustes)
//   - getVagas()
//   - getArquivos(entidadeTipo, entidadeId) / uploadArquivo(...)
// =====================================================================

import { MOCK_MODE, getSupabase } from './supabase-client.js';
import { parseBR, addMonths, fmtBR } from './utils.js';

// ---------------------------------------------------------------------
// SEED inicial (espelha o estado atual do dashboard)
// Carregado uma vez do localStorage; se não existe, popula com dados.
// ---------------------------------------------------------------------
const SEED = {
  lojasInternas: ['02', '03', '49', '52'],

  inquilinos: [
    { id: 'i1',  tipo: 'PJ', razao_social: 'Empreendimentos Pague Menos S/A',         nome_fantasia: 'Pague Menos',      documento: '06.626.253/0001-51', segmento: 'Farmácia' },
    { id: 'i2',  tipo: 'PF', razao_social: 'Maria Teresa de Almeida Leôncio Drumond', nome_fantasia: null,               documento: '905.462.611-91',     segmento: 'Comercial' },
    { id: 'i3',  tipo: 'PJ', razao_social: 'Kamaral Calistenia Ltda',                 nome_fantasia: 'Calistenia',       documento: '63.553.057/0001-38', segmento: 'Fitness/Calistenia' },
    { id: 'i4',  tipo: 'PJ', razao_social: 'JRBL Calçados Ltda',                      nome_fantasia: 'Constance',        documento: '58.615.483/0001-19', segmento: 'Calçados' },
    { id: 'i5',  tipo: 'PJ', razao_social: 'MC Mercado Saudável Ltda',                nome_fantasia: 'Amo Verde',        documento: '43.630.337/0001-95', segmento: 'Alimentação saudável' },
    { id: 'i6',  tipo: 'PF', razao_social: 'Daiane Ferreira Claro Rossafa Barrachi',  nome_fantasia: 'Velocity Studios', documento: 'CPF',                segmento: 'Studios fitness' },
    { id: 'i7',  tipo: 'PJ', razao_social: 'Academia Noroeste Ltda',                  nome_fantasia: 'Academia Noroeste / Evolve', documento: '62.275.533/0001-33', segmento: 'Academia' },
    { id: 'i8',  tipo: 'PJ', razao_social: 'Centro de Estética Resende Ltda',         nome_fantasia: 'Bemfina',          documento: '21.538.595/0001-03', segmento: 'Estética/Esmalteria' },
    { id: 'i9',  tipo: 'PJ', razao_social: 'MCR IT Business Ltda',                    nome_fantasia: 'Mayka',            documento: '58.362.193/0001-00', segmento: 'Vestuário feminino' },
    { id: 'i10', tipo: 'PJ', razao_social: 'Drogaria Brasil Ltda',                    nome_fantasia: 'Drogaria Brasil',  documento: '00.372.383/0001-29', segmento: 'Farmácia' }
  ],

  contratos: [
    { id: 'c1',  inquilino_id: 'i1',  lojas: ['01','04','05'],    data_assinatura: '2025-12-09', data_inicio: '2026-01-30', prazo_meses: 120, valor_aluguel: 39000.00, dia_vencimento: 1,  meses_carencia: 3, indice_reajuste: 'IPCA',  tipo_garantia: 'fianca_pj',           detalhes_garantia: 'DUPAR Participações S/A', parcial: false, observacoes: 'Áreas: L01=54,90m² · L04=117,57m² · L05=29,18m² (total 201,65m²)',                                                                                                                                                                                                                              status: 'ativo' },
    { id: 'c2',  inquilino_id: 'i2',  lojas: ['06'],              data_assinatura: '2026-05-25', data_inicio: '2026-05-25', prazo_meses: 36,  valor_aluguel: 8500.00,  dia_vencimento: 1,  meses_carencia: 3, indice_reajuste: 'IGP-M', tipo_garantia: 'seguro_fianca',       detalhes_garantia: 'Seguro Fiança Pottencial R$ 255.000 (30× aluguel) · vigência 25/05/2026 a 24/05/2029', parcial: false, observacoes: 'Loja 06 = 44,92m² loja + 24m² depósito = 68,92m². Cláusula especial: vedado acesso operacional pela face da galeria/hall interno.',                                                                       status: 'ativo' },
    { id: 'c3',  inquilino_id: 'i3',  lojas: ['09'],              data_assinatura: '2025-11-18', data_inicio: '2025-11-18', prazo_meses: 60,  valor_aluguel: 22000.00, dia_vencimento: 15, meses_carencia: 3, indice_reajuste: 'IGP-M', tipo_garantia: 'fianca_pessoal',      detalhes_garantia: '2 fiadores pessoais', parcial: false, observacoes: 'Carência começa após o 1º mês pago.',                                                                                                                                                                                                                                                                              status: 'ativo' },
    { id: 'c4',  inquilino_id: 'i4',  lojas: ['10'],              data_assinatura: '2025-07-25', data_inicio: '2025-08-31', prazo_meses: 60,  valor_aluguel: 11180.00, dia_vencimento: 10, meses_carencia: 3, indice_reajuste: 'IGP-M', tipo_garantia: 'fianca_pessoal',      detalhes_garantia: '3 fiadores: Renato Maurer, Maria Luciana Lopes, Maria Lucia Lopes', parcial: false, observacoes: 'Preferência de locação à Franqueadora Constance. Mezanino permitido com ART.',                                                                                                                                                                                  status: 'ativo' },
    { id: 'c5',  inquilino_id: 'i5',  lojas: ['14'],              data_assinatura: '2026-03-11', data_inicio: '2026-03-11', prazo_meses: 36,  valor_aluguel: 7228.80,  dia_vencimento: 1,  meses_carencia: 2, indice_reajuste: 'IGP-M', tipo_garantia: 'seguro_fianca',       detalhes_garantia: 'Seguro Fiança até 30× aluguel · vigência 11/03/2026 a 10/03/2029', parcial: false, observacoes: '',                                                                                                                                                                                                                                                                          status: 'ativo' },
    { id: 'c6',  inquilino_id: 'i6',  lojas: ['15'],              data_assinatura: '2025-10-17', data_inicio: '2025-10-17', prazo_meses: 60,  valor_aluguel: 20000.00, dia_vencimento: 1,  meses_carencia: 3, indice_reajuste: 'IGP-M', tipo_garantia: 'sem_garantia',        detalhes_garantia: 'Inexistência de garantia', parcial: false, observacoes: 'ÚNICO contrato SEM garantia. Vinculado ao uso da marca STUDIOS.',                                                                                                                                                                                                                                              status: 'ativo' },
    { id: 'c7',  inquilino_id: 'i7',  lojas: ['19'],              data_assinatura: '2025-06-13', data_inicio: '2025-06-13', prazo_meses: 120, valor_aluguel: 55000.00, dia_vencimento: 10, meses_carencia: 4, indice_reajuste: 'IGP-M', tipo_garantia: 'fianca_pj',           detalhes_garantia: 'Evolve Participações em Sociedades S/A (CNPJ 34.324.641/0001-13)', parcial: true,  observacoes: 'CTO escalonado: Ano 1 R$ 55k · Ano 2 R$ 60k · Ano 3+ R$ 65k. Cláusula de exclusividade: veda academias >500m². Loja 19 = 90,54m² priv + ~1.317m² total com vagas.',                                                                                                       status: 'ativo' },
    { id: 'c8',  inquilino_id: 'i8',  lojas: ['41','42','43'],    data_assinatura: '2025-05-29', data_inicio: '2025-05-29', prazo_meses: 60,  valor_aluguel: 22161.60, dia_vencimento: 15, meses_carencia: 3, indice_reajuste: 'IGP-M', tipo_garantia: 'fianca_pessoal',      detalhes_garantia: '5 fiadores: F. Rhode, G. Janino, N. Janino, E. Resende, T. Resende', parcial: false, observacoes: 'Originalmente R$ 14.958,40 (Lojas 41+42). 1º Aditivo 27/06/2025: incluiu Loja 43, aluguel R$ 22.161,60. 2º Aditivo 30/01/2026: vencimento dia 1 → dia 15.',                                                                                                       status: 'ativo' },
    { id: 'c9',  inquilino_id: 'i9',  lojas: ['44'],              data_assinatura: '2026-02-03', data_inicio: '2026-02-03', prazo_meses: 60,  valor_aluguel: 7675.20,  dia_vencimento: 1,  meses_carencia: 3, indice_reajuste: 'IGP-M', tipo_garantia: 'titulo_capitalizacao', detalhes_garantia: 'Título de Capitalização R$ 101.702,40 (12× aluguel)', parcial: false, observacoes: 'Único contrato com Título de Capitalização.',                                                                                                                                                                                                                                          status: 'ativo' },
    { id: 'c10', inquilino_id: 'i10', lojas: ['50','51'],         data_assinatura: '2025-03-28', data_inicio: '2025-11-27', prazo_meses: 60,  valor_aluguel: 25000.00, dia_vencimento: 1,  meses_carencia: 3, indice_reajuste: 'IPCA',  tipo_garantia: 'fianca_pessoal',      detalhes_garantia: 'Álvaro Silveira Jr + Patricia + Rodrigo + Karine', parcial: false, observacoes: 'Descontos escalonados: m4-6 = R$ 20k · m7-12 = R$ 22k · m13+ = R$ 25k.',                                                                                                                                                                                                                       status: 'ativo' }
  ],

  propostas: [
    { id: 'p1', status: 'em_analise',              cliente_nome: 'Julia Ordonho',                                ramo: 'Aluguel de louças para eventos',                                          corretor: 'Biensky Imóveis', cv: '#11667', data_proposta: '2026-06-08', lojas: ['08'],       area_total: 154.77, valor_aluguel: 17024.70, meses_carencia: 4, prazo_opcoes: '3 ou 5 anos (a definir)', tipo_garantia: 'titulo_capitalizacao', detalhes_garantia: 'Título de Capitalização (12× aluguel)',  observacoes: 'Cliente ainda não abriu a empresa, mas atua há anos em Brasília.' },
    { id: 'p2', status: 'aceita_aguardando_docs',  cliente_nome: 'Marcel — proprietário da Cannelle Veggie',     ramo: 'Cafeteria (nome novo, projeto próprio, mesmo ramo da Cannelle)',          corretor: 'Biensky Imóveis', cv: null,     data_proposta: '2026-06-01', lojas: ['45','46'],  area_total: 93.82,  valor_aluguel: 12000.00, meses_carencia: 4, prazo_opcoes: '5 anos',                  tipo_garantia: 'fianca_pessoal',       detalhes_garantia: 'Fiadores',                              observacoes: 'Cannelle tem 23K seguidores no IG (@cannelleveggie). Aceita em 01/06/2026.' }
  ],

  // 54 vagas associadas ao contrato c7 (Evolve/Academia Noroeste)
  vagas: ['08C','09C','10C','11C','12C','13C','14C','15C','16C','17C','18C','19C','20C','21C','22C','23C','24C','25C','26C','27C','28C','29C','30C','38C','39C','40C','41C','42C','43C','44C','45C','46C','47C','48C','49C','50C','51C','52C','53C','54C','64C','65C','66C','67C','68C','69C','70C','71C','72C','73C','74C','75C','76C','77C'],

  arquivos: [
    // Por ora os PDFs ficam referenciados pelo file:// path original
    { id: 'a1',  entidade_tipo: 'contrato', entidade_id: 'c1',  categoria: 'contrato_assinado', nome_original: 'Contrato Pague Menos',         storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/1%20-%20Lojas%201%204%20e%205%20-%20Pague%20Menos/001_7164__Contrato_de_Locacao_Site_BSB17_Noroeste311_DF_11_12_25_(autenticado).pdf' },
    { id: 'a2',  entidade_tipo: 'contrato', entidade_id: 'c2',  categoria: 'contrato_assinado', nome_original: 'Contrato Maria Teresa Drumond', storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/10%20-%20Loja%2006%20-%20Maria%20Teresa%20Drumond/Contrato%20de%20Locacao%20-%20Seguro%20Fianca%20-%20Loja%2006%20-%2025%2005%202026%20pdf-D4Sign.pdf' },
    { id: 'a3',  entidade_tipo: 'contrato', entidade_id: 'c3',  categoria: 'contrato_assinado', nome_original: 'Contrato Calistenia',           storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/2%20-%20Loja%2009%20-%20Calistenia/2%20Calistenia%20-%20Contrato%20de%20Loca%C3%A7%C3%A3o%20-%20Fian%C3%A7a%20Pessoal%20-%20Union%20-%2010%2010%202025%20sem%20anu%C3%AAncia%20pdf-D4Sign.pdf' },
    { id: 'a4',  entidade_tipo: 'contrato', entidade_id: 'c4',  categoria: 'contrato_assinado', nome_original: 'Contrato JRBL/Constance',       storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/3%20-%20%20Loja%2010%20-%20Constance/V4-JRBL-Calados---Contrato-de-Locao---Fiana-Pessoal---Union---28-03-2025-pdf-D4Sign.pdf' },
    { id: 'a5',  entidade_tipo: 'contrato', entidade_id: 'c5',  categoria: 'contrato_assinado', nome_original: 'Contrato Amo Verde',            storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/4%20-%20Loja%2014%20-%20Amo%20Verde/Contrato%20de%20Loca%C3%A7%C3%A3o%20-%20Seguro%20fian%C3%A7a%20-%2028%2003%202025%20Final%201%20pdf-D4Sign.pdf' },
    { id: 'a6',  entidade_tipo: 'contrato', entidade_id: 'c6',  categoria: 'contrato_assinado', nome_original: 'Contrato Velocity Studios',     storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/5%20-%20%20Loja%2015%20-%20Velocity/2%20Atualizado%20-%20%20Contrato%20de%20Loca%C3%A7%C3%A3o%20-%20Sem%20garantia%20-%20Union%20-14%2010%202025%20pdf-D4Sign%20(1).pdf' },
    { id: 'a7',  entidade_tipo: 'contrato', entidade_id: 'c7',  categoria: 'contrato_assinado', nome_original: 'Contrato Evolve/Academia',      storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/6%20-%20Loja%2019%20e%20garagens/Contrato%20de%20Loca%C3%A7%C3%A3o%20EVOLVE%20%208-03-2025-VFinal-pdf-D4Sign.pdf' },
    { id: 'a8',  entidade_tipo: 'contrato', entidade_id: 'c7',  categoria: 'aditivo',           nome_original: '1º Aditivo Substituição Locatário', storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/6%20-%20Loja%2019%20e%20garagens/2026.02.24_-_1ABA_ADITIVO_-_EVOLVE_-_NOROESTE_V2_assinado_assinado.pdf' },
    { id: 'a9',  entidade_tipo: 'contrato', entidade_id: 'c8',  categoria: 'contrato_assinado', nome_original: 'Contrato Bemfina',              storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/7%20-%20Lojas%2041%2042%20e%2043%20-%20%20Bemfina/3---Contrato-de-Locao---Fiana-Pessoal---Union---28-03-2025-esmalteria-pdf-D4Sign.pdf' },
    { id: 'a10', entidade_tipo: 'contrato', entidade_id: 'c8',  categoria: 'aditivo',           nome_original: 'Aditivo Inclusão Loja 43',      storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/7%20-%20Lojas%2041%2042%20e%2043%20-%20%20Bemfina/Termo-Aditivo-incluso-loja-43---Fiana-Pessoal---Union---28-03-2025-esmalteria--1--pdf-D4Sign.pdf' },
    { id: 'a11', entidade_tipo: 'contrato', entidade_id: 'c9',  categoria: 'contrato_assinado', nome_original: 'Contrato Mayka',                storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/8%20-%20Loja%2044%20-%20Maika/Contrato%20de%20Loca%C3%A7%C3%A3o%20-%20T%C3%ADtulo%20de%20capitaliza%C3%A7%C3%A3o%2001%2004%202025%2002%20de%202026%20pdf-D4Sign.pdf' },
    { id: 'a12', entidade_tipo: 'contrato', entidade_id: 'c10', categoria: 'contrato_assinado', nome_original: 'Contrato Drogaria Brasil',      storage_path: 'file:///C:/Users/fabricio.aroeira/Desktop/CLAUDE/PASTA%20CLAUDE/9%20-%20%20Lojas%2050%20e%2051%20-%20%20Drogaria%20Brasil/Drogaria%20Brasil%20-%20Contrato%20de%20Loca%C3%A7%C3%A3o%20-%20Fian%C3%A7a%20Pessoal%20-%20Union%20-%2028%2003%202025%20pdf-D4Sign.pdf' }
  ]
};

// ---------------------------------------------------------------------
// Storage para o modo mock (persiste em localStorage)
// ---------------------------------------------------------------------
const STORAGE_KEY = 'union511_data_v1';

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); }
    catch (e) { console.warn('Corrompido, regenerando seed'); }
  }
  return JSON.parse(JSON.stringify(SEED));
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function nextId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// =====================================================================
// API PÚBLICA
// =====================================================================

// ---------------------------------------------------------------------
// LOJAS — status (computa em runtime no mock)
// ---------------------------------------------------------------------
export async function getLojasStatus() {
  if (MOCK_MODE) {
    const store = loadStore();
    const out = [];
    for (let i = 1; i <= 52; i++) {
      const codigo = String(i).padStart(2, '0');
      let status = 'disponivel';
      let inquilino_atual = null;
      let parcial = false;
      if (store.lojasInternas.includes(codigo)) {
        status = 'uso_interno';
      } else {
        const contrato = store.contratos.find(c => c.status === 'ativo' && c.lojas.includes(codigo));
        if (contrato) {
          status = 'ocupada';
          const inq = store.inquilinos.find(i => i.id === contrato.inquilino_id);
          inquilino_atual = inq?.nome_fantasia || inq?.razao_social;
          parcial = contrato.parcial;
        } else {
          const propAceita = store.propostas.find(p => p.status === 'aceita_aguardando_docs' && p.lojas.includes(codigo));
          if (propAceita) status = 'proposta_aceita';
          else {
            const propAnalise = store.propostas.find(p => p.status === 'em_analise' && p.lojas.includes(codigo));
            if (propAnalise) status = 'proposta_analise';
          }
        }
      }
      out.push({ id: i, codigo, status, inquilino_atual, parcial });
    }
    return out;
  } else {
    const supa = await getSupabase();
    const { data, error } = await supa.from('v_lojas_status').select('*').order('id');
    if (error) throw error;
    return data;
  }
}

// ---------------------------------------------------------------------
// KPIs do topo do dashboard
// ---------------------------------------------------------------------
export async function getKPIs() {
  if (MOCK_MODE) {
    const store = loadStore();
    const ocupadas = new Set();
    store.contratos.filter(c => c.status === 'ativo').forEach(c => c.lojas.forEach(l => ocupadas.add(l)));
    const inquilinosAtivos = new Set(store.contratos.filter(c => c.status === 'ativo').map(c => c.inquilino_id));
    const receita = store.contratos.filter(c => c.status === 'ativo').reduce((s, c) => s + Number(c.valor_aluguel), 0);
    const propAtivas = store.propostas.filter(p => ['em_analise','aceita_aguardando_docs'].includes(p.status)).length;
    return {
      total_lojas: 52,
      lojas_internas: store.lojasInternas.length,
      lojas_locaveis: 52 - store.lojasInternas.length,
      lojas_ocupadas: ocupadas.size,
      inquilinos_ativos: inquilinosAtivos.size,
      receita_cheia_mes: receita,
      propostas_ativas: propAtivas,
      vagas_ocupadas: store.vagas.length,
      vagas_comerciais_total: 80
    };
  } else {
    const supa = await getSupabase();
    const { data, error } = await supa.from('v_kpis').select('*').single();
    if (error) throw error;
    return data;
  }
}

// ---------------------------------------------------------------------
// INQUILINOS
// ---------------------------------------------------------------------
export async function getInquilinos() {
  if (MOCK_MODE) return loadStore().inquilinos;
  const supa = await getSupabase();
  const { data } = await supa.from('inquilinos').select('*').order('razao_social');
  return data;
}

export async function getInquilino(id) {
  if (MOCK_MODE) return loadStore().inquilinos.find(i => i.id === id);
  const supa = await getSupabase();
  const { data } = await supa.from('inquilinos').select('*').eq('id', id).single();
  return data;
}

export async function saveInquilino(input) {
  if (MOCK_MODE) {
    const store = loadStore();
    if (input.id) {
      const idx = store.inquilinos.findIndex(i => i.id === input.id);
      store.inquilinos[idx] = { ...store.inquilinos[idx], ...input };
    } else {
      input.id = nextId('i');
      store.inquilinos.push(input);
    }
    saveStore(store);
    return input;
  } else {
    const supa = await getSupabase();
    if (input.id) {
      const { data } = await supa.from('inquilinos').update(input).eq('id', input.id).select().single();
      return data;
    } else {
      const { data } = await supa.from('inquilinos').insert(input).select().single();
      return data;
    }
  }
}

// ---------------------------------------------------------------------
// CONTRATOS (com inquilino e lojas agregados)
// ---------------------------------------------------------------------
export async function getContratos(statusFilter = 'ativo') {
  if (MOCK_MODE) {
    const store = loadStore();
    return store.contratos
      .filter(c => statusFilter === 'all' || c.status === statusFilter)
      .map(c => {
        const inq = store.inquilinos.find(i => i.id === c.inquilino_id) || {};
        return {
          ...c,
          razao_social: inq.razao_social,
          nome_fantasia: inq.nome_fantasia,
          documento: inq.documento,
          segmento: inq.segmento,
          data_termino: fmtBR(addMonths(parseBR(c.data_inicio), c.prazo_meses))
        };
      });
  } else {
    const supa = await getSupabase();
    let q = supa.from('v_contratos_completo').select('*');
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    return data;
  }
}

export async function getContrato(id) {
  if (MOCK_MODE) {
    const all = await getContratos('all');
    return all.find(c => c.id === id);
  }
  const supa = await getSupabase();
  const { data } = await supa.from('v_contratos_completo').select('*').eq('id', id).single();
  return data;
}

export async function saveContrato(input) {
  if (MOCK_MODE) {
    const store = loadStore();
    if (input.id) {
      const idx = store.contratos.findIndex(c => c.id === input.id);
      store.contratos[idx] = { ...store.contratos[idx], ...input };
    } else {
      input.id = nextId('c');
      input.status = input.status || 'ativo';
      store.contratos.push(input);
    }
    saveStore(store);
    return input;
  } else {
    const supa = await getSupabase();
    // Separa lojas (n:n) do contrato base
    const { lojas, id: _idIgnorado, ...contratoBase } = input;

    // VALIDAÇÃO ANTI-DUPLICAÇÃO: verifica se alguma das lojas selecionadas já tem contrato ativo
    if (lojas?.length) {
      const lojasIds = lojas.map(c => parseInt(c, 10));
      let qConflito = supa.from('contrato_lojas')
        .select('loja_id, contrato_id, contratos!inner(status)')
        .in('loja_id', lojasIds)
        .eq('contratos.status', 'ativo');
      if (input.id) qConflito = qConflito.neq('contrato_id', input.id); // ao editar, ignora o próprio
      const { data: conflitos, error: errConf } = await qConflito;
      if (errConf) throw new Error('Erro ao verificar lojas: ' + errConf.message);
      if (conflitos && conflitos.length > 0) {
        const lojasOcupadas = [...new Set(conflitos.map(c => String(c.loja_id).padStart(2, '0')))].sort();
        throw new Error('Loja(s) já ocupada(s) por contrato ativo: ' + lojasOcupadas.join(', ') + '. Encerre o contrato anterior antes de criar um novo.');
      }
    }

    let contrato;
    if (input.id) {
      const { data, error } = await supa.from('contratos').update(contratoBase).eq('id', input.id).select().single();
      if (error) throw new Error('Erro ao atualizar contrato: ' + (error.message || JSON.stringify(error)));
      contrato = data;
      await supa.from('contrato_lojas').delete().eq('contrato_id', input.id);
    } else {
      // Remove campos null/undefined/vazios pra deixar o default do banco atuar (ex: id = gen_random_uuid())
      const payload = Object.fromEntries(Object.entries(contratoBase).filter(([_, v]) => v !== null && v !== undefined && v !== ''));
      const { data, error } = await supa.from('contratos').insert(payload).select().single();
      if (error) throw new Error('Erro ao criar contrato: ' + (error.message || JSON.stringify(error)));
      contrato = data;
    }
    if (!contrato || !contrato.id) throw new Error('Contrato salvo mas resposta vazia');
    if (lojas?.length) {
      const lojasMapeadas = lojas.map(codigo => ({ contrato_id: contrato.id, loja_id: parseInt(codigo, 10) }));
      const { error: errLojas } = await supa.from('contrato_lojas').insert(lojasMapeadas);
      if (errLojas) throw new Error('Erro ao vincular lojas ao contrato: ' + errLojas.message);
    }
    return contrato;
  }
}

export async function encerrarContrato(id, motivo, data_encerramento = new Date()) {
  return saveContrato({
    id,
    status: 'encerrado',
    motivo_encerramento: motivo,
    data_encerramento: fmtBR(data_encerramento)
  });
}

// ---------------------------------------------------------------------
// PROPOSTAS
// ---------------------------------------------------------------------
export async function getPropostas(statusFilter = 'ativas') {
  if (MOCK_MODE) {
    const store = loadStore();
    let lista = store.propostas;
    if (statusFilter === 'ativas') {
      lista = lista.filter(p => ['em_analise','aceita_aguardando_docs'].includes(p.status));
    } else if (statusFilter !== 'all') {
      lista = lista.filter(p => p.status === statusFilter);
    }
    // calcular R$/m²
    return lista.map(p => ({
      ...p,
      rs_por_m2: p.area_total ? (p.valor_aluguel / p.area_total) : null
    }));
  } else {
    const supa = await getSupabase();
    let q = supa.from('v_propostas_completo').select('*');
    if (statusFilter === 'ativas') q = q.in('status', ['em_analise','aceita_aguardando_docs']);
    else if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    return data;
  }
}

export async function getProposta(id) {
  if (MOCK_MODE) return (await getPropostas('all')).find(p => p.id === id);
  const supa = await getSupabase();
  const { data } = await supa.from('v_propostas_completo').select('*').eq('id', id).single();
  return data;
}

export async function saveProposta(input) {
  if (MOCK_MODE) {
    const store = loadStore();
    if (input.id) {
      const idx = store.propostas.findIndex(p => p.id === input.id);
      store.propostas[idx] = { ...store.propostas[idx], ...input };
    } else {
      input.id = nextId('p');
      input.status = input.status || 'em_analise';
      store.propostas.push(input);
    }
    saveStore(store);
    return input;
  } else {
    const supa = await getSupabase();
    const { lojas, id: _idIgnorado, ...base } = input;
    let prop;
    if (input.id) {
      const { data, error } = await supa.from('propostas').update(base).eq('id', input.id).select().single();
      if (error) throw new Error('Erro ao atualizar proposta: ' + error.message);
      prop = data;
      await supa.from('proposta_lojas').delete().eq('proposta_id', input.id);
    } else {
      const payload = Object.fromEntries(Object.entries(base).filter(([_, v]) => v !== null && v !== undefined && v !== ''));
      const { data, error } = await supa.from('propostas').insert(payload).select().single();
      if (error) throw new Error('Erro ao criar proposta: ' + error.message);
      prop = data;
    }
    if (!prop || !prop.id) throw new Error('Proposta salva mas resposta vazia');
    if (lojas?.length) {
      await supa.from('proposta_lojas').insert(lojas.map(codigo => ({ proposta_id: prop.id, loja_id: parseInt(codigo, 10) })));
    }
    return prop;
  }
}

// Converter proposta em contrato — copia campos e marca proposta como convertida
export async function converterPropostaEmContrato(propostaId, ajustes = {}) {
  const prop = await getProposta(propostaId);
  if (!prop) throw new Error('Proposta não encontrada');

  // Cria o contrato com dados da proposta + ajustes
  const novoContrato = {
    inquilino_id: prop.inquilino_id || ajustes.inquilino_id,
    data_assinatura: ajustes.data_assinatura || fmtBR(new Date()),
    data_inicio: ajustes.data_inicio || fmtBR(new Date()),
    prazo_meses: ajustes.prazo_meses || 60,
    valor_aluguel: prop.valor_aluguel,
    dia_vencimento: ajustes.dia_vencimento || 1,
    meses_carencia: prop.meses_carencia,
    indice_reajuste: ajustes.indice_reajuste || 'IGP-M',
    tipo_garantia: prop.tipo_garantia,
    detalhes_garantia: prop.detalhes_garantia,
    parcial: false,
    observacoes: 'Convertido da proposta de ' + prop.data_proposta + '. ' + (prop.observacoes || ''),
    lojas: prop.lojas,
    status: 'ativo',
    ...ajustes
  };

  const contrato = await saveContrato(novoContrato);

  // Marca proposta como convertida
  await saveProposta({
    id: propostaId,
    status: 'convertida_em_contrato',
    contrato_id: contrato.id,
    data_decisao: fmtBR(new Date())
  });

  return contrato;
}

// ---------------------------------------------------------------------
// LEADS (CRM) — clientes em estudo, antes da proposta formal
// ---------------------------------------------------------------------
export async function getLeads(statusFilter = 'ativos') {
  if (MOCK_MODE) {
    const store = loadStore();
    let lista = store.leads || [];
    if (statusFilter === 'ativos') {
      lista = lista.filter(l => ['interessado','visitou','em_analise'].includes(l.status));
    } else if (statusFilter !== 'todos') {
      lista = lista.filter(l => l.status === statusFilter);
    }
    return lista;
  }
  const supa = await getSupabase();
  let q = supa.from('v_leads_completo').select('*');
  if (statusFilter === 'ativos') q = q.in('status', ['interessado','visitou','em_analise']);
  else if (statusFilter !== 'todos') q = q.eq('status', statusFilter);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw new Error('Erro ao buscar leads: ' + error.message);
  return data || [];
}

export async function getLead(id) {
  if (MOCK_MODE) return (await getLeads('todos')).find(l => l.id === id);
  const supa = await getSupabase();
  const { data, error } = await supa.from('v_leads_completo').select('*').eq('id', id).single();
  if (error) throw new Error('Erro ao buscar lead: ' + error.message);
  return data;
}

export async function saveLead(input) {
  if (MOCK_MODE) {
    const store = loadStore();
    store.leads = store.leads || [];
    if (input.id) {
      const idx = store.leads.findIndex(l => l.id === input.id);
      store.leads[idx] = { ...store.leads[idx], ...input };
    } else {
      input.id = nextId('l');
      input.status = input.status || 'interessado';
      input.data_inicio = input.data_inicio || new Date().toISOString().slice(0,10);
      store.leads.push(input);
    }
    saveStore(store);
    return input;
  }
  const supa = await getSupabase();
  const { lojas, interacoes, id: _idIgnorado, qtd_interacoes, ultima_interacao_data, ...base } = input;

  let lead;
  if (input.id) {
    const { data, error } = await supa.from('leads').update(base).eq('id', input.id).select().single();
    if (error) throw new Error('Erro ao atualizar lead: ' + error.message);
    lead = data;
    await supa.from('lead_lojas').delete().eq('lead_id', input.id);
  } else {
    const payload = Object.fromEntries(Object.entries(base).filter(([_, v]) => v !== null && v !== undefined && v !== ''));
    const { data, error } = await supa.from('leads').insert(payload).select().single();
    if (error) throw new Error('Erro ao criar lead: ' + error.message);
    lead = data;
  }

  if (!lead || !lead.id) throw new Error('Lead salvo mas resposta vazia');

  if (lojas?.length) {
    const lojasMapeadas = lojas.map(codigo => ({ lead_id: lead.id, loja_id: parseInt(codigo, 10) }));
    const { error: errLojas } = await supa.from('lead_lojas').insert(lojasMapeadas);
    if (errLojas) throw new Error('Erro ao vincular lojas ao lead: ' + errLojas.message);
  }

  return lead;
}

export async function adicionarInteracao(leadId, { tipo = 'nota', conteudo, data = null }) {
  if (!conteudo?.trim()) throw new Error('Informe o conteúdo da interação');
  if (MOCK_MODE) {
    const store = loadStore();
    store.lead_interacoes = store.lead_interacoes || [];
    const inter = { id: nextId('i'), lead_id: leadId, tipo, conteudo, data: data || new Date().toISOString() };
    store.lead_interacoes.push(inter);
    saveStore(store);
    return inter;
  }
  const supa = await getSupabase();
  const payload = { lead_id: leadId, tipo, conteudo };
  if (data) payload.data = data;
  const { data: inserted, error } = await supa.from('lead_interacoes').insert(payload).select().single();
  if (error) throw new Error('Erro ao adicionar interação: ' + error.message);
  return inserted;
}

export async function deleteLead(id) {
  if (MOCK_MODE) {
    const store = loadStore();
    store.leads = (store.leads || []).filter(l => l.id !== id);
    saveStore(store);
    return;
  }
  const supa = await getSupabase();
  const { error } = await supa.from('leads').delete().eq('id', id);
  if (error) throw new Error('Erro ao excluir lead: ' + error.message);
}

export async function vincularLeadAProposta(leadId, propostaId) {
  if (MOCK_MODE) {
    return saveLead({ id: leadId, status: 'virou_proposta', proposta_id: propostaId, data_fim: new Date().toISOString().slice(0,10) });
  }
  const supa = await getSupabase();
  const { data, error } = await supa.from('leads').update({
    status: 'virou_proposta',
    proposta_id: propostaId,
    data_fim: new Date().toISOString().slice(0,10)
  }).eq('id', leadId).select().single();
  if (error) throw new Error('Erro ao vincular lead à proposta: ' + error.message);
  await adicionarInteracao(leadId, { tipo: 'mudanca_status', conteudo: 'Lead convertido em proposta formal.' });
  return data;
}


// ---------------------------------------------------------------------
// FINANCEIRO - Cobranças
// ---------------------------------------------------------------------
export async function getCobrancas(filtros) {
  if (MOCK_MODE) return [];
  const mes = filtros && filtros.mes;
  const status = filtros && filtros.status;
  const contrato_id = filtros && filtros.contrato_id;
  const supa = await getSupabase();
  let q = supa.from('v_cobrancas_completo').select('*');
  if (mes) {
    const inicio = mes + '-01';
    const fimDate = new Date(mes + '-01T00:00:00');
    fimDate.setMonth(fimDate.getMonth() + 1);
    const fimStr = fimDate.toISOString().slice(0, 10);
    q = q.gte('competencia', inicio).lt('competencia', fimStr);
  }
  if (status) q = q.eq('status', status);
  if (contrato_id) q = q.eq('contrato_id', contrato_id);
  const { data, error } = await q.order('vencimento', { ascending: true });
  if (error) throw new Error('Erro ao buscar cobrancas: ' + error.message);
  return data || [];
}

export async function gerarCobrancasDoMes(mes) {
  if (MOCK_MODE) return { qtd: 0 };
  const supa = await getSupabase();
  const mesRef = mes || new Date().toISOString().slice(0, 10);
  const { data, error } = await supa.rpc('gerar_cobrancas_do_mes', { mes_ref: mesRef });
  if (error) throw new Error('Erro ao gerar cobrancas: ' + error.message);
  return { qtd: data || 0 };
}

export async function marcarCobrancaPaga(cobrancaId, pagamento) {
  if (MOCK_MODE) return;
  const supa = await getSupabase();
  const payload = {
    status: 'paga',
    data_pagamento: pagamento.data_pagamento,
    valor_pago: pagamento.valor_pago,
    multa: pagamento.multa || 0,
    juros: pagamento.juros || 0,
    correcao_monetaria: pagamento.correcao || 0
  };
  if (pagamento.observacoes) payload.observacoes = pagamento.observacoes;
  const { error } = await supa.from('cobrancas').update(payload).eq('id', cobrancaId);
  if (error) throw new Error('Erro ao marcar como paga: ' + error.message);
}

export async function marcarCobrancaParcial(cobrancaId, pagamento) {
  if (MOCK_MODE) return;
  const supa = await getSupabase();
  const obs = (pagamento.observacoes || '') + ' [Pagamento parcial em desacordo com clausula 5.7]';
  const { error } = await supa.from('cobrancas').update({
    status: 'parcial',
    data_pagamento: pagamento.data_pagamento,
    valor_pago: pagamento.valor_pago,
    observacoes: obs
  }).eq('id', cobrancaId);
  if (error) throw new Error('Erro ao marcar parcial: ' + error.message);
}

export async function getInadimplencia() {
  if (MOCK_MODE) return [];
  const supa = await getSupabase();
  const { data, error } = await supa.from('v_inadimplencia').select('*').order('dias_atraso', { ascending: false });
  if (error) throw new Error('Erro ao buscar inadimplencia: ' + error.message);
  return data || [];
}

export async function atualizarStatusAtrasadas() {
  if (MOCK_MODE) return;
  const supa = await getSupabase();
  const hoje = new Date().toISOString().slice(0, 10);
  await supa.from('cobrancas').update({ status: 'atrasada' })
    .eq('status', 'pendente').lt('vencimento', hoje);
}

// ---------------------------------------------------------------------
// FINANCEIRO - Despesas e Fornecedores
// ---------------------------------------------------------------------
export async function getFornecedores(filtros) {
  if (MOCK_MODE) return [];
  const ativo = filtros && filtros.ativo !== undefined ? filtros.ativo : true;
  const supa = await getSupabase();
  let q = supa.from('fornecedores').select('*');
  if (ativo !== null) q = q.eq('ativo', ativo);
  const { data, error } = await q.order('nome');
  if (error) throw new Error('Erro ao buscar fornecedores: ' + error.message);
  return data || [];
}

export async function saveFornecedor(input) {
  if (MOCK_MODE) return input;
  const supa = await getSupabase();
  const { id, ...base } = input;
  const payload = Object.fromEntries(Object.entries(base).filter(([_, v]) => v !== null && v !== undefined && v !== ''));
  if (id) {
    const { data, error } = await supa.from('fornecedores').update(payload).eq('id', id).select().single();
    if (error) throw new Error('Erro ao atualizar fornecedor: ' + error.message);
    return data;
  }
  const { data, error } = await supa.from('fornecedores').insert(payload).select().single();
  if (error) throw new Error('Erro ao criar fornecedor: ' + error.message);
  return data;
}

export async function getDespesas(filtros) {
  if (MOCK_MODE) return [];
  const mes = filtros && filtros.mes;
  const status = filtros && filtros.status;
  const categoria = filtros && filtros.categoria;
  const supa = await getSupabase();
  let q = supa.from('despesas').select('*, fornecedores(nome, categoria)');
  if (mes) {
    const inicio = mes + '-01';
    const fimDate = new Date(mes + '-01T00:00:00');
    fimDate.setMonth(fimDate.getMonth() + 1);
    q = q.gte('competencia', inicio).lt('competencia', fimDate.toISOString().slice(0, 10));
  }
  if (status) q = q.eq('status', status);
  if (categoria) q = q.eq('categoria', categoria);
  const { data, error } = await q.order('vencimento', { ascending: true });
  if (error) throw new Error('Erro ao buscar despesas: ' + error.message);
  return data || [];
}

export async function saveDespesa(input) {
  if (MOCK_MODE) return input;
  const supa = await getSupabase();
  const { id, fornecedores: _fj, ...base } = input;
  const payload = Object.fromEntries(Object.entries(base).filter(([_, v]) => v !== null && v !== undefined && v !== ''));
  if (id) {
    const { data, error } = await supa.from('despesas').update(payload).eq('id', id).select().single();
    if (error) throw new Error('Erro ao atualizar despesa: ' + error.message);
    return data;
  }
  const { data, error } = await supa.from('despesas').insert(payload).select().single();
  if (error) throw new Error('Erro ao criar despesa: ' + error.message);
  return data;
}

export async function marcarDespesaPaga(despesaId, pagamento) {
  if (MOCK_MODE) return;
  const supa = await getSupabase();
  const { error } = await supa.from('despesas').update({
    status: 'paga',
    data_pagamento: pagamento.data_pagamento,
    valor_pago: pagamento.valor_pago
  }).eq('id', despesaId);
  if (error) throw new Error('Erro ao marcar despesa paga: ' + error.message);
}

// ---------------------------------------------------------------------
// FINANCEIRO - Reajustes e IGP-M
// ---------------------------------------------------------------------
export async function getReajustes(contrato_id) {
  if (MOCK_MODE) return [];
  const supa = await getSupabase();
  let q = supa.from('reajustes').select('*');
  if (contrato_id) q = q.eq('contrato_id', contrato_id);
  const { data, error } = await q.order('data_efetivacao', { ascending: false });
  if (error) throw new Error('Erro ao buscar reajustes: ' + error.message);
  return data || [];
}

export async function aplicarReajuste(reajuste) {
  if (MOCK_MODE) return;
  const supa = await getSupabase();
  const { data: reaj, error: errReaj } = await supa.from('reajustes').insert({
    contrato_id: reajuste.contrato_id,
    valor_anterior: reajuste.valor_anterior,
    valor_novo: reajuste.valor_novo,
    indice: reajuste.indice,
    variacao_pct: reajuste.variacao_pct,
    periodo_inicio: reajuste.periodo_inicio,
    periodo_fim: reajuste.periodo_fim,
    data_efetivacao: reajuste.data_efetivacao,
    observacoes: reajuste.observacoes || null,
    automatico: false
  }).select().single();
  if (errReaj) throw new Error('Erro ao registrar reajuste: ' + errReaj.message);
  const { error: errCont } = await supa.from('contratos').update({ valor_aluguel: reajuste.valor_novo }).eq('id', reajuste.contrato_id);
  if (errCont) throw new Error('Erro ao atualizar valor do contrato: ' + errCont.message);
  return reaj;
}

export async function getIGPMUltimosMeses(meses) {
  if (MOCK_MODE) return [];
  const supa = await getSupabase();
  const { data, error } = await supa.from('indices_economicos').select('*').eq('indice', 'IGP-M')
    .order('competencia', { ascending: false }).limit(meses || 12);
  if (error) throw new Error('Erro ao buscar IGP-M: ' + error.message);
  return data || [];
}

export async function buscarIGPMdoBCB(mesesParaTras) {
  const fim = new Date();
  const inicio = new Date(fim.getFullYear(), fim.getMonth() - (mesesParaTras || 24), 1);
  const fmt = (d) => String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados?formato=json&dataInicial=' + fmt(inicio) + '&dataFinal=' + fmt(fim);
  const r = await fetch(url);
  if (!r.ok) throw new Error('Erro ao buscar IGP-M na API do BCB: ' + r.status);
  const data = await r.json();
  if (MOCK_MODE) return data;
  const supa = await getSupabase();
  const registros = data.map(d => {
    const partes = d.data.split('/');
    return {
      indice: 'IGP-M',
      competencia: partes[2] + '-' + partes[1] + '-01',
      valor_mensal: parseFloat(d.valor)
    };
  });
  if (registros.length > 0) {
    await supa.from('indices_economicos').upsert(registros, { onConflict: 'indice,competencia' });
  }
  return registros;
}

export function calcularReajusteIGPM(igpmMeses12, valorAtual) {
  const fatorAcum = igpmMeses12.reduce((acc, m) => acc * (1 + Number(m.valor_mensal) / 100), 1);
  const variacaoPct = (fatorAcum - 1) * 100;
  const valorNovo = Math.round(valorAtual * fatorAcum * 100) / 100;
  return { variacaoPct, valorNovo, fatorAcum };
}

// ---------------------------------------------------------------------
// FINANCEIRO - DRE Mensal
// ---------------------------------------------------------------------
export async function getDREMensal(filtros) {
  if (MOCK_MODE) return [];
  const inicio = filtros && filtros.inicio;
  const fim = filtros && filtros.fim;
  const supa = await getSupabase();
  let q = supa.from('v_dre_mensal').select('*');
  if (inicio) q = q.gte('mes', inicio);
  if (fim) q = q.lte('mes', fim);
  const { data, error } = await q.order('mes', { ascending: false });
  if (error) throw new Error('Erro ao buscar DRE: ' + error.message);
  return data || [];
}

// ---------------------------------------------------------------------
// ARQUIVOS
// ---------------------------------------------------------------------
export async function getArquivos(entidade_tipo, entidade_id) {
  if (MOCK_MODE) {
    return loadStore().arquivos.filter(a => a.entidade_tipo === entidade_tipo && a.entidade_id === entidade_id);
  }
  const supa = await getSupabase();
  const { data } = await supa.from('arquivos').select('*').eq('entidade_tipo', entidade_tipo).eq('entidade_id', entidade_id);
  return data;
}
