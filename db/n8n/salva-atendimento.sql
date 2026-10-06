-- Nó Salva atendimento. Use os parâmetros do nó Postgres do n8n ($1…$14).
-- Não interpole JSON no texto da SQL.

INSERT INTO hq_atendimento (
  id, agente_id, status, iniciado_em, concluido_em, duracao_em_segundos,
  transcricao, audio, motivo, transferencia, custo, evento_na_fonte_em,
  tempo_de_espera_em_segundos, ferramentas
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7::jsonb, $8, $9, $10, $11, $12,
  $13, $14::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  duracao_em_segundos = EXCLUDED.duracao_em_segundos,
  transcricao = EXCLUDED.transcricao,
  audio = EXCLUDED.audio,
  tempo_de_espera_em_segundos = EXCLUDED.tempo_de_espera_em_segundos,
  transferencia = CASE
    WHEN EXCLUDED.transcricao = '[]'::jsonb THEN hq_atendimento.transferencia
    ELSE EXCLUDED.transferencia
  END;
