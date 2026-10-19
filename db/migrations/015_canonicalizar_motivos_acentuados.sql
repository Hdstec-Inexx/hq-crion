-- Refina canonicalização de motivos para consolidar e priorizar grafias ricas com acentuação

CREATE OR REPLACE FUNCTION hq_pontuacao_acentos(texto text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT length(COALESCE(texto, '')) - length(regexp_replace(COALESCE(texto, ''), '[áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION hq_canonicalizar_motivo(novo_motivo text)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_chave text;
  v_oficiais text[] := ARRAY[
    'Pagamento no cartão',
    'Liberação de atendimento',
    'Alteração cadastral de endereço',
    'Alteração cadastral de nome e data de nascimento',
    'Negociação',
    'Consulta de carência',
    'Coparticipação e contestação',
    'Emissão de documentos: carta de permanência, demonstrativo, extrato de coparticipação e ficha financeira',
    'Reemissão de boleto',
    'Boleto',
    'Reajuste',
    'Inclusão de RN/RC',
    'Cancelamento de elegibilidade',
    'Confirmação de pagamento',
    'Boletos não gerados',
    'Atraso na liberação do código da carteirinha'
  ];
  v_oficial text;
  v_existente text;
BEGIN
  IF novo_motivo IS NULL OR trim(novo_motivo) = '' THEN
    RETURN novo_motivo;
  END IF;

  v_chave := hq_chave_canonica_motivo(novo_motivo);
  IF v_chave = '' THEN
    RETURN trim(novo_motivo);
  END IF;

  FOREACH v_oficial IN ARRAY v_oficiais LOOP
    IF hq_chave_canonica_motivo(v_oficial) = v_chave THEN
      RETURN v_oficial;
    END IF;
  END LOOP;

  -- Seleciona a melhor ocorrência existente priorizando acentuação e extensão
  SELECT motivo INTO v_existente
  FROM hq_atendimento
  WHERE motivo IS NOT NULL
    AND hq_chave_canonica_motivo(motivo) = v_chave
  ORDER BY hq_pontuacao_acentos(motivo) DESC,
           length(motivo) DESC,
           motivo DESC
  LIMIT 1;

  IF v_existente IS NOT NULL THEN
    IF hq_pontuacao_acentos(trim(novo_motivo)) > hq_pontuacao_acentos(v_existente) THEN
      RETURN trim(novo_motivo);
    END IF;
    RETURN v_existente;
  END IF;

  RETURN trim(novo_motivo);
END;
$$;

-- Consolidação em lote de todos os registros históricos agrupados por chave canônica
WITH melhores_motivos AS (
  SELECT DISTINCT ON (hq_chave_canonica_motivo(motivo))
    hq_chave_canonica_motivo(motivo) AS chave,
    motivo AS motivo_canonico
  FROM hq_atendimento
  WHERE motivo IS NOT NULL AND trim(motivo) <> ''
  ORDER BY hq_chave_canonica_motivo(motivo),
           hq_pontuacao_acentos(motivo) DESC,
           length(motivo) DESC,
           motivo DESC
)
UPDATE hq_atendimento a
SET motivo = m.motivo_canonico
FROM melhores_motivos m
WHERE hq_chave_canonica_motivo(a.motivo) = m.chave
  AND a.motivo <> m.motivo_canonico;

-- Reaplica os motivos oficiais caso ainda existam variantes não consolidadas
UPDATE hq_atendimento
SET motivo = hq_canonicalizar_motivo(motivo)
WHERE motivo IS NOT NULL AND trim(motivo) <> '';
