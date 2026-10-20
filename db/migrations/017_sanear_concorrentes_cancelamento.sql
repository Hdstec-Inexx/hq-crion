-- Saneia diagnósticos persistidos com falsos positivos de concorrente citado:
-- 1. Casos onde concorrente_citado é 'Assim Saúde', mas o resumo/evidência não contém 'assim saúde'
--    (gerado pela correspondência indevida com a conjunção 'assim').
-- 2. Casos onde concorrente_citado é operadora parceira citada apenas como canal ou plano atual administrado
--    sem nenhuma declaração de migração para outra operadora (ex: 'Unimed do Maranhão').
-- 3. Casos onde a causa foi marcada como 'Migração para concorrente' unicamente devido ao concorrente saneado.

UPDATE hq_avaliacao_da_ia
SET
  concorrente_citado = NULL,
  categoria_causa_cancelamento = CASE
    WHEN categoria_causa_cancelamento = 'Migração para concorrente' THEN
      CASE
        WHEN venda_mal_feita = TRUE THEN 'Venda mal feita / Divergência comercial'
        WHEN LOWER(COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '(hospital|médico|medico|clínica|clinica|rede credenciada|cobertura)' THEN 'Rede credenciada / Cobertura'
        WHEN LOWER(COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '(boleto|fatura|cobrança|cobranca|pagamento|segunda via|financeiro)' THEN 'Problema financeiro / Boleto'
        WHEN LOWER(COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '(reajuste|aumento|mensalidade|preço|preco|caro)' THEN 'Preço / Reajuste'
        ELSE 'Outros'
      END
    ELSE categoria_causa_cancelamento
  END,
  diagnostico_cancelamento = CASE
    WHEN categoria_causa_cancelamento = 'Migração para concorrente' THEN
      CASE
        WHEN venda_mal_feita = TRUE THEN 'Cliente manifestou insatisfação com intenção de cancelamento devido a promessa comercial não cumprida (venda mal feita).'
        WHEN LOWER(COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '(hospital|médico|medico|clínica|clinica|rede credenciada|cobertura)' THEN 'Cliente manifestou intenção de cancelamento por motivo de rede credenciada / cobertura.'
        WHEN LOWER(COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '(boleto|fatura|cobrança|cobranca|pagamento|segunda via|financeiro)' THEN 'Cliente manifestou intenção de cancelamento por motivo de problema financeiro / boleto.'
        WHEN LOWER(COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '(reajuste|aumento|mensalidade|preço|preco|caro)' THEN 'Cliente manifestou intenção de cancelamento por motivo de preço / reajuste.'
        ELSE 'Cliente manifestou intenção de cancelamento por motivo de outros.'
      END
    ELSE diagnostico_cancelamento
  END
WHERE
  concorrente_citado IS NOT NULL
  AND (
    -- Falso positivo de 'Assim Saúde' sem menção explícita a 'assim saúde'
    (concorrente_citado ILIKE '%assim%' AND NOT (COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '\b(assim\s+sa[uú]de)\b')
    -- Falso positivo de operadora citada sem termos de migração
    OR NOT (COALESCE(resumo_atendimento, '') || ' ' || COALESCE(evidencia_trecho, '')) ~* '\b(migr|fui\s*(pra|para)|vou\s*(pra|para)|mudar\s*(pra|para)|mudei\s*(pra|para)|trocar\s*(pra|para|pela|pelo)|troquei|fechei|contratei|fiz\s*plano|aderi|outro\s*plano)\b'
  );
