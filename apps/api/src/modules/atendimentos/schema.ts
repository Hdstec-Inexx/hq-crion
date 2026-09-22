export const schemaSql = `
CREATE TABLE IF NOT EXISTS hq_boot (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

export const inserirAtendimentoSeAusenteSql = `
INSERT INTO hq_atendimento (
  id, agente_id, status, iniciado_em, concluido_em, duracao_em_segundos,
  transcricao, audio, motivo, transferencia, custo,
  tempo_de_espera_em_segundos, ferramentas
)
VALUES (
  $1, $2, $3, $4, $5, $6,
  $7::jsonb, $8, $9, $10, $11,
  $12, $13::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  transcricao = EXCLUDED.transcricao,
  duracao_em_segundos = EXCLUDED.duracao_em_segundos,
  tempo_de_espera_em_segundos = EXCLUDED.tempo_de_espera_em_segundos
`;
