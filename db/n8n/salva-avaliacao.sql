-- Nó Salva avaliação. A função apaga a Avaliação da IA anterior e grava a nova
-- na mesma transação.
-- Parâmetros:
--   $1::text     -> Atendimento ID
--   $2::numeric  -> Nota da IA
--   $3::jsonb    -> Critérios avaliados
--   $4::text     -> Resumo do atendimento
--   $5::jsonb    -> Falhas identificadas
-- Parâmetros opcionais de Diagnóstico de Cancelamento ($6..$10):
--   $6::boolean  -> houve_intencao_cancelamento
--   $7::text     -> categoria_causa_cancelamento
--   $8::boolean  -> venda_mal_feita
--   $9::text     -> concorrente_citado
--   $10::text    -> diagnostico_cancelamento

/*
Chamada básica de 5 parâmetros mantida para compatibilidade:
SELECT * FROM persistir_avaliacao_da_ia(
  $1::text,
  $2::numeric,
  $3::jsonb,
  $4::text,
  $5::jsonb
)
*/

SELECT * FROM persistir_avaliacao_da_ia(
  $1::text,
  $2::numeric,
  $3::jsonb,
  $4::text,
  $5::jsonb,
  COALESCE($6::boolean, NULL),
  COALESCE($7::text, NULL),
  COALESCE($8::boolean, NULL),
  COALESCE($9::text, NULL),
  COALESCE($10::text, NULL)
);
