-- Adiciona colunas para diagnóstico de cancelamento e venda mal feita na avaliação da IA.
ALTER TABLE hq_avaliacao_da_ia
  ADD COLUMN IF NOT EXISTS houve_intencao_cancelamento BOOLEAN,
  ADD COLUMN IF NOT EXISTS categoria_causa_cancelamento TEXT,
  ADD COLUMN IF NOT EXISTS venda_mal_feita BOOLEAN,
  ADD COLUMN IF NOT EXISTS concorrente_citado TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_cancelamento TEXT;

DROP FUNCTION IF EXISTS persistir_avaliacao_da_ia(text, numeric, jsonb, text, jsonb);

CREATE OR REPLACE FUNCTION persistir_avaliacao_da_ia(
  p_atendimento_id text,
  p_nota numeric,
  p_criterios jsonb,
  p_resumo_atendimento text DEFAULT NULL,
  p_falhas_identificadas jsonb DEFAULT '[]'::jsonb,
  p_houve_intencao_cancelamento boolean DEFAULT NULL,
  p_categoria_causa_cancelamento text DEFAULT NULL,
  p_venda_mal_feita boolean DEFAULT NULL,
  p_concorrente_citado text DEFAULT NULL,
  p_diagnostico_cancelamento text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM 1
  FROM hq_atendimento
  WHERE id = p_atendimento_id
  FOR UPDATE;

  DELETE FROM hq_criterio_da_avaliacao_da_ia
  WHERE atendimento_id = p_atendimento_id;

  DELETE FROM hq_avaliacao_da_ia
  WHERE atendimento_id = p_atendimento_id;

  INSERT INTO hq_avaliacao_da_ia (
    atendimento_id,
    nota,
    resumo_atendimento,
    falhas_identificadas,
    houve_intencao_cancelamento,
    categoria_causa_cancelamento,
    venda_mal_feita,
    concorrente_citado,
    diagnostico_cancelamento
  ) VALUES (
    p_atendimento_id,
    p_nota,
    p_resumo_atendimento,
    COALESCE(p_falhas_identificadas, '[]'::jsonb),
    p_houve_intencao_cancelamento,
    p_categoria_causa_cancelamento,
    p_venda_mal_feita,
    p_concorrente_citado,
    p_diagnostico_cancelamento
  );

  INSERT INTO hq_criterio_da_avaliacao_da_ia (
    atendimento_id,
    ordem,
    chave,
    nome,
    estado,
    pontos,
    critico
  )
  SELECT
    p_atendimento_id,
    (elemento->>'ordem')::integer,
    elemento->>'chave',
    elemento->>'nome',
    elemento->>'estado',
    (elemento->>'pontos')::numeric,
    (elemento->>'critico')::boolean
  FROM jsonb_array_elements(COALESCE(p_criterios, '[]'::jsonb)) AS elemento;

  RETURN true;
END;
$$;
