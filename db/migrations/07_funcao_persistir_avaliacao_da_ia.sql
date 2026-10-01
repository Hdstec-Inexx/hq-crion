-- Regrava a Avaliação da IA do Atendimento. Cada comando vê o anterior,
-- então a chave de hq_criterio_da_avaliacao_da_ia não colide na reavaliação.

CREATE OR REPLACE FUNCTION persistir_avaliacao_da_ia(
  p_atendimento_id text,
  p_nota numeric,
  p_criterios jsonb,
  p_resumo_atendimento text DEFAULT NULL,
  p_falhas_identificadas jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM hq_criterio_da_avaliacao_da_ia
  WHERE atendimento_id = p_atendimento_id;

  DELETE FROM hq_avaliacao_da_ia
  WHERE atendimento_id = p_atendimento_id;

  INSERT INTO hq_avaliacao_da_ia (
    atendimento_id,
    nota,
    resumo_atendimento,
    falhas_identificadas
  ) VALUES (
    p_atendimento_id,
    p_nota,
    p_resumo_atendimento,
    COALESCE(p_falhas_identificadas, '[]'::jsonb)
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
