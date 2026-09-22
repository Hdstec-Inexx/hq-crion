-- Depósito relacional. Atendimento, Avaliação da IA, Avaliação do Curador
-- e Comentário nascem vazios: nada é copiado do JSON antigo.

CREATE TABLE IF NOT EXISTS hq_perfil (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('Admin', 'Gestão', 'Curador')),
  ativo BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS hq_agente_de_voz (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  administradora TEXT NOT NULL CHECK (administradora IN ('Affix', 'Alter', 'Conectaplan'))
);

CREATE TABLE IF NOT EXISTS hq_regua (
  id TEXT PRIMARY KEY CHECK (id = 'unica'),
  limiar_de_aprovacao NUMERIC NOT NULL CHECK (limiar_de_aprovacao > 0)
);

CREATE TABLE IF NOT EXISTS hq_criterio_da_regua (
  regua_id TEXT NOT NULL REFERENCES hq_regua (id),
  ordem INTEGER NOT NULL,
  nome TEXT NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  critico BOOLEAN NOT NULL,
  PRIMARY KEY (regua_id, ordem)
);

CREATE TABLE IF NOT EXISTS hq_ia_avaliadora (
  id TEXT PRIMARY KEY CHECK (id = 'unica'),
  prompt TEXT NOT NULL CHECK (char_length(btrim(prompt)) > 0),
  modelo TEXT NOT NULL CHECK (char_length(btrim(modelo)) > 0),
  temperatura NUMERIC NOT NULL CHECK (temperatura >= 0 AND temperatura <= 2)
);

CREATE TABLE IF NOT EXISTS hq_atendimento (
  id TEXT PRIMARY KEY,
  agente_id TEXT NOT NULL REFERENCES hq_agente_de_voz (id),
  status TEXT NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL,
  concluido_em TIMESTAMPTZ,
  duracao_em_segundos INTEGER,
  transcricao JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio TEXT,
  motivo TEXT NOT NULL,
  transferencia BOOLEAN,
  custo TEXT,
  tempo_de_espera_em_segundos INTEGER,
  ferramentas JSONB
);

CREATE INDEX IF NOT EXISTS hq_atendimento_agente_inicio
  ON hq_atendimento (agente_id, iniciado_em);

CREATE INDEX IF NOT EXISTS hq_atendimento_conclusao
  ON hq_atendimento (concluido_em);

CREATE TABLE IF NOT EXISTS hq_avaliacao_da_ia (
  atendimento_id TEXT PRIMARY KEY REFERENCES hq_atendimento (id),
  nota NUMERIC NOT NULL,
  executada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hq_criterio_da_avaliacao_da_ia (
  atendimento_id TEXT NOT NULL REFERENCES hq_avaliacao_da_ia (atendimento_id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  nome TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('Atendido', 'Não atendido', 'Não se aplica')),
  pontos NUMERIC NOT NULL,
  critico BOOLEAN NOT NULL,
  PRIMARY KEY (atendimento_id, ordem)
);

CREATE TABLE IF NOT EXISTS hq_avaliacao_do_curador (
  id TEXT PRIMARY KEY,
  atendimento_id TEXT NOT NULL REFERENCES hq_atendimento (id),
  nota NUMERIC NOT NULL,
  nota_da_avaliacao_da_ia NUMERIC NOT NULL,
  curador_id TEXT NOT NULL REFERENCES hq_perfil (id),
  curador_nome TEXT NOT NULL,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hq_avaliacao_do_curador_vigente
  ON hq_avaliacao_do_curador (atendimento_id, criada_em DESC);

CREATE TABLE IF NOT EXISTS hq_criterio_da_avaliacao_do_curador (
  avaliacao_id TEXT NOT NULL REFERENCES hq_avaliacao_do_curador (id),
  ordem INTEGER NOT NULL,
  nome TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('Atendido', 'Não atendido', 'Não se aplica')),
  pontos NUMERIC NOT NULL,
  critico BOOLEAN NOT NULL,
  PRIMARY KEY (avaliacao_id, ordem)
);

CREATE TABLE IF NOT EXISTS hq_comentario (
  id TEXT PRIMARY KEY,
  avaliacao_id TEXT NOT NULL UNIQUE REFERENCES hq_avaliacao_do_curador (id),
  atendimento_id TEXT NOT NULL REFERENCES hq_atendimento (id),
  texto TEXT NOT NULL CHECK (char_length(btrim(texto)) > 0),
  status TEXT NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Resolvido')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hq_comentario_fila
  ON hq_comentario (status, criado_em);

CREATE OR REPLACE FUNCTION hq_recusar_mutacao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Avaliação do Curador é imutável';
END;
$$;

DROP TRIGGER IF EXISTS hq_avaliacao_do_curador_imutavel ON hq_avaliacao_do_curador;
CREATE TRIGGER hq_avaliacao_do_curador_imutavel
  BEFORE UPDATE OR DELETE ON hq_avaliacao_do_curador
  FOR EACH ROW EXECUTE FUNCTION hq_recusar_mutacao();

DROP TRIGGER IF EXISTS hq_criterio_da_avaliacao_do_curador_imutavel ON hq_criterio_da_avaliacao_do_curador;
CREATE TRIGGER hq_criterio_da_avaliacao_do_curador_imutavel
  BEFORE UPDATE OR DELETE ON hq_criterio_da_avaliacao_do_curador
  FOR EACH ROW EXECUTE FUNCTION hq_recusar_mutacao();

CREATE OR REPLACE FUNCTION hq_comentario_so_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Comentário não se apaga';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.avaliacao_id IS DISTINCT FROM OLD.avaliacao_id
     OR NEW.atendimento_id IS DISTINCT FROM OLD.atendimento_id
     OR NEW.texto IS DISTINCT FROM OLD.texto
     OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'Comentário só muda o status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hq_comentario_so_status ON hq_comentario;
CREATE TRIGGER hq_comentario_so_status
  BEFORE UPDATE OR DELETE ON hq_comentario
  FOR EACH ROW EXECUTE FUNCTION hq_comentario_so_status();
