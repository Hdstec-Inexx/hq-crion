-- Áudio ingerido da fonte. Sem arquivo, o Atendimento não ganha caminho de mídia.

CREATE TABLE IF NOT EXISTS hq_midia (
  atendimento_id TEXT PRIMARY KEY REFERENCES hq_atendimento (id),
  conteudo BYTEA NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'audio/wav'
);

ALTER TABLE hq_midia
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'audio/wav';
