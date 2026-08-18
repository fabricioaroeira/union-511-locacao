-- ===== ARQUIVO: PARA_GITHUB/sql/01-schema.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- UNION 511 APP — Schema do banco de dados
-- Rodar uma vez no SQL Editor do Supabase, em um projeto novo
-- =====================================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. LOJAS — as 52 unidades comerciais do empreendimento
-- ---------------------------------------------------------------------
CREATE TABLE lojas (
  id            smallint PRIMARY KEY,                 -- 1 a 52
  codigo        text NOT NULL UNIQUE,                  -- '01' a '52'
  area_privativa decimal(8,2),
  area_total    decimal(8,2),
  matricula     text,
  uso_interno   boolean NOT NULL DEFAULT false,        -- true para 02, 03, 49, 52
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. INQUILINOS — pessoas físicas ou jurídicas
-- ---------------------------------------------------------------------
CREATE TABLE inquilinos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL CHECK (tipo IN ('PF', 'PJ')),
  razao_social  text NOT NULL,
  nome_fantasia text,
  documento     text NOT NULL,                         -- CNPJ ou CPF
  segmento      text,
  email         text,
  telefone      text,
  endereco      text,
  observacoes   text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inquilinos_documento ON inquilinos(documento);
CREATE INDEX idx_inquilinos_ativo ON inquilinos(ativo);

-- ---------------------------------------------------------------------
-- 3. CONTRATOS — uma instância de locação assinada
-- ---------------------------------------------------------------------
CREATE TABLE contratos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquilino_id      uuid NOT NULL REFERENCES inquilinos(id) ON DELETE RESTRICT,
  numero            text,                               -- identificador interno opcional
  data_assinatura   date NOT NULL,
  data_inicio       date NOT NULL,
  prazo_meses       int NOT NULL CHECK (prazo_meses > 0),
  data_termino      date,  -- calculado via trigger calcular_data_termino logo abaixo
  valor_aluguel     decimal(10,2) NOT NULL CHECK (valor_aluguel >= 0),
  dia_vencimento    smallint NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  meses_carencia    int NOT NULL DEFAULT 0 CHECK (meses_carencia >= 0),
  indice_reajuste   text NOT NULL DEFAULT 'IGP-M' CHECK (indice_reajuste IN ('IGP-M', 'IPCA', 'INPC', 'outro')),
  tipo_garantia     text NOT NULL CHECK (tipo_garantia IN ('fianca_pj', 'fianca_pessoal', 'seguro_fianca', 'titulo_capitalizacao', 'sem_garantia')),
  detalhes_garantia text,
  parcial           boolean NOT NULL DEFAULT false,     -- ex: Evolve loja 19 parcial
  observacoes       text,
  status            text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado', 'rescindido')),
  data_encerramento date,
  motivo_encerramento text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contratos_inquilino ON contratos(inquilino_id);
CREATE INDEX idx_contratos_status ON contratos(status);
CREATE INDEX idx_contratos_data_termino ON contratos(data_termino);

-- ---------------------------------------------------------------------
-- 4. CONTRATO ↔ LOJAS (n:n)
-- Um contrato pode cobrir várias lojas (Pague Menos = 3, Bemfina = 3, etc)
-- ---------------------------------------------------------------------
CREATE TABLE contrato_lojas (
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  loja_id     smallint NOT NULL REFERENCES lojas(id),
  PRIMARY KEY (contrato_id, loja_id)
);

CREATE INDEX idx_contrato_lojas_loja ON contrato_lojas(loja_id);

-- ---------------------------------------------------------------------
-- 5. ADITIVOS — termos aditivos de contratos
-- ---------------------------------------------------------------------
CREATE TABLE aditivos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id       uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  numero            int NOT NULL,                       -- 1, 2, 3...
  data_assinatura   date NOT NULL,
  tipo              text NOT NULL CHECK (tipo IN ('inclusao_loja', 'exclusao_loja', 'troca_vencimento', 'reajuste_extra', 'substituicao_locatario', 'outro')),
  descricao         text NOT NULL,
  valor_novo        decimal(10,2),
  dia_vencimento_novo smallint,
  inquilino_novo_id uuid REFERENCES inquilinos(id),     -- para substituição de locatário
  observacoes       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aditivos_contrato ON aditivos(contrato_id);

-- ---------------------------------------------------------------------
-- 6. PROPOSTAS — pipeline de negociação
-- ---------------------------------------------------------------------
CREATE TABLE propostas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL DEFAULT 'em_analise' CHECK (status IN ('em_analise', 'aceita_aguardando_docs', 'convertida_em_contrato', 'recusada', 'expirada')),
  cliente_nome      text NOT NULL,
  inquilino_id      uuid REFERENCES inquilinos(id),     -- vincula se já existe ou após criar
  ramo              text,
  corretor          text,
  cv                text,                               -- código/referência do corretor
  data_proposta     date NOT NULL,
  area_total        decimal(8,2),
  valor_aluguel     decimal(10,2) NOT NULL,
  meses_carencia    int,
  prazo_opcoes      text,                               -- texto livre: '3 ou 5 anos a definir'
  tipo_garantia     text,
  detalhes_garantia text,
  observacoes       text,
  data_decisao      date,
  motivo_recusa     text,
  contrato_id       uuid REFERENCES contratos(id),      -- preenchido quando convertida
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_propostas_status ON propostas(status);
CREATE INDEX idx_propostas_data ON propostas(data_proposta);

-- ---------------------------------------------------------------------
-- 7. PROPOSTA ↔ LOJAS (n:n)
-- ---------------------------------------------------------------------
CREATE TABLE proposta_lojas (
  proposta_id uuid NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  loja_id     smallint NOT NULL REFERENCES lojas(id),
  PRIMARY KEY (proposta_id, loja_id)
);

CREATE INDEX idx_proposta_lojas_loja ON proposta_lojas(loja_id);

-- ---------------------------------------------------------------------
-- 8. ARQUIVOS — PDFs e demais documentos (storage no Supabase)
-- ---------------------------------------------------------------------
CREATE TABLE arquivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo   text NOT NULL CHECK (entidade_tipo IN ('contrato', 'aditivo', 'proposta', 'inquilino')),
  entidade_id     uuid NOT NULL,
  categoria       text CHECK (categoria IN ('contrato_assinado', 'aditivo', 'fianca', 'documentos_pessoais', 'comprovante', 'planta', 'outro')),
  nome_original   text NOT NULL,
  storage_path    text NOT NULL,                        -- bucket/file no Supabase Storage
  tamanho_bytes   bigint,
  mime_type       text,
  uploaded_by     uuid REFERENCES auth.users(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_arquivos_entidade ON arquivos(entidade_tipo, entidade_id);

-- ---------------------------------------------------------------------
-- 9. VAGAS DE GARAGEM (80 vagas comerciais)
-- ---------------------------------------------------------------------
CREATE TABLE vagas (
  codigo      text PRIMARY KEY,                         -- '08C', '09C', '77C'
  tipo        text NOT NULL DEFAULT 'comercial' CHECK (tipo IN ('comercial', 'uso_comum', 'reservada')),
  contrato_id uuid REFERENCES contratos(id),            -- a qual contrato está vinculada
  observacoes text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vagas_contrato ON vagas(contrato_id);

-- ---------------------------------------------------------------------
-- 10. PERFIS — estende auth.users do Supabase
-- ---------------------------------------------------------------------
CREATE TABLE perfis (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  papel      text NOT NULL DEFAULT 'visualizador' CHECK (papel IN ('admin', 'gestor', 'corretor', 'visualizador')),
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 11. HISTÓRICO — log de mudanças (auditoria)
-- ---------------------------------------------------------------------
CREATE TABLE historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL,
  entidade_id   uuid NOT NULL,
  acao          text NOT NULL CHECK (acao IN ('criado', 'editado', 'encerrado', 'rescindido', 'convertido', 'aceito', 'recusado')),
  dados_antes   jsonb,
  dados_depois  jsonb,
  user_id       uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_entidade ON historico(entidade_tipo, entidade_id);
CREATE INDEX idx_historico_created ON historico(created_at DESC);

-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Função para calcular data_termino automaticamente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calcular_data_termino()
RETURNS TRIGGER AS $$
BEGIN
  NEW.data_termino = NEW.data_inicio + (NEW.prazo_meses * INTERVAL '1 month');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contratos_data_termino
  BEFORE INSERT OR UPDATE OF data_inicio, prazo_meses ON contratos
  FOR EACH ROW EXECUTE FUNCTION calcular_data_termino();

-- TRIGGERS — manter updated_at automático
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lojas_upd       BEFORE UPDATE ON lojas       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inquilinos_upd  BEFORE UPDATE ON inquilinos  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contratos_upd   BEFORE UPDATE ON contratos   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_propostas_upd   BEFORE UPDATE ON propostas   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_perfis_upd      BEFORE UPDATE ON perfis      FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ===== ARQUIVO: PARA_GITHUB/sql/04-views.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- UNION 511 APP — Views para KPIs e listagens otimizadas
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_lojas_status: status atual de cada loja (substitui occupiedData)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_lojas_status AS
SELECT
  l.id,
  l.codigo,
  l.area_privativa,
  l.area_total,
  l.uso_interno,
  CASE
    WHEN l.uso_interno THEN 'uso_interno'
    WHEN EXISTS (
      SELECT 1 FROM contrato_lojas cl
      JOIN contratos c ON c.id = cl.contrato_id
      WHERE cl.loja_id = l.id AND c.status = 'ativo'
    ) THEN 'ocupada'
    WHEN EXISTS (
      SELECT 1 FROM proposta_lojas pl
      JOIN propostas p ON p.id = pl.proposta_id
      WHERE pl.loja_id = l.id AND p.status = 'aceita_aguardando_docs'
    ) THEN 'proposta_aceita'
    WHEN EXISTS (
      SELECT 1 FROM proposta_lojas pl
      JOIN propostas p ON p.id = pl.proposta_id
      WHERE pl.loja_id = l.id AND p.status = 'em_analise'
    ) THEN 'proposta_analise'
    ELSE 'disponivel'
  END AS status,
  (
    SELECT i.nome_fantasia
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    JOIN inquilinos i ON i.id = c.inquilino_id
    WHERE cl.loja_id = l.id AND c.status = 'ativo'
    LIMIT 1
  ) AS inquilino_atual,
  (
    SELECT c.parcial
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    WHERE cl.loja_id = l.id AND c.status = 'ativo'
    LIMIT 1
  ) AS parcial
FROM lojas l;

-- ---------------------------------------------------------------------
-- v_contratos_completo: contratos ativos com inquilino e lojas agregadas
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_contratos_completo AS
SELECT
  c.id,
  c.numero,
  c.inquilino_id,
  i.tipo                AS inquilino_tipo,
  i.razao_social,
  i.nome_fantasia,
  i.documento,
  i.segmento,
  c.data_assinatura,
  c.data_inicio,
  c.prazo_meses,
  c.data_termino,
  c.valor_aluguel,
  c.dia_vencimento,
  c.meses_carencia,
  c.indice_reajuste,
  c.tipo_garantia,
  c.detalhes_garantia,
  c.parcial,
  c.observacoes,
  c.status,
  c.data_encerramento,
  c.motivo_encerramento,
  (
    SELECT array_agg(l.codigo ORDER BY l.id)
    FROM contrato_lojas cl
    JOIN lojas l ON l.id = cl.loja_id
    WHERE cl.contrato_id = c.id
  ) AS lojas,
  (
    SELECT count(*) FROM contrato_lojas WHERE contrato_id = c.id
  ) AS qtde_lojas,
  (
    SELECT count(*) FROM vagas WHERE contrato_id = c.id
  ) AS qtde_vagas,
  c.created_at,
  c.updated_at
FROM contratos c
JOIN inquilinos i ON i.id = c.inquilino_id;

-- ---------------------------------------------------------------------
-- v_propostas_completo: propostas com lojas agregadas
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_propostas_completo AS
SELECT
  p.*,
  (
    SELECT array_agg(l.codigo ORDER BY l.id)
    FROM proposta_lojas pl
    JOIN lojas l ON l.id = pl.loja_id
    WHERE pl.proposta_id = p.id
  ) AS lojas,
  CASE
    WHEN p.area_total > 0 THEN p.valor_aluguel / p.area_total
    ELSE NULL
  END AS rs_por_m2
FROM propostas p;

-- ---------------------------------------------------------------------
-- v_kpis: indicadores agregados para o topo do dashboard
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpis AS
SELECT
  (SELECT count(*) FROM lojas)                                                   AS total_lojas,
  (SELECT count(*) FROM lojas WHERE uso_interno)                                 AS lojas_internas,
  (SELECT count(*) FROM lojas WHERE NOT uso_interno)                             AS lojas_locaveis,
  (
    SELECT count(DISTINCT cl.loja_id)
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    WHERE c.status = 'ativo'
  )                                                                              AS lojas_ocupadas,
  (
    SELECT count(DISTINCT c.inquilino_id)
    FROM contratos c
    WHERE c.status = 'ativo'
  )                                                                              AS inquilinos_ativos,
  (
    SELECT coalesce(sum(valor_aluguel), 0)
    FROM contratos
    WHERE status = 'ativo'
  )                                                                              AS receita_cheia_mes,
  (
    SELECT count(*)
    FROM propostas
    WHERE status IN ('em_analise', 'aceita_aguardando_docs')
  )                                                                              AS propostas_ativas,
  (SELECT count(*) FROM vagas WHERE contrato_id IS NOT NULL)                     AS vagas_ocupadas,
  (SELECT count(*) FROM vagas WHERE tipo = 'comercial')                          AS vagas_comerciais_total;

-- ---------------------------------------------------------------------
-- v_proximos_vencimentos: contratos ordenados por data de término
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_proximos_vencimentos AS
SELECT
  c.id,
  i.nome_fantasia,
  (
    SELECT string_agg(l.codigo, ', ' ORDER BY l.id)
    FROM contrato_lojas cl
    JOIN lojas l ON l.id = cl.loja_id
    WHERE cl.contrato_id = c.id
  )                                                       AS lojas,
  c.data_assinatura,
  c.data_inicio,
  c.data_termino,
  c.prazo_meses,
  extract(month from age(c.data_termino, current_date)) +
  12 * extract(year from age(c.data_termino, current_date)) AS meses_restantes
FROM contratos c
JOIN inquilinos i ON i.id = c.inquilino_id
WHERE c.status = 'ativo'
ORDER BY c.data_termino;


-- ===== ARQUIVO: PARA_GITHUB/sql/05-rls-policies.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- UNION 511 APP — Row Level Security (RLS) policies
-- =====================================================================
-- Papéis:
--   admin        → tudo
--   gestor       → CRUD em tudo, exceto excluir contratos vigentes
--   corretor     → ler tudo, criar/editar propostas; não vê receita total
--   visualizador → só leitura
-- =====================================================================

-- Função helper: papel do usuário atual
CREATE OR REPLACE FUNCTION user_papel() RETURNS text AS $$
  SELECT papel FROM perfis WHERE user_id = auth.uid() AND ativo = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Função helper: é admin ou gestor
CREATE OR REPLACE FUNCTION is_gestor_or_admin() RETURNS boolean AS $$
  SELECT user_papel() IN ('admin', 'gestor')
$$ LANGUAGE sql STABLE;

-- Função helper: é qualquer usuário ativo (admin/gestor/corretor/visualizador)
CREATE OR REPLACE FUNCTION is_authenticated_active() RETURNS boolean AS $$
  SELECT user_papel() IS NOT NULL
$$ LANGUAGE sql STABLE;

-- =====================================================================
-- ENABLE RLS em todas as tabelas
-- =====================================================================
ALTER TABLE lojas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquilinos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrato_lojas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aditivos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE propostas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposta_lojas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE arquivos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vagas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico       ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- POLICIES — LOJAS (cadastro estável, só admin/gestor edita)
-- =====================================================================
CREATE POLICY "lojas_read" ON lojas FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "lojas_write" ON lojas FOR ALL TO authenticated
  USING (is_gestor_or_admin())
  WITH CHECK (is_gestor_or_admin());

-- =====================================================================
-- POLICIES — INQUILINOS
-- =====================================================================
CREATE POLICY "inquilinos_read" ON inquilinos FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "inquilinos_write" ON inquilinos FOR ALL TO authenticated
  USING (is_gestor_or_admin())
  WITH CHECK (is_gestor_or_admin());

-- =====================================================================
-- POLICIES — CONTRATOS (corretor lê, só admin/gestor escreve)
-- =====================================================================
CREATE POLICY "contratos_read" ON contratos FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "contratos_write" ON contratos FOR ALL TO authenticated
  USING (is_gestor_or_admin())
  WITH CHECK (is_gestor_or_admin());

CREATE POLICY "contrato_lojas_read" ON contrato_lojas FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "contrato_lojas_write" ON contrato_lojas FOR ALL TO authenticated
  USING (is_gestor_or_admin())
  WITH CHECK (is_gestor_or_admin());

CREATE POLICY "aditivos_read" ON aditivos FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "aditivos_write" ON aditivos FOR ALL TO authenticated
  USING (is_gestor_or_admin())
  WITH CHECK (is_gestor_or_admin());

-- =====================================================================
-- POLICIES — PROPOSTAS (corretor pode criar/editar)
-- =====================================================================
CREATE POLICY "propostas_read" ON propostas FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "propostas_write" ON propostas FOR ALL TO authenticated
  USING (user_papel() IN ('admin', 'gestor', 'corretor'))
  WITH CHECK (user_papel() IN ('admin', 'gestor', 'corretor'));

CREATE POLICY "proposta_lojas_read" ON proposta_lojas FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "proposta_lojas_write" ON proposta_lojas FOR ALL TO authenticated
  USING (user_papel() IN ('admin', 'gestor', 'corretor'))
  WITH CHECK (user_papel() IN ('admin', 'gestor', 'corretor'));

-- =====================================================================
-- POLICIES — ARQUIVOS (mesmo nível dos contratos/propostas)
-- =====================================================================
CREATE POLICY "arquivos_read" ON arquivos FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "arquivos_write" ON arquivos FOR ALL TO authenticated
  USING (user_papel() IN ('admin', 'gestor', 'corretor'))
  WITH CHECK (user_papel() IN ('admin', 'gestor', 'corretor'));

-- =====================================================================
-- POLICIES — VAGAS
-- =====================================================================
CREATE POLICY "vagas_read" ON vagas FOR SELECT TO authenticated
  USING (is_authenticated_active());
CREATE POLICY "vagas_write" ON vagas FOR ALL TO authenticated
  USING (is_gestor_or_admin())
  WITH CHECK (is_gestor_or_admin());

-- =====================================================================
-- POLICIES — PERFIS (usuário lê o próprio; só admin gerencia)
-- =====================================================================
CREATE POLICY "perfis_read_self" ON perfis FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_papel() = 'admin');
CREATE POLICY "perfis_write_admin" ON perfis FOR ALL TO authenticated
  USING (user_papel() = 'admin')
  WITH CHECK (user_papel() = 'admin');

-- =====================================================================
-- POLICIES — HISTÓRICO (só leitura para auditoria)
-- =====================================================================
CREATE POLICY "historico_read" ON historico FOR SELECT TO authenticated
  USING (is_gestor_or_admin());
-- INSERT é feito por funções/triggers; nada de DELETE/UPDATE direto


-- ===== ARQUIVO: SQL_CRM_LEADS.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- CRM de Leads — Union 511
-- Rode este SQL UMA VEZ no Supabase SQL Editor
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela LEADS — clientes em estudo / em estágios pré-proposta
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome    text NOT NULL,
  empresa         text,
  ramo_atividade  text,
  corretor        text,
  status          text NOT NULL DEFAULT 'interessado'
                  CHECK (status IN ('interessado', 'visitou', 'em_analise', 'virou_proposta', 'desistiu')),
  data_inicio     date NOT NULL DEFAULT current_date,
  data_fim        date,                              -- preenchido quando vira proposta ou desiste
  proposta_id     uuid REFERENCES propostas(id) ON DELETE SET NULL,
  motivo_desistencia text,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_data_inicio ON leads(data_inicio DESC);

-- ---------------------------------------------------------------------
-- 2. Tabela LEAD_LOJAS — lojas de interesse de cada lead (n:n)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_lojas (
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  loja_id smallint NOT NULL REFERENCES lojas(id),
  PRIMARY KEY (lead_id, loja_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_lojas_loja ON lead_lojas(loja_id);

-- ---------------------------------------------------------------------
-- 3. Tabela LEAD_INTERACOES — timeline de interações por lead
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_interacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  data        timestamptz NOT NULL DEFAULT now(),
  tipo        text NOT NULL DEFAULT 'nota'
              CHECK (tipo IN ('nota', 'visita', 'ligacao', 'email', 'mudanca_status', 'reuniao')),
  conteudo    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_interacoes_lead ON lead_interacoes(lead_id, data DESC);

-- ---------------------------------------------------------------------
-- 4. View completa — junta leads + lojas + interações pra consulta fácil
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_leads_completo AS
SELECT
  l.id,
  l.cliente_nome,
  l.empresa,
  l.ramo_atividade,
  l.corretor,
  l.status,
  l.data_inicio,
  l.data_fim,
  l.proposta_id,
  l.motivo_desistencia,
  l.observacoes,
  l.created_at,
  l.updated_at,
  COALESCE(ll.lojas, ARRAY[]::text[]) AS lojas,
  COALESCE(li.interacoes, '[]'::jsonb) AS interacoes,
  COALESCE(li.qtd_interacoes, 0) AS qtd_interacoes,
  li.ultima_interacao_data
FROM leads l
LEFT JOIN LATERAL (
  SELECT array_agg(lpad(loja_id::text, 2, '0') ORDER BY loja_id) AS lojas
  FROM lead_lojas
  WHERE lead_id = l.id
) ll ON true
LEFT JOIN LATERAL (
  SELECT
    jsonb_agg(jsonb_build_object(
      'id', id,
      'data', data,
      'tipo', tipo,
      'conteudo', conteudo
    ) ORDER BY data DESC) AS interacoes,
    COUNT(*) AS qtd_interacoes,
    MAX(data) AS ultima_interacao_data
  FROM lead_interacoes
  WHERE lead_id = l.id
) li ON true;

-- ---------------------------------------------------------------------
-- 5. RLS + GRANTS
-- ---------------------------------------------------------------------
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_interacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_authenticated_all" ON leads;
CREATE POLICY "leads_authenticated_all" ON leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lead_lojas_authenticated_all" ON lead_lojas;
CREATE POLICY "lead_lojas_authenticated_all" ON lead_lojas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lead_interacoes_authenticated_all" ON lead_interacoes;
CREATE POLICY "lead_interacoes_authenticated_all" ON lead_interacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_lojas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_interacoes TO authenticated;
GRANT SELECT ON v_leads_completo TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Trigger para atualizar updated_at automaticamente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_set_updated_at ON leads;
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION trg_leads_updated_at();

-- ---------------------------------------------------------------------
-- 7. Validação
-- ---------------------------------------------------------------------
SELECT 'leads' AS tabela, count(*) AS registros FROM leads
UNION ALL SELECT 'lead_lojas', count(*) FROM lead_lojas
UNION ALL SELECT 'lead_interacoes', count(*) FROM lead_interacoes;


-- ===== ARQUIVO: SQL_FINANCEIRO.sql (DO removidos: 1, INSERTs removidos: 3) =====
-- =====================================================================
-- MÓDULO FINANCEIRO - Union 511
-- Rode este SQL UMA VEZ no Supabase SQL Editor (depois do SQL_CRM_LEADS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FERIADOS NACIONAIS (cache simples)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feriados (
  data    date PRIMARY KEY,
  nome    text NOT NULL,
  fixo    boolean NOT NULL DEFAULT true
);
-- [INSERT seed removido]

-- ---------------------------------------------------------------------
-- 2. FUNÇÃO: próximo dia útil (pula sáb, dom e feriados)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dia_util_seguinte(d date) RETURNS date AS $$
DECLARE
  result date := d;
BEGIN
  WHILE EXTRACT(DOW FROM result) IN (0, 6)  -- 0=domingo, 6=sábado
        OR EXISTS (SELECT 1 FROM feriados WHERE data = result)
  LOOP
    result := result + 1;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 3. ÍNDICES ECONÔMICOS (cache IGP-M e IPCA da API BCB)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indices_economicos (
  id                    serial PRIMARY KEY,
  indice                text NOT NULL CHECK (indice IN ('IGP-M', 'IPCA', 'INPC')),
  competencia           date NOT NULL,
  valor_mensal          decimal(10,6) NOT NULL,
  valor_acumulado_12m   decimal(10,6),
  fonte                 text NOT NULL DEFAULT 'BCB-SGS',
  data_consulta         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indice, competencia)
);

CREATE INDEX IF NOT EXISTS idx_indices_comp ON indices_economicos(indice, competencia DESC);

-- ---------------------------------------------------------------------
-- 4. COBRANÇAS (uma por mês por contrato)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cobrancas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id         uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  competencia         date NOT NULL,
  vencimento          date NOT NULL,
  valor_cheio         decimal(12,2) NOT NULL,
  desconto_concedido  decimal(12,2) NOT NULL DEFAULT 0,
  desconto_descricao  text,
  valor_devido        decimal(12,2) NOT NULL,
  status              text NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','paga','atrasada','parcial','cancelada')),
  data_pagamento      date,
  valor_pago          decimal(12,2),
  multa               decimal(12,2) DEFAULT 0,
  juros               decimal(12,2) DEFAULT 0,
  correcao_monetaria  decimal(12,2) DEFAULT 0,
  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_cobrancas_contrato ON cobrancas(contrato_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_competencia ON cobrancas(competencia DESC);
CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON cobrancas(status);
CREATE INDEX IF NOT EXISTS idx_cobrancas_vencimento ON cobrancas(vencimento);

-- ---------------------------------------------------------------------
-- 5. REAJUSTES (histórico)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reajustes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id         uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  data_efetivacao     date NOT NULL,
  valor_anterior      decimal(12,2) NOT NULL,
  valor_novo          decimal(12,2) NOT NULL,
  indice              text NOT NULL,
  variacao_pct        decimal(10,4) NOT NULL,
  periodo_inicio      date NOT NULL,
  periodo_fim         date NOT NULL,
  automatico          boolean NOT NULL DEFAULT true,
  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reajustes_contrato ON reajustes(contrato_id, data_efetivacao DESC);

-- ---------------------------------------------------------------------
-- 6. FORNECEDORES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fornecedores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL,
  documento    text,
  categoria    text,
  email        text,
  telefone     text,
  observacoes  text,
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_categoria ON fornecedores(categoria);

-- ---------------------------------------------------------------------
-- 7. DESPESAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS despesas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   uuid REFERENCES fornecedores(id),
  categoria       text NOT NULL
                  CHECK (categoria IN ('iptu','condominio','manutencao','reforma',
                                       'honorarios','comissao','administrativa',
                                       'seguro','tributo','outro')),
  descricao       text NOT NULL,
  competencia     date NOT NULL,
  vencimento      date NOT NULL,
  valor           decimal(12,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','paga','cancelada')),
  data_pagamento  date,
  valor_pago      decimal(12,2),
  loja_id         smallint REFERENCES lojas(id),
  contrato_id     uuid REFERENCES contratos(id),
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despesas_competencia ON despesas(competencia DESC);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria ON despesas(categoria);
CREATE INDEX IF NOT EXISTS idx_despesas_status ON despesas(status);

-- ---------------------------------------------------------------------
-- 8. SUSPENSÃO DE DESCONTO (controle de quem perdeu o desconto por atraso)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS descontos_suspensos (
  contrato_id     uuid PRIMARY KEY REFERENCES contratos(id) ON DELETE CASCADE,
  data_suspensao  date NOT NULL DEFAULT current_date,
  motivo          text NOT NULL DEFAULT 'Atraso no pagamento (cláusula 5.8)',
  ativo           boolean NOT NULL DEFAULT true,
  reativado_em    date,
  reativado_por   text
);

-- ---------------------------------------------------------------------
-- 9. VIEW: cobranças completas com info do contrato/inquilino
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_cobrancas_completo AS
SELECT
  c.*,
  ct.inquilino_id,
  i.razao_social,
  i.nome_fantasia,
  ct.valor_aluguel  AS valor_aluguel_atual,
  ct.dia_vencimento,
  ct.indice_reajuste,
  (SELECT array_agg(lpad(loja_id::text, 2, '0') ORDER BY loja_id)
   FROM contrato_lojas WHERE contrato_id = c.contrato_id) AS lojas,
  CASE
    WHEN c.status IN ('paga','cancelada') THEN 0
    WHEN c.vencimento < current_date THEN current_date - c.vencimento
    ELSE 0
  END AS dias_atraso
FROM cobrancas c
JOIN contratos ct ON ct.id = c.contrato_id
JOIN inquilinos i ON i.id = ct.inquilino_id;

-- ---------------------------------------------------------------------
-- 10. VIEW: inadimplência com multa/juros/correção calculados
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_inadimplencia AS
WITH atrasadas AS (
  SELECT
    c.*,
    ct.inquilino_id,
    i.razao_social,
    i.nome_fantasia,
    (current_date - c.vencimento) AS dias_atraso,
    -- Multa de 10% sobre o débito (cláusula 5.8 ii)
    ROUND(c.valor_devido * 0.10, 2) AS multa_calc,
    -- Juros 1% ao mês pro rata die (cláusula 5.8 iii)
    ROUND(c.valor_devido * 0.01 * (current_date - c.vencimento) / 30.0, 2) AS juros_calc
  FROM cobrancas c
  JOIN contratos ct ON ct.id = c.contrato_id
  JOIN inquilinos i ON i.id = ct.inquilino_id
  WHERE c.status IN ('pendente','atrasada','parcial')
    AND c.vencimento < current_date
    AND c.valor_devido > COALESCE(c.valor_pago, 0)
)
SELECT
  a.*,
  (a.valor_devido - COALESCE(a.valor_pago, 0)) AS saldo_devedor,
  (a.valor_devido - COALESCE(a.valor_pago, 0) + a.multa_calc + a.juros_calc) AS total_atualizado
FROM atrasadas a;

-- ---------------------------------------------------------------------
-- 11. VIEW: DRE mensal (receita - despesa)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_dre_mensal AS
WITH receita AS (
  SELECT
    date_trunc('month', competencia)::date AS mes,
    SUM(valor_cheio) AS receita_cheia,
    SUM(desconto_concedido) AS descontos_concedidos,
    SUM(valor_devido) AS receita_liquida_prevista,
    SUM(CASE WHEN status = 'paga' THEN COALESCE(valor_pago, valor_devido) ELSE 0 END) AS receita_recebida
  FROM cobrancas
  GROUP BY 1
),
despesa AS (
  SELECT
    date_trunc('month', competencia)::date AS mes,
    SUM(valor) AS despesa_total,
    SUM(CASE WHEN status = 'paga' THEN COALESCE(valor_pago, valor) ELSE 0 END) AS despesa_paga
  FROM despesas
  GROUP BY 1
)
SELECT
  COALESCE(r.mes, d.mes) AS mes,
  COALESCE(r.receita_cheia, 0) AS receita_cheia,
  COALESCE(r.descontos_concedidos, 0) AS descontos_concedidos,
  COALESCE(r.receita_liquida_prevista, 0) AS receita_liquida_prevista,
  COALESCE(r.receita_recebida, 0) AS receita_recebida,
  COALESCE(d.despesa_total, 0) AS despesa_total,
  COALESCE(d.despesa_paga, 0) AS despesa_paga,
  COALESCE(r.receita_recebida, 0) - COALESCE(d.despesa_paga, 0) AS resultado_caixa,
  COALESCE(r.receita_liquida_prevista, 0) - COALESCE(d.despesa_total, 0) AS resultado_previsto
FROM receita r
FULL OUTER JOIN despesa d ON d.mes = r.mes
ORDER BY mes DESC;

-- ---------------------------------------------------------------------
-- 12. FUNÇÃO: gera cobranças do mês para todos os contratos ativos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gerar_cobrancas_do_mes(mes_ref date)
RETURNS integer AS $$
DECLARE
  mes_inicio date := date_trunc('month', mes_ref)::date;
  contrato_rec RECORD;
  meses_desde_inicio integer;
  vencimento_calc date;
  desconto_calc decimal(12,2);
  desconto_desc text;
  suspenso boolean;
  qtd_criadas integer := 0;
BEGIN
  FOR contrato_rec IN
    SELECT id, inquilino_id, data_inicio, valor_aluguel, dia_vencimento, meses_carencia
    FROM contratos
    WHERE status = 'ativo'
      AND data_inicio <= mes_inicio
  LOOP
    -- Pula se já existe cobrança pra esse contrato neste mês
    IF EXISTS (
      SELECT 1 FROM cobrancas
      WHERE contrato_id = contrato_rec.id AND competencia = mes_inicio
    ) THEN
      CONTINUE;
    END IF;

    -- Calcula meses desde início do contrato
    meses_desde_inicio := (EXTRACT(YEAR FROM age(mes_inicio, contrato_rec.data_inicio)) * 12
                          + EXTRACT(MONTH FROM age(mes_inicio, contrato_rec.data_inicio)))::integer + 1;

    -- Verifica se desconto está suspenso
    suspenso := EXISTS (SELECT 1 FROM descontos_suspensos WHERE contrato_id = contrato_rec.id AND ativo = true);

    -- Carência: pula os primeiros N meses, exceto se desconto está suspenso
    IF meses_desde_inicio <= COALESCE(contrato_rec.meses_carencia, 0) AND NOT suspenso THEN
      desconto_calc := contrato_rec.valor_aluguel;
      desconto_desc := 'Carência contratual mês ' || meses_desde_inicio || '/' || contrato_rec.meses_carencia;
    ELSE
      desconto_calc := 0;
      desconto_desc := NULL;
    END IF;

    -- Vencimento: dia_vencimento do mês, ajustado pra dia útil
    vencimento_calc := dia_util_seguinte(
      make_date(EXTRACT(YEAR FROM mes_inicio)::int,
                EXTRACT(MONTH FROM mes_inicio)::int,
                LEAST(COALESCE(contrato_rec.dia_vencimento, 1),
                      EXTRACT(DAY FROM (mes_inicio + INTERVAL '1 month - 1 day'))::int))
    );
-- [INSERT seed removido]

    qtd_criadas := qtd_criadas + 1;
  END LOOP;

  RETURN qtd_criadas;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 13. TRIGGER: suspende desconto automaticamente quando cobrança atrasa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_suspender_desconto_atraso() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'atrasada' AND OLD.status != 'atrasada' THEN
-- [INSERT seed removido]
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cobrancas_suspender_desconto ON cobrancas;
CREATE TRIGGER cobrancas_suspender_desconto
  AFTER UPDATE OF status ON cobrancas
  FOR EACH ROW EXECUTE FUNCTION trg_suspender_desconto_atraso();

-- ---------------------------------------------------------------------
-- 14. TRIGGER: updated_at automático
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cobrancas_updated_at ON cobrancas;
CREATE TRIGGER cobrancas_updated_at BEFORE UPDATE ON cobrancas
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS despesas_updated_at ON despesas;
CREATE TRIGGER despesas_updated_at BEFORE UPDATE ON despesas
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS fornecedores_updated_at ON fornecedores;
CREATE TRIGGER fornecedores_updated_at BEFORE UPDATE ON fornecedores
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ---------------------------------------------------------------------
-- 15. RLS + GRANTS
-- ---------------------------------------------------------------------
ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE descontos_suspensos ENABLE ROW LEVEL SECURITY;
ALTER TABLE indices_economicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cobrancas_auth_all" ON cobrancas;
CREATE POLICY "cobrancas_auth_all" ON cobrancas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "reajustes_auth_all" ON reajustes;
CREATE POLICY "reajustes_auth_all" ON reajustes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fornecedores_auth_all" ON fornecedores;
CREATE POLICY "fornecedores_auth_all" ON fornecedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "despesas_auth_all" ON despesas;
CREATE POLICY "despesas_auth_all" ON despesas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "descontos_susp_auth_all" ON descontos_suspensos;
CREATE POLICY "descontos_susp_auth_all" ON descontos_suspensos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "indices_auth_all" ON indices_economicos;
CREATE POLICY "indices_auth_all" ON indices_economicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "feriados_auth_read" ON feriados;
CREATE POLICY "feriados_auth_read" ON feriados FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON cobrancas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reajustes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fornecedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON despesas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON descontos_suspensos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indices_economicos TO authenticated;
GRANT SELECT ON feriados TO authenticated;
GRANT SELECT ON v_cobrancas_completo TO authenticated;
GRANT SELECT ON v_inadimplencia TO authenticated;
GRANT SELECT ON v_dre_mensal TO authenticated;
GRANT EXECUTE ON FUNCTION dia_util_seguinte(date) TO authenticated;
GRANT EXECUTE ON FUNCTION gerar_cobrancas_do_mes(date) TO authenticated;

-- ---------------------------------------------------------------------
-- 16. SEED: gera cobranças retroativas para todos os contratos ativos
-- desde a data de início até o mês atual
-- ---------------------------------------------------------------------
-- [DO block removido no seed]

-- ---------------------------------------------------------------------
-- 17. Validação
-- ---------------------------------------------------------------------
SELECT 'cobrancas' AS tabela, count(*) AS registros FROM cobrancas
UNION ALL SELECT 'reajustes', count(*) FROM reajustes
UNION ALL SELECT 'fornecedores', count(*) FROM fornecedores
UNION ALL SELECT 'despesas', count(*) FROM despesas
UNION ALL SELECT 'feriados', count(*) FROM feriados
UNION ALL SELECT 'indices_economicos', count(*) FROM indices_economicos;


-- ===== ARQUIVO: SQL_ALERTAS.sql (DO removidos: 0, INSERTs removidos: 1) =====
-- =====================================================================
-- SISTEMA DE ALERTAS — Union 511
-- Rode este SQL UMA VEZ no Supabase SQL Editor (Database → SQL Editor → New query)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DOCUMENTOS DE CONTRATO (seguros, certidões, vistorias, AVCB...)
--    Cada contrato pode ter N documentos com tipo e data de validade
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos_contrato (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id     uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN (
    'seguro_fianca',
    'seguro_incendio',
    'certidao_negativa_federal',
    'certidao_negativa_municipal',
    'certidao_negativa_estadual',
    'certidao_trabalhista',
    'vistoria_inicial',
    'vistoria_final',
    'laudo_avcb',
    'alvara_funcionamento',
    'outros'
  )),
  descricao       text,
  numero          text,
  data_emissao    date,
  data_validade   date NOT NULL,
  arquivo_url     text,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_contrato  ON documentos_contrato(contrato_id);
CREATE INDEX IF NOT EXISTS idx_doc_validade  ON documentos_contrato(data_validade);

ALTER TABLE documentos_contrato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_auth_all ON documentos_contrato;
CREATE POLICY doc_auth_all ON documentos_contrato
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 2. AÇÕES DO USUÁRIO sobre alertas (lido / resolvido / adiado)
--    Alerta é IDENTIFICADO por hash(tipo|entidade|data) — assim quando
--    a data muda (ex: novo reajuste no ano seguinte), volta a aparecer.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alertas_acoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_hash   text NOT NULL UNIQUE,
  user_email    text,
  acao          text NOT NULL CHECK (acao IN ('lido','resolvido','adiado')),
  adiado_ate    date,
  observacao    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerta_hash ON alertas_acoes(alerta_hash);

ALTER TABLE alertas_acoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerta_auth_all ON alertas_acoes;
CREATE POLICY alerta_auth_all ON alertas_acoes
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 3. CONFIGURAÇÃO de alertas (singleton — 1 linha apenas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_alertas (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emails_destino                  text[] NOT NULL DEFAULT ARRAY['fabricio@apexengenharia.com.br']::text[],
  enviar_email_diario             boolean NOT NULL DEFAULT true,
  enviar_email_semanal            boolean NOT NULL DEFAULT false,
  horario_envio_diario            time NOT NULL DEFAULT '08:00',
  dias_antecedencia_renovacao     integer[] NOT NULL DEFAULT ARRAY[180,90,60,30,15],
  dias_antecedencia_reajuste      integer[] NOT NULL DEFAULT ARRAY[30,15,7],
  dias_antecedencia_documento     integer[] NOT NULL DEFAULT ARRAY[60,30,15,7],
  dias_lead_parado                integer NOT NULL DEFAULT 30,
  dias_proposta_aguardando        integer NOT NULL DEFAULT 7,
  dias_proposta_analise_parada    integer NOT NULL DEFAULT 14,
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- Garante 1 linha (singleton)
-- [INSERT seed removido]

ALTER TABLE config_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfg_alerta_auth_all ON config_alertas;
CREATE POLICY cfg_alerta_auth_all ON config_alertas
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 4. VIEW v_alertas — combina TODAS as fontes em uma lista única
--    Calculada em tempo real a partir dos contratos/leads/propostas/docs.
--    LEFT JOIN com alertas_acoes traz o status (novo/lido/adiado).
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_alertas;
CREATE VIEW v_alertas AS
WITH
-- 4a. RENOVAÇÕES de contrato se aproximando (180d)
renovacoes AS (
  SELECT
    md5('renovacao|' || c.id::text || '|' || c.data_termino::text)                 AS alerta_hash,
    'renovacao_proxima'                                                            AS tipo,
    'contratual'                                                                    AS categoria,
    CASE
      WHEN c.data_termino - CURRENT_DATE <= 30  THEN 'critico'
      WHEN c.data_termino - CURRENT_DATE <= 60  THEN 'alto'
      WHEN c.data_termino - CURRENT_DATE <= 90  THEN 'medio'
      ELSE                                            'baixo'
    END                                                                             AS urgencia,
    'Renovação se aproximando — ' || COALESCE(i.nome_fantasia, i.razao_social)     AS titulo,
    'Contrato com ' || COALESCE(i.nome_fantasia, i.razao_social) ||
      ' vence em ' || (c.data_termino - CURRENT_DATE) || ' dias (' ||
      to_char(c.data_termino, 'DD/MM/YYYY') || '). Iniciar negociação.'             AS descricao,
    'contrato'                                                                      AS entidade_tipo,
    c.id                                                                            AS entidade_id,
    c.data_termino                                                                  AS data_evento,
    (c.data_termino - CURRENT_DATE)                                                 AS dias_para_evento
  FROM contratos c
  JOIN inquilinos i ON i.id = c.inquilino_id
  WHERE c.status = 'ativo'
    AND c.data_termino IS NOT NULL
    AND c.data_termino >= CURRENT_DATE
    AND (c.data_termino - CURRENT_DATE) <= 180
),

-- 4b. REAJUSTES ANUAIS — próximo aniversário do contrato
reajustes AS (
  SELECT
    md5('reajuste|' || x.id::text || '|' || x.proximo_reajuste::text)               AS alerta_hash,
    'reajuste_proximo'                                                              AS tipo,
    'contratual'                                                                    AS categoria,
    CASE
      WHEN x.proximo_reajuste - CURRENT_DATE <= 7   THEN 'critico'
      WHEN x.proximo_reajuste - CURRENT_DATE <= 15  THEN 'alto'
      ELSE                                                'medio'
    END                                                                             AS urgencia,
    'Reajuste anual — ' || COALESCE(i.nome_fantasia, i.razao_social)               AS titulo,
    'Reajuste de ' || COALESCE(x.indice_reajuste,'IGP-M') || ' do contrato com ' ||
      COALESCE(i.nome_fantasia, i.razao_social) || ' acontece em ' ||
      (x.proximo_reajuste - CURRENT_DATE) || ' dias (' ||
      to_char(x.proximo_reajuste, 'DD/MM/YYYY') || '). Valor atual: R$ ' ||
      to_char(x.valor_aluguel, 'FM999G999G990D00') || '/mês.'                       AS descricao,
    'contrato'                                                                      AS entidade_tipo,
    x.id                                                                            AS entidade_id,
    x.proximo_reajuste                                                              AS data_evento,
    (x.proximo_reajuste - CURRENT_DATE)                                             AS dias_para_evento
  FROM (
    SELECT
      c.*,
      -- próximo aniversário (mesmo dia/mês do data_inicio, no ano corrente ou seguinte)
      CASE
        WHEN make_date(
               EXTRACT(YEAR FROM CURRENT_DATE)::int,
               EXTRACT(MONTH FROM c.data_inicio)::int,
               LEAST(EXTRACT(DAY FROM c.data_inicio)::int, 28)
             ) >= CURRENT_DATE
        THEN make_date(
               EXTRACT(YEAR FROM CURRENT_DATE)::int,
               EXTRACT(MONTH FROM c.data_inicio)::int,
               LEAST(EXTRACT(DAY FROM c.data_inicio)::int, 28)
             )
        ELSE make_date(
               (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::int,
               EXTRACT(MONTH FROM c.data_inicio)::int,
               LEAST(EXTRACT(DAY FROM c.data_inicio)::int, 28)
             )
      END AS proximo_reajuste
    FROM contratos c
    WHERE c.status = 'ativo' AND c.data_inicio IS NOT NULL
  ) x
  JOIN inquilinos i ON i.id = x.inquilino_id
  WHERE (x.proximo_reajuste - CURRENT_DATE) BETWEEN 0 AND 30
),

-- 4c. MARCO DOS 5 ANOS (gatilho ação renovatória — Lei 8.245)
marco_5anos AS (
  SELECT
    md5('marco5|' || c.id::text)                                                    AS alerta_hash,
    'marco_5anos'                                                                   AS tipo,
    'contratual'                                                                    AS categoria,
    'alto'                                                                          AS urgencia,
    '5 anos completos — ' || COALESCE(i.nome_fantasia, i.razao_social)              AS titulo,
    'Contrato com ' || COALESCE(i.nome_fantasia, i.razao_social) ||
      ' completa 5 anos em ' || to_char((c.data_inicio + INTERVAL '5 years')::date, 'DD/MM/YYYY') ||
      '. Gatilho da ação renovatória (Lei 8.245).'                                  AS descricao,
    'contrato'                                                                      AS entidade_tipo,
    c.id                                                                            AS entidade_id,
    (c.data_inicio + INTERVAL '5 years')::date                                      AS data_evento,
    ((c.data_inicio + INTERVAL '5 years')::date - CURRENT_DATE)::integer            AS dias_para_evento
  FROM contratos c
  JOIN inquilinos i ON i.id = c.inquilino_id
  WHERE c.status = 'ativo'
    AND c.data_inicio IS NOT NULL
    AND ((c.data_inicio + INTERVAL '5 years')::date - CURRENT_DATE) BETWEEN 0 AND 180
),

-- 4d. DOCUMENTOS VENCENDO
docs_vencendo AS (
  SELECT
    md5('doc|' || d.id::text || '|' || d.data_validade::text)                       AS alerta_hash,
    'documento_vencendo'                                                            AS tipo,
    'documental'                                                                    AS categoria,
    CASE
      WHEN d.data_validade - CURRENT_DATE <= 7   THEN 'critico'
      WHEN d.data_validade - CURRENT_DATE <= 30  THEN 'alto'
      WHEN d.data_validade - CURRENT_DATE <= 60  THEN 'medio'
      ELSE                                             'baixo'
    END                                                                             AS urgencia,
    CASE d.tipo
      WHEN 'seguro_fianca'               THEN 'Seguro fiança vencendo'
      WHEN 'seguro_incendio'             THEN 'Seguro incêndio vencendo'
      WHEN 'certidao_negativa_federal'   THEN 'Certidão federal vencendo'
      WHEN 'certidao_negativa_municipal' THEN 'Certidão municipal vencendo'
      WHEN 'certidao_negativa_estadual'  THEN 'Certidão estadual vencendo'
      WHEN 'certidao_trabalhista'        THEN 'Certidão trabalhista vencendo'
      WHEN 'vistoria_inicial'            THEN 'Vistoria inicial vencendo'
      WHEN 'vistoria_final'              THEN 'Vistoria final vencendo'
      WHEN 'laudo_avcb'                  THEN 'AVCB vencendo'
      WHEN 'alvara_funcionamento'        THEN 'Alvará vencendo'
      ELSE                                    'Documento vencendo'
    END || ' — ' || COALESCE(i.nome_fantasia, i.razao_social)                       AS titulo,
    'Vence em ' || (d.data_validade - CURRENT_DATE) || ' dias (' ||
      to_char(d.data_validade, 'DD/MM/YYYY') || '). Contrato com ' ||
      COALESCE(i.nome_fantasia, i.razao_social) ||
      COALESCE(' — ' || d.descricao, '') || '.'                                     AS descricao,
    'documento'                                                                     AS entidade_tipo,
    d.id                                                                            AS entidade_id,
    d.data_validade                                                                 AS data_evento,
    (d.data_validade - CURRENT_DATE)                                                AS dias_para_evento
  FROM documentos_contrato d
  JOIN contratos c  ON c.id = d.contrato_id
  JOIN inquilinos i ON i.id = c.inquilino_id
  WHERE c.status = 'ativo'
    AND d.data_validade IS NOT NULL
    AND (d.data_validade - CURRENT_DATE) BETWEEN -30 AND 60  -- inclui vencidos há até 30 dias
),

-- 4e. LEADS PARADOS (sem interação > 30 dias)
leads_parados AS (
  SELECT
    md5('lead_parado|' || l.id::text || '|' || CURRENT_DATE::text)                  AS alerta_hash,
    'lead_parado'                                                                   AS tipo,
    'comercial'                                                                     AS categoria,
    CASE
      WHEN (CURRENT_DATE - COALESCE(vl.ultima_interacao_data::date, l.created_at::date)) > 60 THEN 'alto'
      ELSE                                                                                   'medio'
    END                                                                             AS urgencia,
    'Lead parado — ' || l.cliente_nome                                              AS titulo,
    'Lead "' || l.cliente_nome || '" sem interação há ' ||
      (CURRENT_DATE - COALESCE(vl.ultima_interacao_data::date, l.created_at::date)) ||
      ' dias. Status: ' || l.status || '.'                                          AS descricao,
    'lead'                                                                          AS entidade_tipo,
    l.id                                                                            AS entidade_id,
    COALESCE(vl.ultima_interacao_data::date, l.created_at::date)                          AS data_evento,
    (CURRENT_DATE - COALESCE(vl.ultima_interacao_data::date, l.created_at::date))         AS dias_para_evento
  FROM leads l
  LEFT JOIN v_leads_completo vl ON vl.id = l.id
  WHERE l.status IN ('interessado','visitou','em_analise')
    AND (CURRENT_DATE - COALESCE(vl.ultima_interacao_data::date, l.created_at::date)) >= 30
),

-- 4f. PROPOSTAS aceitas aguardando docs há muito tempo
propostas_aguardando AS (
  SELECT
    md5('prop_aguard|' || p.id::text)                                               AS alerta_hash,
    'proposta_aguardando_docs'                                                      AS tipo,
    'comercial'                                                                     AS categoria,
    CASE
      WHEN (CURRENT_DATE - p.created_at::date) >= 14 THEN 'alto'
      ELSE                                                'medio'
    END                                                                             AS urgencia,
    'Proposta aceita aguardando docs — ' || p.cliente_nome                          AS titulo,
    'Proposta de "' || p.cliente_nome || '" aceita há ' ||
      (CURRENT_DATE - p.created_at::date) || ' dias, ainda sem documentação.'       AS descricao,
    'proposta'                                                                      AS entidade_tipo,
    p.id                                                                            AS entidade_id,
    p.created_at::date                                                              AS data_evento,
    (CURRENT_DATE - p.created_at::date)                                             AS dias_para_evento
  FROM propostas p
  WHERE p.status = 'aceita_aguardando_docs'
    AND (CURRENT_DATE - p.created_at::date) >= 7
),

-- 4g. PROPOSTAS em análise paradas (>14 dias sem decisão)
propostas_analise_paradas AS (
  SELECT
    md5('prop_analise|' || p.id::text || '|' || CURRENT_DATE::text)                 AS alerta_hash,
    'proposta_analise_parada'                                                       AS tipo,
    'comercial'                                                                     AS categoria,
    'medio'                                                                         AS urgencia,
    'Proposta em análise há ' || (CURRENT_DATE - p.created_at::date) ||
      ' dias — ' || p.cliente_nome                                                  AS titulo,
    'Proposta de "' || p.cliente_nome || '" está em análise há ' ||
      (CURRENT_DATE - p.created_at::date) || ' dias. Cobrar decisão?'               AS descricao,
    'proposta'                                                                      AS entidade_tipo,
    p.id                                                                            AS entidade_id,
    p.created_at::date                                                              AS data_evento,
    (CURRENT_DATE - p.created_at::date)                                             AS dias_para_evento
  FROM propostas p
  WHERE p.status = 'em_analise'
    AND (CURRENT_DATE - p.created_at::date) >= 14
),

-- Junta tudo
todos AS (
  SELECT * FROM renovacoes
  UNION ALL SELECT * FROM reajustes
  UNION ALL SELECT * FROM marco_5anos
  UNION ALL SELECT * FROM docs_vencendo
  UNION ALL SELECT * FROM leads_parados
  UNION ALL SELECT * FROM propostas_aguardando
  UNION ALL SELECT * FROM propostas_analise_paradas
)

SELECT
  t.alerta_hash,
  t.tipo,
  t.categoria,
  t.urgencia,
  t.titulo,
  t.descricao,
  t.entidade_tipo,
  t.entidade_id,
  t.data_evento,
  t.dias_para_evento,
  COALESCE(a.acao, 'novo')         AS status,
  a.adiado_ate,
  a.observacao                     AS acao_observacao,
  a.created_at                     AS acao_em
FROM todos t
LEFT JOIN alertas_acoes a ON a.alerta_hash = t.alerta_hash
WHERE COALESCE(a.acao, '') <> 'resolvido'
  AND NOT (a.acao = 'adiado' AND a.adiado_ate IS NOT NULL AND a.adiado_ate > CURRENT_DATE)
ORDER BY
  CASE t.urgencia
    WHEN 'critico' THEN 1
    WHEN 'alto'    THEN 2
    WHEN 'medio'   THEN 3
    ELSE                4
  END,
  t.dias_para_evento ASC;

-- ---------------------------------------------------------------------
-- 5. Trigger para atualizar updated_at nas novas tabelas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_atualizar_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doc_updated ON documentos_contrato;
CREATE TRIGGER trg_doc_updated
  BEFORE UPDATE ON documentos_contrato
  FOR EACH ROW EXECUTE FUNCTION trg_atualizar_updated_at();

DROP TRIGGER IF EXISTS trg_acao_updated ON alertas_acoes;
CREATE TRIGGER trg_acao_updated
  BEFORE UPDATE ON alertas_acoes
  FOR EACH ROW EXECUTE FUNCTION trg_atualizar_updated_at();

DROP TRIGGER IF EXISTS trg_cfg_updated ON config_alertas;
CREATE TRIGGER trg_cfg_updated
  BEFORE UPDATE ON config_alertas
  FOR EACH ROW EXECUTE FUNCTION trg_atualizar_updated_at();

-- ---------------------------------------------------------------------
-- ✅ FIM. Para testar, rode:
--    SELECT * FROM v_alertas;
-- ---------------------------------------------------------------------


-- ===== ARQUIVO: SQL_CATEGORIAS_ARQUIVO.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Atualizar CHECK constraint da tabela arquivos
-- Adicionar 'termo' e 'laudo' às categorias válidas
-- =====================================================================

ALTER TABLE arquivos DROP CONSTRAINT IF EXISTS arquivos_categoria_check;

ALTER TABLE arquivos ADD CONSTRAINT arquivos_categoria_check
  CHECK (categoria IN (
    'contrato_assinado',
    'aditivo',
    'termo',
    'laudo',
    'fianca',
    'documentos_pessoais',
    'comprovante',
    'planta',
    'outro'
  ));


-- ===== ARQUIVO: SQL_RLS_HARDENING.sql (DO removidos: 7, INSERTs removidos: 1) =====
-- =====================================================================
-- UNION 511 — RLS HARDENING (created_by + políticas por usuário)
-- =====================================================================
-- Data: 2026-06-13
-- Decisão da auditoria: substituir USING (true) por políticas que olham
-- created_by = auth.uid(). Admin (na tabela app_admins) vê tudo.
--
-- IDEMPOTENTE: pode rodar várias vezes sem quebrar. Usa IF NOT EXISTS,
-- DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION.
--
-- IMPORTANTE: roda como o usuário admin do Supabase no painel SQL Editor.
-- Não roda parcialmente — se algo der erro, ROLLBACK e pede ajuda.
-- =====================================================================

-- =====================================================================
-- 0) Tabela de admins (quem vê/edita tudo, ignorando created_by)
-- =====================================================================
CREATE TABLE IF NOT EXISTS app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS na própria tabela app_admins:
--   - SELECT: só admin vê quem é admin (evita enumeração)
--   - INSERT/UPDATE/DELETE: BLOQUEADO no role authenticated.
--     A função is_app_admin() usa SECURITY DEFINER e contorna RLS,
--     então a checagem de admin continua funcionando.
--     Pra adicionar/remover admins use o painel SQL Editor (postgres role).
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_admins_self_read ON app_admins;
DROP POLICY IF EXISTS app_admins_admin_read ON app_admins;
CREATE POLICY app_admins_admin_read ON app_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- nenhuma policy de INSERT/UPDATE/DELETE = ninguém autenticado escreve

-- Insere o Fabricio como admin (busca pelo email) — esta query roda como postgres (bypass RLS)
-- [INSERT seed removido]

-- =====================================================================
-- 1) Função helper: é admin?
-- =====================================================================
CREATE OR REPLACE FUNCTION is_app_admin() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =====================================================================
-- 2) Helper macro mental: "owns or is admin"
-- Usado em policies como: USING ( is_app_admin() OR created_by = auth.uid() )
-- =====================================================================

-- =====================================================================
-- 3) Adiciona created_by em TODAS as tabelas raíz
-- =====================================================================

-- Lista de tabelas raíz (com dados pessoais/operacionais)
-- [DO block removido no seed]

-- =====================================================================
-- 4) Popula created_by dos registros existentes com o UUID do Fabricio
-- (todos os dados atuais foram criados por ele)
-- =====================================================================
-- [DO block removido no seed]

-- =====================================================================
-- 5) Trigger BEFORE INSERT pra autopreencher created_by
-- =====================================================================
CREATE OR REPLACE FUNCTION set_created_by() RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Anexa o trigger em cada tabela
-- [DO block removido no seed]

-- =====================================================================
-- 6) RLS POLICIES — tabelas raíz
-- =====================================================================
-- Padrão pra cada uma:
--   DROP POLICY IF EXISTS qualquer-policy-antiga;
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY ... USING (is_app_admin() OR created_by = auth.uid())
--                     WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- Pra não repetir, vou usar uma function que gera os comandos

-- 6.1 INQUILINOS
ALTER TABLE inquilinos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inquilinos_read" ON inquilinos;
DROP POLICY IF EXISTS "inquilinos_write" ON inquilinos;
DROP POLICY IF EXISTS inquilinos_auth_all ON inquilinos;
CREATE POLICY inquilinos_own ON inquilinos FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.2 CONTRATOS
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contratos_read" ON contratos;
DROP POLICY IF EXISTS "contratos_write" ON contratos;
DROP POLICY IF EXISTS contratos_auth_all ON contratos;
CREATE POLICY contratos_own ON contratos FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.3 PROPOSTAS
ALTER TABLE propostas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "propostas_read" ON propostas;
DROP POLICY IF EXISTS "propostas_write" ON propostas;
DROP POLICY IF EXISTS propostas_auth_all ON propostas;
CREATE POLICY propostas_own ON propostas FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.4 LEADS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_authenticated_all" ON leads;
DROP POLICY IF EXISTS leads_authenticated_all ON leads;
CREATE POLICY leads_own ON leads FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.5 ADITIVOS (se existir)
-- [DO block removido no seed]

-- 6.6 ARQUIVOS (todos os uploads de Storage; vincula a entidade via entidade_tipo+entidade_id)
ALTER TABLE arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arquivos_read" ON arquivos;
DROP POLICY IF EXISTS "arquivos_write" ON arquivos;
CREATE POLICY arquivos_own ON arquivos FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.7 DOCUMENTOS_CONTRATO
ALTER TABLE documentos_contrato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_auth_all ON documentos_contrato;
CREATE POLICY documentos_contrato_own ON documentos_contrato FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.8 FORNECEDORES
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fornecedores_auth_all" ON fornecedores;
CREATE POLICY fornecedores_own ON fornecedores FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.9 DESPESAS
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "despesas_auth_all" ON despesas;
CREATE POLICY despesas_own ON despesas FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.10 REAJUSTES
ALTER TABLE reajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reajustes_auth_all" ON reajustes;
CREATE POLICY reajustes_own ON reajustes FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.11 DESCONTOS_SUSPENSOS
ALTER TABLE descontos_suspensos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "descontos_susp_auth_all" ON descontos_suspensos;
CREATE POLICY descontos_suspensos_own ON descontos_suspensos FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.12 COBRANCAS
ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cobrancas_auth_all" ON cobrancas;
CREATE POLICY cobrancas_own ON cobrancas FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.13 ALERTAS_ACOES
ALTER TABLE alertas_acoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerta_auth_all ON alertas_acoes;
CREATE POLICY alertas_acoes_own ON alertas_acoes FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- 6.14 CONFIG_ALERTAS
ALTER TABLE config_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfg_alerta_auth_all ON config_alertas;
CREATE POLICY config_alertas_own ON config_alertas FOR ALL TO authenticated
  USING (is_app_admin() OR created_by = auth.uid())
  WITH CHECK (is_app_admin() OR created_by = auth.uid());

-- =====================================================================
-- 7) RLS POLICIES — tabelas filhas (n:n e dependentes)
-- Validação via JOIN com a tabela pai
-- =====================================================================

-- 7.1 CONTRATO_LOJAS → contratos
ALTER TABLE contrato_lojas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contrato_lojas_read" ON contrato_lojas;
DROP POLICY IF EXISTS "contrato_lojas_write" ON contrato_lojas;
CREATE POLICY contrato_lojas_via_pai ON contrato_lojas FOR ALL TO authenticated
  USING (
    is_app_admin() OR EXISTS (
      SELECT 1 FROM contratos c WHERE c.id = contrato_lojas.contrato_id AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_app_admin() OR EXISTS (
      SELECT 1 FROM contratos c WHERE c.id = contrato_lojas.contrato_id AND c.created_by = auth.uid()
    )
  );

-- 7.2 PROPOSTA_LOJAS → propostas
-- [DO block removido no seed]

-- 7.3 LEAD_LOJAS → leads
ALTER TABLE lead_lojas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_lojas_authenticated_all" ON lead_lojas;
CREATE POLICY lead_lojas_via_pai ON lead_lojas FOR ALL TO authenticated
  USING (
    is_app_admin() OR EXISTS (
      SELECT 1 FROM leads l WHERE l.id = lead_lojas.lead_id AND l.created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_app_admin() OR EXISTS (
      SELECT 1 FROM leads l WHERE l.id = lead_lojas.lead_id AND l.created_by = auth.uid()
    )
  );

-- 7.4 LEAD_INTERACOES → leads
ALTER TABLE lead_interacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_interacoes_authenticated_all" ON lead_interacoes;
CREATE POLICY lead_interacoes_via_pai ON lead_interacoes FOR ALL TO authenticated
  USING (
    is_app_admin() OR EXISTS (
      SELECT 1 FROM leads l WHERE l.id = lead_interacoes.lead_id AND l.created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_app_admin() OR EXISTS (
      SELECT 1 FROM leads l WHERE l.id = lead_interacoes.lead_id AND l.created_by = auth.uid()
    )
  );

-- =====================================================================
-- 8) RLS POLICIES — tabelas COMPARTILHADAS
-- (cadastros estáveis — todo mundo lê, só admin edita)
-- =====================================================================

-- 8.1 LOJAS (52 lojas físicas — todos veem, só admin edita)
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lojas_read" ON lojas;
DROP POLICY IF EXISTS "lojas_write" ON lojas;
DROP POLICY IF EXISTS "lojas_update_authenticated" ON lojas;
CREATE POLICY lojas_read_all ON lojas FOR SELECT TO authenticated USING (true);
CREATE POLICY lojas_write_admin ON lojas FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

-- 8.2 VAGAS
-- [DO block removido no seed]

-- 8.3 FERIADOS, INDICES_ECONOMICOS — leitura aberta
ALTER TABLE feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feriados_auth_read" ON feriados;
CREATE POLICY feriados_read_all ON feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY feriados_write_admin ON feriados FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

ALTER TABLE indices_economicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "indices_auth_all" ON indices_economicos;
CREATE POLICY indices_read_all ON indices_economicos FOR SELECT TO authenticated USING (true);
CREATE POLICY indices_write_admin ON indices_economicos FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

-- =====================================================================
-- 9) VALIDAÇÃO FINAL — confere que ninguém ficou USING (true) por engano
-- =====================================================================
-- [DO block removido no seed]

-- =====================================================================
-- SMOKE TEST (rodar SEPARADAMENTE depois pra confirmar)
-- =====================================================================
-- SELECT count(*) FROM contratos;     -- deve voltar a contagem normal (você é admin)
-- SELECT count(*) FROM propostas;     -- idem
-- SELECT count(*) FROM leads;         -- idem
-- SELECT is_app_admin();              -- deve voltar TRUE pra você
-- SELECT * FROM app_admins;           -- deve ter seu user_id


-- ===== ARQUIVO: SQL_PAPEIS.sql (DO removidos: 6, INSERTs removidos: 2) =====
-- =====================================================================
-- UNION 511 — Tabela de PERFIS e papéis (4 níveis)
-- =====================================================================
-- Roda DEPOIS do SQL_RLS_HARDENING (que já criou app_admins, created_by, etc.)
-- IDEMPOTENTE.
--
-- Papéis:
--   admin        → vê/edita tudo, inclusive deletar contratos
--   gestor       → CRUD em tudo, exceto DELETE em contratos vigentes
--   corretor     → SELECT em tudo (lojas/inquilinos/contratos pra contexto);
--                  INSERT/UPDATE só em propostas e leads PRÓPRIOS;
--                  KPIs financeiros são escondidos no frontend.
--   visualizador → só SELECT em tudo
--
-- Como funciona:
--   - Tabela `perfis` (1 linha por user_id em auth.users)
--   - Trigger AFTER INSERT em auth.users cria perfil com role='visualizador'
--   - Helpers: user_role(), is_admin(), can_write_all(), can_write_own()
--   - Policies reescritas pra olhar o papel
-- =====================================================================

-- =====================================================================
-- 1) Tabela perfis (cria ou MIGRA — versão antiga usava coluna "papel")
-- =====================================================================
CREATE TABLE IF NOT EXISTS perfis (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'visualizador',
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Se a tabela já existia com coluna "papel" (schema antigo), renomeia pra "role"
-- [DO block removido no seed]

-- Garante que todas as colunas existem (idempotente)
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'visualizador';
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Normaliza papéis antigos (se houver) — o schema antigo usava: admin/gestor/corretor/visualizador
-- (esses já casam com o novo). Se algum NULL escapou, default = visualizador.
UPDATE perfis SET role = 'visualizador' WHERE role IS NULL;

-- (Re)cria check constraint
-- [DO block removido no seed]

CREATE INDEX IF NOT EXISTS idx_perfis_role ON perfis(role);

-- RLS na própria perfis:
--   SELECT: usuário vê o próprio perfil; admin vê todos
--   UPDATE: admin atualiza qualquer perfil (mudar role / ativar / desativar)
--   INSERT/DELETE: só via trigger ou pelo painel (postgres role)
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perfis_read_self ON perfis;
DROP POLICY IF EXISTS perfis_read_admin ON perfis;
DROP POLICY IF EXISTS perfis_update_admin ON perfis;
CREATE POLICY perfis_read_self ON perfis FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY perfis_read_admin ON perfis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM perfis p2 WHERE p2.user_id = auth.uid() AND p2.role = 'admin'));
CREATE POLICY perfis_update_admin ON perfis FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM perfis p2 WHERE p2.user_id = auth.uid() AND p2.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis p2 WHERE p2.user_id = auth.uid() AND p2.role = 'admin'));

-- =====================================================================
-- 2) Backfill: cria perfil pra todos os usuários existentes
--    - Fabricio fica como 'admin'
--    - Demais ficam como 'visualizador' (você ajusta depois pelo app)
-- =====================================================================
-- [INSERT seed removido]

-- Sincroniza app_admins (de SQL_RLS_HARDENING) com perfis.admin
-- (qualquer um que esteja em app_admins é promovido a admin em perfis)
UPDATE perfis SET role = 'admin'
WHERE user_id IN (SELECT user_id FROM app_admins)
  AND role != 'admin';

-- =====================================================================
-- 3) Trigger: ao criar novo usuário em auth.users, cria perfil default
-- =====================================================================
CREATE OR REPLACE FUNCTION criar_perfil_default() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
-- [INSERT seed removido]
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfil_default ON auth.users;
CREATE TRIGGER trg_perfil_default
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION criar_perfil_default();

-- Trigger pra atualizar updated_at em perfis
CREATE OR REPLACE FUNCTION perfis_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_perfis_updated_at ON perfis;
CREATE TRIGGER trg_perfis_updated_at
  BEFORE UPDATE ON perfis
  FOR EACH ROW EXECUTE FUNCTION perfis_set_updated_at();

-- =====================================================================
-- 4) Funções helper
-- =====================================================================

-- Remove funções antigas do schema 05-rls-policies.sql (referenciavam coluna 'papel')
DROP FUNCTION IF EXISTS user_papel() CASCADE;
DROP FUNCTION IF EXISTS is_gestor_or_admin() CASCADE;
DROP FUNCTION IF EXISTS is_authenticated_active() CASCADE;

-- Papel do usuário atual
CREATE OR REPLACE FUNCTION user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM perfis WHERE user_id = auth.uid() AND ativo = true LIMIT 1;
$$;

-- É admin? (também atualiza is_app_admin pra continuar funcionando)
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'admin' AND ativo = true);
$$;

-- Substitui is_app_admin() (compatibilidade com SQL_RLS_HARDENING)
CREATE OR REPLACE FUNCTION is_app_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_admin();
$$;

-- Pode escrever TUDO (admin ou gestor)
CREATE OR REPLACE FUNCTION can_write_all() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT user_role() IN ('admin','gestor');
$$;

-- Pode escrever PRÓPRIOS recursos (propostas, leads) — admin, gestor ou corretor
CREATE OR REPLACE FUNCTION can_write_own() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT user_role() IN ('admin','gestor','corretor');
$$;

-- Pode ler? (qualquer um com perfil ativo: admin/gestor/corretor/visualizador)
CREATE OR REPLACE FUNCTION can_read() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT user_role() IS NOT NULL;
$$;

-- =====================================================================
-- 5) Reescrita das policies (substitui as do SQL_RLS_HARDENING)
-- =====================================================================
-- Resumo:
--   • Cadastros (lojas, vagas, feriados, indices) → leitura por todos, escrita só admin/gestor
--   • Tabelas operacionais "compartilhadas" (inquilinos, contratos, fornecedores, despesas, cobrancas, reajustes, etc.)
--       → SELECT por todos (admin/gestor/corretor/visualizador veem tudo, contexto comercial)
--       → INSERT/UPDATE/DELETE só admin/gestor
--   • Propostas + leads (e suas tabelas filhas) → corretor pode CRUD nos próprios; admin/gestor em tudo; visualizador só lê
--   • Tabelas filhas (contrato_lojas, lead_lojas, etc.) → seguem regra da tabela pai
--   • Arquivos / documentos_contrato → seguem regra da tabela pai

-- 5.1 INQUILINOS — operacional compartilhado
DROP POLICY IF EXISTS inquilinos_own ON inquilinos;
DROP POLICY IF EXISTS inquilinos_read ON inquilinos;
DROP POLICY IF EXISTS inquilinos_write ON inquilinos;
CREATE POLICY inquilinos_read ON inquilinos FOR SELECT TO authenticated USING (can_read());
CREATE POLICY inquilinos_write ON inquilinos FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.2 CONTRATOS — operacional compartilhado
DROP POLICY IF EXISTS contratos_own ON contratos;
DROP POLICY IF EXISTS contratos_read ON contratos;
DROP POLICY IF EXISTS contratos_write ON contratos;
CREATE POLICY contratos_read ON contratos FOR SELECT TO authenticated USING (can_read());
CREATE POLICY contratos_write ON contratos FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.3 CONTRATO_LOJAS — segue contratos
DROP POLICY IF EXISTS contrato_lojas_via_pai ON contrato_lojas;
CREATE POLICY contrato_lojas_read ON contrato_lojas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY contrato_lojas_write ON contrato_lojas FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.4 PROPOSTAS — corretor edita as próprias; admin/gestor tudo
DROP POLICY IF EXISTS propostas_own ON propostas;
CREATE POLICY propostas_read ON propostas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY propostas_insert ON propostas FOR INSERT TO authenticated
  WITH CHECK (can_write_all() OR (can_write_own() AND created_by = auth.uid()));
CREATE POLICY propostas_update ON propostas FOR UPDATE TO authenticated
  USING (can_write_all() OR (can_write_own() AND created_by = auth.uid()))
  WITH CHECK (can_write_all() OR (can_write_own() AND created_by = auth.uid()));
CREATE POLICY propostas_delete ON propostas FOR DELETE TO authenticated
  USING (can_write_all() OR (can_write_own() AND created_by = auth.uid()));

-- 5.5 PROPOSTA_LOJAS — segue propostas
-- [DO block removido no seed]

-- 5.6 LEADS — mesma lógica de propostas
DROP POLICY IF EXISTS leads_own ON leads;
CREATE POLICY leads_read ON leads FOR SELECT TO authenticated USING (can_read());
CREATE POLICY leads_insert ON leads FOR INSERT TO authenticated
  WITH CHECK (can_write_all() OR (can_write_own() AND created_by = auth.uid()));
CREATE POLICY leads_update ON leads FOR UPDATE TO authenticated
  USING (can_write_all() OR (can_write_own() AND created_by = auth.uid()))
  WITH CHECK (can_write_all() OR (can_write_own() AND created_by = auth.uid()));
CREATE POLICY leads_delete ON leads FOR DELETE TO authenticated
  USING (can_write_all() OR (can_write_own() AND created_by = auth.uid()));

-- 5.7 LEAD_LOJAS — segue leads
DROP POLICY IF EXISTS lead_lojas_via_pai ON lead_lojas;
CREATE POLICY lead_lojas_read ON lead_lojas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY lead_lojas_write ON lead_lojas FOR ALL TO authenticated
  USING (can_write_all() OR (can_write_own() AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_lojas.lead_id AND l.created_by = auth.uid())))
  WITH CHECK (can_write_all() OR (can_write_own() AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_lojas.lead_id AND l.created_by = auth.uid())));

-- 5.8 LEAD_INTERACOES — segue leads
DROP POLICY IF EXISTS lead_interacoes_via_pai ON lead_interacoes;
CREATE POLICY lead_interacoes_read ON lead_interacoes FOR SELECT TO authenticated USING (can_read());
CREATE POLICY lead_interacoes_write ON lead_interacoes FOR ALL TO authenticated
  USING (can_write_all() OR (can_write_own() AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_interacoes.lead_id AND l.created_by = auth.uid())))
  WITH CHECK (can_write_all() OR (can_write_own() AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_interacoes.lead_id AND l.created_by = auth.uid())));

-- 5.9 ADITIVOS — segue contratos
-- [DO block removido no seed]

-- 5.10 ARQUIVOS — todos leem, corretor pode anexar/baixar (sobe pro próprio recurso)
DROP POLICY IF EXISTS arquivos_own ON arquivos;
CREATE POLICY arquivos_read ON arquivos FOR SELECT TO authenticated USING (can_read());
CREATE POLICY arquivos_write ON arquivos FOR ALL TO authenticated
  USING (can_write_own()) WITH CHECK (can_write_own());

-- 5.11 DOCUMENTOS_CONTRATO — só admin/gestor (gerenciam o acervo administrativo)
DROP POLICY IF EXISTS documentos_contrato_own ON documentos_contrato;
CREATE POLICY documentos_contrato_read ON documentos_contrato FOR SELECT TO authenticated USING (can_read());
CREATE POLICY documentos_contrato_write ON documentos_contrato FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.12 FORNECEDORES — admin/gestor
DROP POLICY IF EXISTS fornecedores_own ON fornecedores;
CREATE POLICY fornecedores_read ON fornecedores FOR SELECT TO authenticated USING (can_read());
CREATE POLICY fornecedores_write ON fornecedores FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.13 DESPESAS — admin/gestor
DROP POLICY IF EXISTS despesas_own ON despesas;
CREATE POLICY despesas_read ON despesas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY despesas_write ON despesas FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.14 REAJUSTES — admin/gestor
DROP POLICY IF EXISTS reajustes_own ON reajustes;
CREATE POLICY reajustes_read ON reajustes FOR SELECT TO authenticated USING (can_read());
CREATE POLICY reajustes_write ON reajustes FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.15 DESCONTOS_SUSPENSOS — admin/gestor
DROP POLICY IF EXISTS descontos_suspensos_own ON descontos_suspensos;
CREATE POLICY descontos_suspensos_read ON descontos_suspensos FOR SELECT TO authenticated USING (can_read());
CREATE POLICY descontos_suspensos_write ON descontos_suspensos FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.16 COBRANCAS — admin/gestor
DROP POLICY IF EXISTS cobrancas_own ON cobrancas;
CREATE POLICY cobrancas_read ON cobrancas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY cobrancas_write ON cobrancas FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.17 ALERTAS_ACOES — todos leem; admin/gestor gerenciam
DROP POLICY IF EXISTS alertas_acoes_own ON alertas_acoes;
CREATE POLICY alertas_acoes_read ON alertas_acoes FOR SELECT TO authenticated USING (can_read());
CREATE POLICY alertas_acoes_write ON alertas_acoes FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.18 CONFIG_ALERTAS — só admin/gestor
DROP POLICY IF EXISTS config_alertas_own ON config_alertas;
CREATE POLICY config_alertas_read ON config_alertas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY config_alertas_write ON config_alertas FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.19 LOJAS (cadastro estável) — todos leem, só admin/gestor editam
DROP POLICY IF EXISTS lojas_read_all ON lojas;
DROP POLICY IF EXISTS lojas_write_admin ON lojas;
CREATE POLICY lojas_read ON lojas FOR SELECT TO authenticated USING (can_read());
CREATE POLICY lojas_write ON lojas FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- 5.20 VAGAS
-- [DO block removido no seed]

-- 5.21 FERIADOS / INDICES_ECONOMICOS — leitura aberta, escrita só admin
DROP POLICY IF EXISTS feriados_read_all ON feriados;
DROP POLICY IF EXISTS feriados_write_admin ON feriados;
CREATE POLICY feriados_read ON feriados FOR SELECT TO authenticated USING (can_read());
CREATE POLICY feriados_write ON feriados FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS indices_read_all ON indices_economicos;
DROP POLICY IF EXISTS indices_write_admin ON indices_economicos;
CREATE POLICY indices_read ON indices_economicos FOR SELECT TO authenticated USING (can_read());
CREATE POLICY indices_write ON indices_economicos FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================================
-- 6) Validação final
-- =====================================================================
-- [DO block removido no seed]

-- =====================================================================
-- SMOKE TEST (rodar SEPARADAMENTE depois)
-- =====================================================================
-- SELECT user_role(), is_admin(), can_write_all(), can_write_own();
-- SELECT * FROM perfis;
-- SELECT count(*) FROM contratos;
(admin, true, true, true)
-- SELECT * FROM perfis;                                              -- lista todos os perfis
-- SELECT count(*) FROM contratos;                                    -- deve voltar contagem normal


-- ===== ARQUIVO: SQL_RPC_USERS_ADMIN.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- UNION 511 — RPC get_users_admin
-- =====================================================================
-- Devolve user_id, email, last_sign_in_at de auth.users
-- pra que o painel de Admin no app consiga mostrar lista completa.
-- Só admin chama — função tem checagem interna.
-- =====================================================================

CREATE OR REPLACE FUNCTION get_users_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Checagem de segurança: só admin pode chamar
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem listar usuários';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    u.last_sign_in_at,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at;
END;
$$;

-- Permissões: chamável por qualquer usuário autenticado (a função decide se devolve)
GRANT EXECUTE ON FUNCTION get_users_admin() TO authenticated;

-- =====================================================================
-- SMOKE TEST
-- =====================================================================
-- SELECT * FROM get_users_admin();  -- só vai funcionar se você for admin


-- ===== ARQUIVO: SQL_GESTOES_CONTRATO.sql (DO removidos: 1, INSERTs removidos: 0) =====
-- =====================================================================
-- UNION 511 — Tabela GESTOES_CONTRATO (piloto IA)
-- =====================================================================
-- Catálogo de itens "gestionáveis" extraídos de contratos.
-- Cada linha = uma regra/evento que merece acompanhamento.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gestoes_contrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,

  -- O que é
  titulo text NOT NULL,
  tipo text NOT NULL,              -- carencia_fim, reajuste_aniversario, marco_5anos, termino,
                                   -- aviso_devolucao, garantia_pendencia, validacao_fianca,
                                   -- comprovantes, vistoria, seguro, destinacao
  descricao text,
  clausula_origem text,

  -- Quando
  data_evento date,                -- pode ser NULL (gestão sem data fixa, ex: regra informativa)
  recorrencia text DEFAULT 'one_off',   -- one_off, anual, semestral, mensal, manual_recorrente, informativo
  recorrencia_ate date,            -- limita a recorrência (ex: até término do contrato)

  -- Como avisar
  dias_aviso int[],                -- ex: {180,90,60,30} dias antes
  parametros jsonb,                -- detalhes específicos (índice, fallback, etc.)

  -- Estado
  ativo boolean NOT NULL DEFAULT true,
  status text DEFAULT 'pendente',  -- pendente, executado, cancelado, atrasado
  ultima_acao_em timestamptz,

  -- Metadata
  gerado_por text DEFAULT 'manual',   -- 'ia' ou 'manual'
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gestoes_contrato ON gestoes_contrato(contrato_id);
CREATE INDEX IF NOT EXISTS idx_gestoes_data ON gestoes_contrato(data_evento) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_gestoes_tipo ON gestoes_contrato(tipo);

-- RLS — mesma lógica das outras tabelas operacionais
ALTER TABLE gestoes_contrato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gestoes_read  ON gestoes_contrato;
DROP POLICY IF EXISTS gestoes_write ON gestoes_contrato;
CREATE POLICY gestoes_read  ON gestoes_contrato FOR SELECT TO authenticated USING (can_read());
CREATE POLICY gestoes_write ON gestoes_contrato FOR ALL    TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- Trigger pra auto-preencher created_by (igual ao padrão das outras tabelas)
DROP TRIGGER IF EXISTS trg_set_created_by ON gestoes_contrato;
CREATE TRIGGER trg_set_created_by BEFORE INSERT ON gestoes_contrato
  FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- Trigger pra updated_at automático
CREATE OR REPLACE FUNCTION gestoes_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_gestoes_updated_at ON gestoes_contrato;
CREATE TRIGGER trg_gestoes_updated_at BEFORE UPDATE ON gestoes_contrato
  FOR EACH ROW EXECUTE FUNCTION gestoes_set_updated_at();

-- =====================================================================
-- Popular as 12 gestões aprovadas para o contrato CALISTENIA
-- =====================================================================
-- [DO block removido no seed]

-- =====================================================================
-- Conferência (rodar depois pra ver)
-- =====================================================================
-- SELECT g.titulo, g.tipo, g.data_evento, g.recorrencia, g.clausula_origem
-- FROM gestoes_contrato g
-- JOIN contratos c ON c.id = g.contrato_id
-- JOIN inquilinos i ON i.id = c.inquilino_id
-- WHERE i.documento = '63.553.057/0001-38'
-- ORDER BY g.data_evento NULLS LAST;


-- ===== ARQUIVO: SQL_CONTRATOS_HISTORICO.sql (DO removidos: 0, INSERTs removidos: 4) =====
-- =====================================================================
-- UNION 511 — Histórico de alterações dos contratos (audit log)
-- =====================================================================
-- Cada UPDATE em contratos gera uma linha em contratos_historico
-- registrando: o que mudou, quem fez, quando.
-- =====================================================================

CREATE TABLE IF NOT EXISTS contratos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  acao text NOT NULL,                  -- 'INSERT', 'UPDATE', 'DELETE', 'ENCERRADO'
  campos_alterados jsonb,              -- { campo: { antes, depois } }
  alterado_por uuid REFERENCES auth.users(id),
  alterado_em timestamptz NOT NULL DEFAULT now(),
  observacao text                      -- nota opcional ("Aditivo de prazo", "Renegociação", etc)
);

CREATE INDEX IF NOT EXISTS idx_hist_contrato ON contratos_historico(contrato_id);
CREATE INDEX IF NOT EXISTS idx_hist_data     ON contratos_historico(alterado_em DESC);

-- RLS (mesma lógica das outras)
ALTER TABLE contratos_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hist_read  ON contratos_historico;
DROP POLICY IF EXISTS hist_write ON contratos_historico;
CREATE POLICY hist_read  ON contratos_historico FOR SELECT TO authenticated USING (can_read());
-- Só o trigger insere; ninguém UPDATE manualmente
CREATE POLICY hist_write ON contratos_historico FOR INSERT TO authenticated WITH CHECK (true);

-- =====================================================================
-- Função que detecta mudanças e registra
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_log_contrato_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
-- [INSERT seed removido]
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
-- [INSERT seed removido]
    RETURN OLD;
  END IF;

  -- UPDATE: compara campo a campo (só os importantes)
  IF OLD.valor_aluguel       IS DISTINCT FROM NEW.valor_aluguel       THEN
    v_changes := v_changes || jsonb_build_object('valor_aluguel', jsonb_build_object('antes', OLD.valor_aluguel, 'depois', NEW.valor_aluguel));
  END IF;
  IF OLD.dia_vencimento      IS DISTINCT FROM NEW.dia_vencimento      THEN
    v_changes := v_changes || jsonb_build_object('dia_vencimento', jsonb_build_object('antes', OLD.dia_vencimento, 'depois', NEW.dia_vencimento));
  END IF;
  IF OLD.meses_carencia      IS DISTINCT FROM NEW.meses_carencia      THEN
    v_changes := v_changes || jsonb_build_object('meses_carencia', jsonb_build_object('antes', OLD.meses_carencia, 'depois', NEW.meses_carencia));
  END IF;
  IF OLD.prazo_meses         IS DISTINCT FROM NEW.prazo_meses         THEN
    v_changes := v_changes || jsonb_build_object('prazo_meses', jsonb_build_object('antes', OLD.prazo_meses, 'depois', NEW.prazo_meses));
  END IF;
  IF OLD.data_inicio         IS DISTINCT FROM NEW.data_inicio         THEN
    v_changes := v_changes || jsonb_build_object('data_inicio', jsonb_build_object('antes', OLD.data_inicio, 'depois', NEW.data_inicio));
  END IF;
  IF OLD.data_termino        IS DISTINCT FROM NEW.data_termino        THEN
    v_changes := v_changes || jsonb_build_object('data_termino', jsonb_build_object('antes', OLD.data_termino, 'depois', NEW.data_termino));
  END IF;
  IF OLD.indice_reajuste     IS DISTINCT FROM NEW.indice_reajuste     THEN
    v_changes := v_changes || jsonb_build_object('indice_reajuste', jsonb_build_object('antes', OLD.indice_reajuste, 'depois', NEW.indice_reajuste));
  END IF;
  IF OLD.tipo_garantia       IS DISTINCT FROM NEW.tipo_garantia       THEN
    v_changes := v_changes || jsonb_build_object('tipo_garantia', jsonb_build_object('antes', OLD.tipo_garantia, 'depois', NEW.tipo_garantia));
  END IF;
  IF OLD.detalhes_garantia   IS DISTINCT FROM NEW.detalhes_garantia   THEN
    v_changes := v_changes || jsonb_build_object('detalhes_garantia', jsonb_build_object('antes', OLD.detalhes_garantia, 'depois', NEW.detalhes_garantia));
  END IF;
  IF OLD.status              IS DISTINCT FROM NEW.status              THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('antes', OLD.status, 'depois', NEW.status));
  END IF;
  IF OLD.observacoes         IS DISTINCT FROM NEW.observacoes         THEN
    v_changes := v_changes || jsonb_build_object('observacoes', jsonb_build_object('antes', LEFT(COALESCE(OLD.observacoes,''),200), 'depois', LEFT(COALESCE(NEW.observacoes,''),200)));
  END IF;

  -- Só insere se alguma coisa mudou de fato
  IF v_changes != '{}'::jsonb THEN
-- [INSERT seed removido]
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_contrato ON contratos;
CREATE TRIGGER trg_log_contrato
  AFTER INSERT OR UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION fn_log_contrato_change();

-- =====================================================================
-- Backfill: cria entrada "INSERT" pra cada contrato existente
-- (assim a timeline mostra "criado em XX/XX")
-- =====================================================================
-- [INSERT seed removido]

-- Conferência:
-- SELECT COUNT(*) FROM contratos_historico;


-- ===== ARQUIVO: SQL_GESTAO_OCORRENCIAS.sql (DO removidos: 0, INSERTs removidos: 2) =====
-- =====================================================================
-- UNION 511 — Sistema de ciclos: gestao_ocorrencias
-- =====================================================================
-- Cada GESTÃO (template/regra) agora gera múltiplas OCORRÊNCIAS.
-- Cada ocorrência tem um estado (pendente/cumprida) e pode ter um
-- arquivo opcional anexado. Quando cumprida, o trigger cria a próxima
-- (apenas para ciclos recorrentes).
-- =====================================================================

-- 1) Adiciona categoria nas gestões (define como comportar)
ALTER TABLE gestoes_contrato
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'evento_unico';
-- valores: 'evento_unico' | 'ciclo_recorrente' | 'informativo' | 'pendencia_pontual'

ALTER TABLE gestoes_contrato
  ADD COLUMN IF NOT EXISTS periodicidade_meses int;
-- só preenche se categoria='ciclo_recorrente'. Ex: 6 (semestral), 12 (anual)

-- Migra dados existentes: categoriza com base no tipo
UPDATE gestoes_contrato SET
  categoria = CASE
    WHEN tipo IN ('carencia_fim','marco_5anos','aviso_devolucao','termino') THEN 'evento_unico'
    WHEN tipo = 'destinacao' THEN 'informativo'
    WHEN tipo = 'garantia_pendencia' THEN 'pendencia_pontual'
    WHEN tipo IN ('reajuste_aniversario','validacao_fianca','vistoria','seguro') THEN 'ciclo_recorrente'
    WHEN tipo = 'comprovantes' THEN 'ciclo_recorrente'
    ELSE 'evento_unico'
  END,
  periodicidade_meses = CASE
    WHEN tipo = 'comprovantes' THEN 6
    WHEN tipo IN ('reajuste_aniversario','validacao_fianca','vistoria','seguro') THEN 12
    ELSE NULL
  END
WHERE categoria IS NULL OR categoria = 'evento_unico';

-- 2) Tabela de ocorrências (instâncias de cada gestão)
CREATE TABLE IF NOT EXISTS gestao_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestao_id   uuid NOT NULL REFERENCES gestoes_contrato(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,

  data_prevista date NOT NULL,
  data_cumprida date,
  status text NOT NULL DEFAULT 'pendente',  -- 'pendente' | 'cumprido' | 'cancelado'

  -- Anexo OPCIONAL: PDF que comprova o cumprimento
  -- O arquivo é salvo na tabela arquivos (entidade_tipo='contrato')
  -- e aparece automaticamente na aba "Anexos" da ficha.
  arquivo_id uuid REFERENCES arquivos(id) ON DELETE SET NULL,

  observacao text,
  cumprido_por uuid REFERENCES auth.users(id),
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  cumprido_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ocor_gestao    ON gestao_ocorrencias(gestao_id);
CREATE INDEX IF NOT EXISTS idx_ocor_contrato  ON gestao_ocorrencias(contrato_id);
CREATE INDEX IF NOT EXISTS idx_ocor_pendentes ON gestao_ocorrencias(data_prevista) WHERE status='pendente';

-- 3) RLS (mesmo padrão das outras)
ALTER TABLE gestao_ocorrencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ocor_read  ON gestao_ocorrencias;
DROP POLICY IF EXISTS ocor_write ON gestao_ocorrencias;
CREATE POLICY ocor_read  ON gestao_ocorrencias FOR SELECT TO authenticated USING (can_read());
CREATE POLICY ocor_write ON gestao_ocorrencias FOR ALL    TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

DROP TRIGGER IF EXISTS trg_set_created_by_ocor ON gestao_ocorrencias;
CREATE TRIGGER trg_set_created_by_ocor BEFORE INSERT ON gestao_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- 4) FUNÇÃO TRIGGER: ao marcar cumprido, cria próxima ocorrência (se ciclo recorrente)
CREATE OR REPLACE FUNCTION fn_criar_proxima_ocorrencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_categoria text;
  v_periodicidade int;
  v_recorrencia_ate date;
BEGIN
  -- Só age quando mudou pra 'cumprido'
  IF NEW.status != 'cumprido' OR OLD.status = 'cumprido' THEN
    RETURN NEW;
  END IF;

  -- Marca quem cumpriu e quando
  NEW.cumprido_por := auth.uid();
  NEW.cumprido_em  := now();
  IF NEW.data_cumprida IS NULL THEN
    NEW.data_cumprida := CURRENT_DATE;
  END IF;

  -- Busca categoria + periodicidade da gestão pai
  SELECT g.categoria, g.periodicidade_meses, g.recorrencia_ate
    INTO v_categoria, v_periodicidade, v_recorrencia_ate
    FROM gestoes_contrato g WHERE g.id = NEW.gestao_id;

  -- Só cria próxima se for ciclo_recorrente E não passou do recorrencia_ate
  IF v_categoria = 'ciclo_recorrente' AND v_periodicidade IS NOT NULL THEN
    DECLARE
      v_proxima_data date := NEW.data_prevista + (v_periodicidade || ' months')::interval;
    BEGIN
      IF v_recorrencia_ate IS NULL OR v_proxima_data <= v_recorrencia_ate THEN
        -- Cria próxima ocorrência (só se ainda não existir uma pendente futura)
        IF NOT EXISTS (
          SELECT 1 FROM gestao_ocorrencias o
          WHERE o.gestao_id = NEW.gestao_id
            AND o.status = 'pendente'
            AND o.data_prevista > NEW.data_prevista
        ) THEN
-- [INSERT seed removido]
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proxima_ocor ON gestao_ocorrencias;
CREATE TRIGGER trg_proxima_ocor
  BEFORE UPDATE OF status ON gestao_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION fn_criar_proxima_ocorrencia();

-- 5) BACKFILL: cria 1 ocorrência pendente pra cada gestão existente que tem data_evento
-- [INSERT seed removido]

-- =====================================================================
-- Conferência rápida (rodar depois):
-- =====================================================================
-- SELECT g.titulo, g.categoria, g.periodicidade_meses,
--        COUNT(o.id) AS qtd_ocorrencias,
--        MIN(o.data_prevista) FILTER (WHERE o.status='pendente') AS proxima_pendente
-- FROM gestoes_contrato g
-- LEFT JOIN gestao_ocorrencias o ON o.gestao_id = g.id
-- WHERE g.ativo = true
-- GROUP BY g.id, g.titulo, g.categoria, g.periodicidade_meses
-- ORDER BY g.categoria, g.titulo;


-- ===== ARQUIVO: SQL_CLAUSULAS_PRINCIPAIS.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- UNION 511 — Cláusulas-chave do contrato (estrutura JSONB)
-- =====================================================================
-- Schema do JSON (todas as chaves opcionais — IA preenche o que achar):
-- {
--   "financeiras":  { multa_moratoria, multa_descumprimento, indice_reajuste_detalhe },
--   "garantia":     { tipo_detalhe, valor, renovacao_automatica },
--   "uso_cessao":   { destinacao, alteracao_uso, sublocacao, cessao },
--   "devolucao":    { aviso_previo_dias, multa_rescisao_antecipada, indenizacao_benfeitorias },
--   "encargos":     { iptu, condominio, agua_luz, seguro_incendio },
--   "renovacao":    { renovacao_automatica, acao_renovatoria_lei_8245, prazo_notificacao_renovacao }
-- }
-- =====================================================================

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS clausulas_principais jsonb;

-- Não precisa de RLS adicional — a tabela contratos já tem policies.
-- Não precisa de trigger — o conteúdo é populado pelo front-end/IA.

COMMENT ON COLUMN contratos.clausulas_principais IS
  'Cláusulas-chave do contrato extraídas pela IA (Claude). Schema documentado em SQL_CLAUSULAS_PRINCIPAIS.sql.';


-- ===== ARQUIVO: SQL_EXAUSTAO.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Adiciona atributo "Exaustão" nas lojas
-- =====================================================================
-- Algumas lojas do empreendimento possuem sistema de exaustão.
-- O atributo é transferível: pode estar na loja 07 hoje e ser deslocado
-- pra loja 08 amanhã, então fica editável pelo admin/gestor.
-- =====================================================================

-- 1) Coluna na tabela base
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS tem_exaustao boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lojas.tem_exaustao IS
  'Indica se a loja possui sistema de exaustão instalado. Atributo transferível entre lojas.';

-- 2) Atualiza a view v_lojas_status pra expor tem_exaustao
-- (adicionando coluna nova ao FINAL — CREATE OR REPLACE aceita acréscimos)
CREATE OR REPLACE VIEW v_lojas_status AS
SELECT
  l.id,
  l.codigo,
  l.area_privativa,
  l.area_total,
  l.uso_interno,
  CASE
    WHEN l.uso_interno THEN 'uso_interno'
    WHEN EXISTS (
      SELECT 1 FROM contrato_lojas cl
      JOIN contratos c ON c.id = cl.contrato_id
      WHERE cl.loja_id = l.id AND c.status = 'ativo'
    ) THEN 'ocupada'
    WHEN EXISTS (
      SELECT 1 FROM proposta_lojas pl
      JOIN propostas p ON p.id = pl.proposta_id
      WHERE pl.loja_id = l.id AND p.status = 'aceita_aguardando_docs'
    ) THEN 'proposta_aceita'
    WHEN EXISTS (
      SELECT 1 FROM proposta_lojas pl
      JOIN propostas p ON p.id = pl.proposta_id
      WHERE pl.loja_id = l.id AND p.status = 'em_analise'
    ) THEN 'proposta_analise'
    ELSE 'disponivel'
  END AS status,
  (
    SELECT i.nome_fantasia
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    JOIN inquilinos i ON i.id = c.inquilino_id
    WHERE cl.loja_id = l.id AND c.status = 'ativo'
    LIMIT 1
  ) AS inquilino_atual,
  (
    SELECT c.parcial
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    WHERE cl.loja_id = l.id AND c.status = 'ativo'
    LIMIT 1
  ) AS parcial,
  l.tem_exaustao            -- nova coluna
FROM lojas l;

-- 3) Confere
SELECT codigo, area_privativa, tem_exaustao
FROM v_lojas_status
ORDER BY codigo;


-- ===== ARQUIVO: SQL_LOJAS_ATRIBUTOS.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Atributos adicionais das lojas: Exaustão + Área de Depósito
-- =====================================================================
-- Algumas lojas possuem sistema de exaustão (atributo transferível).
-- Algumas lojas têm pequenos depósitos surgidos com reformas (área varia
-- entre lojas; lojas sem depósito ficam com area_deposito = NULL).
-- Ambos os atributos são editáveis pelo admin/gestor a qualquer momento.
-- =====================================================================

-- 1) Colunas na tabela base
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS tem_exaustao boolean NOT NULL DEFAULT false;

ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS area_deposito numeric(10,2) NULL;

COMMENT ON COLUMN lojas.tem_exaustao IS
  'Indica se a loja possui sistema de exaustão. Atributo transferível entre lojas.';
COMMENT ON COLUMN lojas.area_deposito IS
  'Área (m²) do depósito interno da loja, se existir. NULL = loja não possui depósito.';

-- 2) Atualiza a view v_lojas_status pra expor as duas colunas novas
-- (CREATE OR REPLACE aceita acrescentar colunas no FINAL)
CREATE OR REPLACE VIEW v_lojas_status AS
SELECT
  l.id,
  l.codigo,
  l.area_privativa,
  l.area_total,
  l.uso_interno,
  CASE
    WHEN l.uso_interno THEN 'uso_interno'
    WHEN EXISTS (
      SELECT 1 FROM contrato_lojas cl
      JOIN contratos c ON c.id = cl.contrato_id
      WHERE cl.loja_id = l.id AND c.status = 'ativo'
    ) THEN 'ocupada'
    WHEN EXISTS (
      SELECT 1 FROM proposta_lojas pl
      JOIN propostas p ON p.id = pl.proposta_id
      WHERE pl.loja_id = l.id AND p.status = 'aceita_aguardando_docs'
    ) THEN 'proposta_aceita'
    WHEN EXISTS (
      SELECT 1 FROM proposta_lojas pl
      JOIN propostas p ON p.id = pl.proposta_id
      WHERE pl.loja_id = l.id AND p.status = 'em_analise'
    ) THEN 'proposta_analise'
    ELSE 'disponivel'
  END AS status,
  (
    SELECT i.nome_fantasia
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    JOIN inquilinos i ON i.id = c.inquilino_id
    WHERE cl.loja_id = l.id AND c.status = 'ativo'
    LIMIT 1
  ) AS inquilino_atual,
  (
    SELECT c.parcial
    FROM contrato_lojas cl
    JOIN contratos c ON c.id = cl.contrato_id
    WHERE cl.loja_id = l.id AND c.status = 'ativo'
    LIMIT 1
  ) AS parcial,
  l.tem_exaustao,
  l.area_deposito
FROM lojas l;

-- 3) Confere
SELECT codigo, area_privativa, area_deposito, tem_exaustao
FROM v_lojas_status
ORDER BY codigo;


-- ===== ARQUIVO: SQL_ANEXOS_UNIFICADOS.sql (DO removidos: 1, INSERTs removidos: 1) =====
-- =====================================================================
-- Unificação de Anexos do Contrato
-- =====================================================================
-- Antes: havia duas tabelas separadas pra anexos de contrato:
--   - `arquivos` (PDF do contrato, aditivos — sem data de validade)
--   - `documentos_contrato` (seguros, certidões, AVCB — com data de validade + alerta)
--
-- Depois: tudo vai pra `documentos_contrato`. A tabela `arquivos` continua existindo
-- (ainda é usada por propostas), mas anexos de contrato saem de lá.
--
-- IMPORTANTE: idempotente — pode rodar quantas vezes for, não duplica.
-- =====================================================================

-- 1) Amplia documentos_contrato pra acomodar metadados de arquivo (nome, tamanho)
ALTER TABLE documentos_contrato
  ADD COLUMN IF NOT EXISTS nome_original text NULL,
  ADD COLUMN IF NOT EXISTS tamanho_bytes bigint NULL;

-- Permite data_validade nula (anexos como contrato/aditivo não têm prazo)
ALTER TABLE documentos_contrato
  ALTER COLUMN data_validade DROP NOT NULL;

-- Amplia o CHECK constraint da coluna `tipo` pra aceitar também os novos tipos
-- (contrato, aditivo) que entram com a unificação dos anexos.
-- [DO block removido no seed]

ALTER TABLE documentos_contrato
  ADD CONSTRAINT documentos_contrato_tipo_check
  CHECK (tipo IN (
    'contrato', 'aditivo',
    'seguro_fianca', 'seguro_incendio',
    'certidao_negativa_federal', 'certidao_negativa_municipal',
    'certidao_negativa_estadual', 'certidao_trabalhista',
    'vistoria_inicial', 'vistoria_final',
    'laudo_avcb', 'alvara_funcionamento',
    'outros'
  ));

COMMENT ON COLUMN documentos_contrato.nome_original IS
  'Nome original do PDF anexado (preservado do upload).';
COMMENT ON COLUMN documentos_contrato.tamanho_bytes IS
  'Tamanho do PDF em bytes (referência visual na UI).';
COMMENT ON COLUMN documentos_contrato.data_validade IS
  'Data de validade (opcional). Quando preenchida, gera alertas automáticos.';

-- 2) Migra arquivos de contrato → documentos_contrato
-- Pra cada arquivo de contrato que ainda NÃO está em documentos_contrato (chave: arquivo_url = storage_path)
-- [INSERT seed removido]

-- 3) Confere quantos migraram e o estado final
SELECT
  'arquivos de contrato (origem)' AS fonte,
  COUNT(*) AS qtde
FROM arquivos
WHERE entidade_tipo = 'contrato'
UNION ALL
SELECT
  'documentos_contrato (destino unificado)',
  COUNT(*)
FROM documentos_contrato
UNION ALL
SELECT
  'documentos_contrato COM data de validade (com alerta)',
  COUNT(*)
FROM documentos_contrato
WHERE data_validade IS NOT NULL
UNION ALL
SELECT
  'documentos_contrato SEM data de validade (anexos puros)',
  COUNT(*)
FROM documentos_contrato
WHERE data_validade IS NULL;

-- 4) Lista por contrato pra revisão visual
SELECT
  d.contrato_id,
  d.tipo,
  d.numero,
  d.descricao,
  d.nome_original,
  d.data_validade,
  CASE WHEN d.data_validade IS NULL THEN 'anexo' ELSE 'com prazo' END AS classificacao
FROM documentos_contrato d
ORDER BY d.contrato_id;


-- ===== ARQUIVO: SQL_VALOR_BASE.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Valor base do contrato (vs valor vigente após reajustes)
-- =====================================================================
-- Antes: contratos.valor_aluguel era atualizado a cada reajuste, perdendo
-- o histórico do valor original do contrato.
--
-- Depois:
--   - contratos.valor_base       = valor ORIGINAL do contrato (imutável)
--   - contratos.valor_aluguel    = valor VIGENTE (atualiza a cada reajuste)
--   - tabela reajustes (já existente) = histórico completo
--
-- IMPORTANTE: idempotente — pode rodar quantas vezes for, não duplica nada.
-- =====================================================================

-- 1) Coluna valor_base
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS valor_base numeric(12,2) NULL;

COMMENT ON COLUMN contratos.valor_base IS
  'Valor original do contrato (do quadro resumo do PDF na assinatura). NUNCA muda após cadastro.';
COMMENT ON COLUMN contratos.valor_aluguel IS
  'Valor VIGENTE do aluguel — começa igual a valor_base e é atualizado a cada reajuste registrado.';

-- 2) Backfill: pra contratos onde valor_base ainda está NULL,
--    assume que o valor_aluguel atual é o base (nenhum reajuste lançado ainda).
UPDATE contratos
SET valor_base = valor_aluguel
WHERE valor_base IS NULL;

-- 3) Atualiza a view v_contratos_completo pra expor valor_base
-- (adiciona coluna nova no final — CREATE OR REPLACE permite acrescentar)
CREATE OR REPLACE VIEW v_contratos_completo AS
SELECT
  c.id,
  c.numero,
  c.inquilino_id,
  i.tipo                AS inquilino_tipo,
  i.razao_social,
  i.nome_fantasia,
  i.documento,
  i.segmento,
  c.data_assinatura,
  c.data_inicio,
  c.prazo_meses,
  c.data_termino,
  c.valor_aluguel,
  c.dia_vencimento,
  c.meses_carencia,
  c.indice_reajuste,
  c.tipo_garantia,
  c.detalhes_garantia,
  c.parcial,
  c.observacoes,
  c.status,
  c.data_encerramento,
  c.motivo_encerramento,
  (
    SELECT array_agg(l.codigo ORDER BY l.id)
    FROM contrato_lojas cl
    JOIN lojas l ON l.id = cl.loja_id
    WHERE cl.contrato_id = c.id
  ) AS lojas,
  (
    SELECT count(*) FROM contrato_lojas WHERE contrato_id = c.id
  ) AS qtde_lojas,
  (
    SELECT count(*) FROM vagas WHERE contrato_id = c.id
  ) AS qtde_vagas,
  c.created_at,
  c.updated_at,
  c.valor_base
FROM contratos c
JOIN inquilinos i ON i.id = c.inquilino_id;

-- 4) Confere
SELECT
  c.id,
  i.nome_fantasia,
  c.valor_base   AS base,
  c.valor_aluguel AS vigente,
  (c.valor_aluguel - c.valor_base) AS diff,
  CASE
    WHEN c.valor_base = c.valor_aluguel THEN 'sem reajuste'
    ELSE 'reajustado'
  END AS situacao
FROM contratos c
JOIN inquilinos i ON i.id = c.inquilino_id
WHERE c.status = 'ativo'
ORDER BY i.nome_fantasia;


-- ===== ARQUIVO: SQL_REAJUSTES_OPCIONAIS.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Torna campos de período opcionais na tabela reajustes
-- =====================================================================
-- Esses campos eram NOT NULL pensando em ciclo IGP-M (período de 12 meses).
-- Como o user pode lançar reajustes por negociação (sem amarração a período),
-- agora ficam opcionais.
-- =====================================================================

ALTER TABLE reajustes
  ALTER COLUMN periodo_inicio DROP NOT NULL,
  ALTER COLUMN periodo_fim    DROP NOT NULL;

-- Indice também deve ser opcional (reajuste por negociação sem índice)
ALTER TABLE reajustes
  ALTER COLUMN indice DROP NOT NULL;

-- variacao_pct também (nem sempre faz sentido calcular)
ALTER TABLE reajustes
  ALTER COLUMN variacao_pct DROP NOT NULL;

-- Confere
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'reajustes'
ORDER BY ordinal_position;


-- ===== ARQUIVO: SQL_SIENGE_PARCELAS.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Espelho das parcelas do SIENGE (fonte oficial das cobranças)
-- =====================================================================
-- Cada contrato (especialmente Evolve+) tem múltiplos "títulos" no SIENGE:
--   - CT.UNIxxxxx (aluguel principal — 121 parcelas mensais até 2035)
--   - COND.UNIxxxxx (condomínio — 12 parcelas anuais)
--   - IPTU.UNIxxxxx (IPTU — cota única ou parcelado)
--   - REC.xxxx (recibos avulsos/ajustes)
--
-- Esta tabela armazena espelhadamente cada PARCELA de cada título.
-- Importação acontece via PDF "Saldo Devedor Presente" do SIENGE,
-- lido pela IA Claude (modo extract_sienge).
-- =====================================================================

CREATE TABLE IF NOT EXISTS sienge_parcelas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id         uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,

  -- Identificação do título no SIENGE
  sienge_titulo       text NOT NULL,            -- ex: "12410 / CT.UNI01925"
  sienge_titulo_id    text,                     -- ex: "12410" (parte numérica)
  sienge_codigo       text,                     -- ex: "CT.UNI01925"
  componente          text NOT NULL DEFAULT 'aluguel'
                      CHECK (componente IN ('aluguel','condominio','iptu','recibo','outros')),

  -- Identificação da parcela
  parcela_num         integer,                  -- ex: 6  (de 12 ou 121)
  parcela_total       integer,                  -- ex: 121
  parcela_rotulo      text,                     -- ex: "6/121" ou "1/1*"

  -- Valores e datas
  data_vencimento     date NOT NULL,
  valor_original      numeric(14,2) NOT NULL,
  valor_corrigido     numeric(14,2),
  indexador           text,                     -- ex: 'REAL', 'IGP-M', 'IPCA'

  -- Pagamento (NULL se ainda a vencer)
  data_pagamento      date,
  valor_pago          numeric(14,2),
  recto_liquido       numeric(14,2),

  -- Status calculado
  status              text NOT NULL DEFAULT 'a_vencer'
                      CHECK (status IN ('paga','a_vencer','atrasada')),

  -- Rastreabilidade da importação
  importado_em        timestamptz NOT NULL DEFAULT now(),
  importado_por       uuid REFERENCES auth.users(id),
  origem_pdf_path     text,                     -- storage_path do PDF importado

  -- Texto livre (observações vindas do SIENGE)
  observacoes         text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Chave de idempotência: pra mesmo contrato + título + parcela, atualiza (não duplica)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sienge_parcelas_chave
  ON sienge_parcelas (contrato_id, sienge_codigo, parcela_num, data_vencimento);

-- Índices auxiliares pra performance
CREATE INDEX IF NOT EXISTS idx_sienge_parcelas_contrato      ON sienge_parcelas (contrato_id);
CREATE INDEX IF NOT EXISTS idx_sienge_parcelas_vencimento    ON sienge_parcelas (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_sienge_parcelas_status        ON sienge_parcelas (status);

-- RLS — só admins/gestores podem ler/escrever
ALTER TABLE sienge_parcelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sienge_parcelas_admin_all ON sienge_parcelas;
CREATE POLICY sienge_parcelas_admin_all ON sienge_parcelas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin','gestor')
        AND p.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin','gestor')
        AND p.ativo = true
    )
  );

-- =====================================================================
-- View: saldo agregado por contrato (com flag "tem SIENGE?")
-- =====================================================================
CREATE OR REPLACE VIEW v_saldo_sienge_por_contrato AS
SELECT
  c.id                                                AS contrato_id,
  (SELECT count(*) > 0 FROM sienge_parcelas WHERE contrato_id = c.id) AS tem_sienge,
  (SELECT max(importado_em) FROM sienge_parcelas WHERE contrato_id = c.id) AS ultima_importacao,
  -- Totais a vencer
  COALESCE((SELECT sum(valor_corrigido) FROM sienge_parcelas
            WHERE contrato_id = c.id AND status IN ('a_vencer','atrasada')), 0) AS total_a_vencer,
  -- Totais já pagos
  COALESCE((SELECT sum(valor_pago) FROM sienge_parcelas
            WHERE contrato_id = c.id AND status = 'paga'), 0) AS total_pago,
  -- Atrasadas
  COALESCE((SELECT count(*) FROM sienge_parcelas
            WHERE contrato_id = c.id AND status = 'atrasada'), 0) AS qtd_atrasadas,
  -- Próxima parcela a vencer
  (SELECT json_build_object('data', data_vencimento, 'valor', valor_corrigido, 'componente', componente)
   FROM sienge_parcelas
   WHERE contrato_id = c.id AND status IN ('a_vencer','atrasada')
   ORDER BY data_vencimento ASC LIMIT 1) AS proxima_parcela,
  -- Soma dos COMPONENTES vigentes pro mês atual (consolidado p/ Evolve+)
  COALESCE((SELECT sum(valor_corrigido) FROM sienge_parcelas
            WHERE contrato_id = c.id
              AND date_trunc('month', data_vencimento) = date_trunc('month', current_date)), 0) AS valor_mes_atual
FROM contratos c
WHERE c.status = 'ativo';

-- =====================================================================
-- Trigger: atualiza status conforme data atual (a_vencer → atrasada)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_recalcular_status_sienge()
RETURNS void AS $$
BEGIN
  UPDATE sienge_parcelas
  SET status = 'atrasada', updated_at = now()
  WHERE status = 'a_vencer'
    AND data_pagamento IS NULL
    AND data_vencimento < current_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_recalcular_status_sienge IS
  'Recalcula status das parcelas: a_vencer → atrasada quando vencimento passou. Rodar antes de queries de saldo.';

-- Roda já agora pra atualizar tudo
SELECT fn_recalcular_status_sienge();

-- =====================================================================
-- Verificação
-- =====================================================================
SELECT
  c.id,
  i.nome_fantasia,
  v.tem_sienge,
  v.ultima_importacao,
  v.total_a_vencer,
  v.total_pago,
  v.qtd_atrasadas,
  v.valor_mes_atual
FROM contratos c
JOIN inquilinos i ON i.id = c.inquilino_id
LEFT JOIN v_saldo_sienge_por_contrato v ON v.contrato_id = c.id
WHERE c.status = 'ativo'
ORDER BY i.nome_fantasia;


-- ===== ARQUIVO: PARA_GITHUB/SQL_STATUS_EM_NEGOCIACAO.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Adiciona o status 'em_negociacao' ao CHECK constraint da tabela propostas
-- Rode UMA VEZ no Supabase SQL Editor
-- =====================================================================

ALTER TABLE propostas DROP CONSTRAINT IF EXISTS propostas_status_check;

ALTER TABLE propostas ADD CONSTRAINT propostas_status_check
  CHECK (status IN (
    'em_analise',
    'em_negociacao',
    'aceita_aguardando_docs',
    'convertida_em_contrato',
    'recusada',
    'expirada'
  ));

-- Confere
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'propostas'::regclass AND conname LIKE '%status%';


-- ===== ARQUIVO: PARA_GITHUB/SQL_NOME_FANTASIA_CONTRATO.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Adiciona coluna nome_fantasia_contrato na tabela contratos
-- Permite que cada CONTRATO tenha um nome comercial próprio, útil quando
-- o mesmo inquilino (pessoa/CNPJ) opera marcas diferentes em lojas diferentes.
--
-- Ex: Maria Teresa (CPF 905.462.611-91) opera:
--   - Contrato loja 06 → nome_fantasia_contrato = 'Piticas'
--   - Contrato loja 13 → nome_fantasia_contrato = 'Mahogany'
--
-- Regra de exibição no app:
--   contrato.nome_fantasia_contrato || inquilino.nome_fantasia || inquilino.razao_social
--
-- Rode UMA VEZ no Supabase SQL Editor.
-- =====================================================================

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS nome_fantasia_contrato text;

COMMENT ON COLUMN contratos.nome_fantasia_contrato IS
  'Nome comercial deste contrato específico. Preencher quando o inquilino opera marcas diferentes em contratos diferentes. Se vazio, o app usa o nome_fantasia do inquilino.';

-- Conferência
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contratos' AND column_name = 'nome_fantasia_contrato';


-- ===== ARQUIVO: PARA_GITHUB/SQL_APP_CONFIG.sql (DO removidos: 0, INSERTs removidos: 0) =====
-- =====================================================================
-- Tabela app_config — configurações do app em chave/valor (JSONB)
-- Primeiro uso: coordenadas da planta baixa (chave 'planta_coords')
-- Assim os ajustes de posição/tamanho das lojas ficam no banco e não
-- se perdem ao limpar cache, trocar de navegador ou dispositivo.
--
-- Rode UMA VEZ no Supabase SQL Editor.
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_config (
  chave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_read  ON app_config;
DROP POLICY IF EXISTS app_config_write ON app_config;

-- Todo usuário autenticado pode LER (o mapa é igual pra todos)
CREATE POLICY app_config_read ON app_config
  FOR SELECT TO authenticated USING (true);

-- Só quem tem permissão de escrita geral pode ALTERAR
CREATE POLICY app_config_write ON app_config
  FOR ALL TO authenticated
  USING (can_write_all()) WITH CHECK (can_write_all());

-- Conferência
SELECT table_name FROM information_schema.tables WHERE table_name = 'app_config';
