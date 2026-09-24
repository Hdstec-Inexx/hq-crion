-- O marcador de semente nasce por migration, antes do listen.
-- Custo ausente na fonte permanece ausente; texto não vira número.

CREATE TABLE IF NOT EXISTS hq_boot (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

ALTER TABLE hq_atendimento ALTER COLUMN custo DROP NOT NULL;
