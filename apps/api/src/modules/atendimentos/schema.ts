export const schemaSql = `
CREATE TABLE IF NOT EXISTS hq_atendimentos (
  id TEXT PRIMARY KEY,
  administradora TEXT NOT NULL,
  agente_id TEXT NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL,
  concluido_em TIMESTAMPTZ,
  motivo TEXT NOT NULL,
  status TEXT NOT NULL,
  duracao_em_segundos INTEGER,
  transferencia BOOLEAN,
  tempo_de_espera_em_segundos INTEGER,
  ferramentas JSONB,
  avaliacao_da_ia JSONB,
  avaliacao_do_curador JSONB,
  registro JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS hq_atendimentos_recorte
  ON hq_atendimentos (administradora, agente_id, iniciado_em);
CREATE TABLE IF NOT EXISTS hq_boot (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

export const upsertAtendimentoSql = `
INSERT INTO hq_atendimentos (
  id, administradora, agente_id, iniciado_em, concluido_em, motivo, status,
  duracao_em_segundos, transferencia, tempo_de_espera_em_segundos,
  ferramentas, avaliacao_da_ia, avaliacao_do_curador, registro
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb)
ON CONFLICT (id) DO UPDATE SET
  administradora = EXCLUDED.administradora,
  agente_id = EXCLUDED.agente_id,
  iniciado_em = EXCLUDED.iniciado_em,
  concluido_em = EXCLUDED.concluido_em,
  motivo = EXCLUDED.motivo,
  status = EXCLUDED.status,
  duracao_em_segundos = EXCLUDED.duracao_em_segundos,
  transferencia = EXCLUDED.transferencia,
  tempo_de_espera_em_segundos = EXCLUDED.tempo_de_espera_em_segundos,
  ferramentas = EXCLUDED.ferramentas,
  avaliacao_da_ia = EXCLUDED.avaliacao_da_ia,
  avaliacao_do_curador = EXCLUDED.avaliacao_do_curador,
  registro = EXCLUDED.registro
`;

export const selecionarPorRecorteSql = `
SELECT registro
FROM hq_atendimentos
WHERE ($1::text IS NULL OR administradora = $1)
  AND ($2::text IS NULL OR agente_id = $2)
  AND (
    $3::boolean = false
    OR (
      ((CASE
          WHEN $6::text = 'conclusao' THEN COALESCE(concluido_em, iniciado_em)
          ELSE iniciado_em
        END) AT TIME ZONE 'America/Sao_Paulo')::date >= $4::date
      AND ((CASE
          WHEN $6::text = 'conclusao' THEN COALESCE(concluido_em, iniciado_em)
          ELSE iniciado_em
        END) AT TIME ZONE 'America/Sao_Paulo')::date <= $5::date
    )
  )
`;
