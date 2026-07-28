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
