-- Resumo do Atendimento e Falhas Identificadas pertencem à Avaliação da IA.
ALTER TABLE hq_avaliacao_da_ia
  ADD COLUMN IF NOT EXISTS resumo_atendimento TEXT,
  ADD COLUMN IF NOT EXISTS falhas_identificadas JSONB NOT NULL DEFAULT '[]'::jsonb;
