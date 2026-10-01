-- Nó Salva avaliação. A função apaga a Avaliação da IA anterior e grava a nova
-- na mesma transação. Parâmetros: id, nota, critérios, resumo, falhas.

SELECT * FROM persistir_avaliacao_da_ia(
  $1::text,
  $2::numeric,
  $3::jsonb,
  $4::text,
  $5::jsonb
);
