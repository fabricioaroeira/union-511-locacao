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
