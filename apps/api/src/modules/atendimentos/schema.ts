export const schemaSql = `
CREATE TABLE IF NOT EXISTS hq_boot (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

const colunasDoAtendimento = `
  id, agente_id, status, iniciado_em, concluido_em, duracao_em_segundos,
  transcricao, audio, motivo, transferencia, custo, evento_na_fonte_em,
  tempo_de_espera_em_segundos, ferramentas
`;

const valoresDoAtendimento = `
  $1, $2, $3, $4, $5, $6,
  $7::jsonb, $8, $9, $10, $11, $12,
  $13, $14::jsonb
`;

export const inserirAtendimentoSql = `
INSERT INTO hq_atendimento (${colunasDoAtendimento})
VALUES (${valoresDoAtendimento})
`;

export const inserirAtendimentoSeAusenteSql = `
${inserirAtendimentoSql}
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  transcricao = EXCLUDED.transcricao,
  duracao_em_segundos = COALESCE(EXCLUDED.duracao_em_segundos, hq_atendimento.duracao_em_segundos),
  tempo_de_espera_em_segundos = COALESCE(
    EXCLUDED.tempo_de_espera_em_segundos,
    hq_atendimento.tempo_de_espera_em_segundos
  )
`;
