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
