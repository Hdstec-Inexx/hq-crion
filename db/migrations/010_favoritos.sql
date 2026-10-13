-- Relação de favoritos entre Perfil e Atendimento.
-- Cada par (perfil_id, atendimento_id) é único e registra o instante da marcação.
CREATE TABLE IF NOT EXISTS hq_favorito (
  id TEXT PRIMARY KEY,
  perfil_id TEXT NOT NULL REFERENCES hq_perfil (id) ON DELETE CASCADE,
  atendimento_id TEXT NOT NULL REFERENCES hq_atendimento (id) ON DELETE CASCADE,
  favoritado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hq_favorito_perfil_atendimento UNIQUE (perfil_id, atendimento_id)
);

CREATE INDEX IF NOT EXISTS idx_hq_favorito_atendimento_id
  ON hq_favorito (atendimento_id);

CREATE INDEX IF NOT EXISTS idx_hq_favorito_perfil_id
  ON hq_favorito (perfil_id);
