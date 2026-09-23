-- Fatos que o domínio tem: Custo numérico, Transferência obrigatória,
-- e-mail único sem caixa, chave estável do Critério, resolução do Comentário
-- com Admin e momento, marcas de criação e o instante na fonte.

ALTER TABLE hq_perfil
  ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE hq_perfil DROP CONSTRAINT IF EXISTS hq_perfil_email_key;
DROP INDEX IF EXISTS hq_perfil_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS hq_perfil_email_unico ON hq_perfil (lower(email));

ALTER TABLE hq_atendimento
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS evento_na_fonte_em TIMESTAMPTZ;

UPDATE hq_atendimento
SET evento_na_fonte_em = iniciado_em
WHERE evento_na_fonte_em IS NULL;

ALTER TABLE hq_atendimento
  ALTER COLUMN evento_na_fonte_em SET NOT NULL;

-- transferencia BOOLEAN NOT NULL no Atendimento.
ALTER TABLE hq_atendimento
  ALTER COLUMN transferencia SET DEFAULT false;

UPDATE hq_atendimento
SET transferencia = false
WHERE transferencia IS NULL;

ALTER TABLE hq_atendimento
  ALTER COLUMN transferencia SET NOT NULL,
  ALTER COLUMN transferencia DROP DEFAULT;

ALTER TABLE hq_atendimento RENAME COLUMN custo TO custo_texto;
ALTER TABLE hq_atendimento ADD COLUMN custo NUMERIC;

UPDATE hq_atendimento
SET custo = CASE
  WHEN custo_texto IS NULL THEN 0
  WHEN custo_texto ~ '^[0-9]+([.][0-9]+)?$' THEN custo_texto::numeric
  WHEN custo_texto ~ 'R\$' THEN REPLACE(REPLACE(custo_texto, 'R$ ', ''), ',', '.')::numeric
  ELSE 0
END;

ALTER TABLE hq_atendimento DROP COLUMN custo_texto;
ALTER TABLE hq_atendimento ALTER COLUMN custo SET NOT NULL;
ALTER TABLE hq_atendimento DROP CONSTRAINT IF EXISTS hq_atendimento_custo_check;
ALTER TABLE hq_atendimento ADD CONSTRAINT hq_atendimento_custo_check CHECK (custo >= 0);

ALTER TABLE hq_criterio_da_regua
  ADD COLUMN IF NOT EXISTS chave TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS admite_nao_se_aplica BOOLEAN NOT NULL DEFAULT false;

UPDATE hq_criterio_da_regua SET chave = CASE nome
  WHEN 'Saudação' THEN 'saudacao'
  WHEN 'Informação de Protocolo' THEN 'informacao-de-protocolo'
  WHEN 'Identificação do titular' THEN 'identificacao-do-titular'
  WHEN 'Palavras proibidas' THEN 'palavras-proibidas'
  WHEN 'Validação de e-mail' THEN 'validacao-de-e-mail'
  WHEN 'Clareza da informação' THEN 'clareza-da-informacao'
  WHEN 'Resolução da demanda' THEN 'resolucao-da-demanda'
  WHEN 'Confirmação dos dados' THEN 'confirmacao-dos-dados'
  WHEN 'Encerramento' THEN 'encerramento'
  ELSE nome
END
WHERE chave IS NULL OR chave = '';

UPDATE hq_criterio_da_regua
SET admite_nao_se_aplica = true
WHERE nome = 'Validação de e-mail';

ALTER TABLE hq_criterio_da_regua ALTER COLUMN chave SET NOT NULL;
ALTER TABLE hq_criterio_da_regua ALTER COLUMN chave DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS hq_criterio_da_regua_chave ON hq_criterio_da_regua (chave);

ALTER TABLE hq_criterio_da_avaliacao_da_ia
  ADD COLUMN IF NOT EXISTS chave TEXT;

UPDATE hq_criterio_da_avaliacao_da_ia AS c
SET chave = r.chave
FROM hq_criterio_da_regua r
WHERE c.chave IS NULL AND c.nome = r.nome;

ALTER TABLE hq_criterio_da_avaliacao_da_ia ALTER COLUMN chave SET NOT NULL;

ALTER TABLE hq_criterio_da_avaliacao_do_curador
  ADD COLUMN IF NOT EXISTS chave TEXT;

UPDATE hq_criterio_da_avaliacao_do_curador AS c
SET chave = r.chave
FROM hq_criterio_da_regua r
WHERE c.chave IS NULL AND c.nome = r.nome;

ALTER TABLE hq_criterio_da_avaliacao_do_curador ALTER COLUMN chave SET NOT NULL;

ALTER TABLE hq_comentario
  ADD COLUMN IF NOT EXISTS resolvido_por_id TEXT REFERENCES hq_perfil (id),
  ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION hq_marcar_atualizado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hq_perfil_atualizado ON hq_perfil;
CREATE TRIGGER hq_perfil_atualizado
  BEFORE UPDATE ON hq_perfil
  FOR EACH ROW EXECUTE FUNCTION hq_marcar_atualizado();

DROP TRIGGER IF EXISTS hq_atendimento_atualizado ON hq_atendimento;
CREATE TRIGGER hq_atendimento_atualizado
  BEFORE UPDATE ON hq_atendimento
  FOR EACH ROW EXECUTE FUNCTION hq_marcar_atualizado();

CREATE OR REPLACE FUNCTION hq_recusar_nao_se_aplica()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  admite BOOLEAN;
BEGIN
  IF NEW.estado <> 'Não se aplica' THEN
    RETURN NEW;
  END IF;

  SELECT admite_nao_se_aplica INTO admite
  FROM hq_criterio_da_regua
  WHERE chave = NEW.chave;

  IF NOT COALESCE(admite, false) THEN
    RAISE EXCEPTION 'Não se aplica só no Critério que a Régua admite';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hq_criterio_da_avaliacao_da_ia_nao_se_aplica ON hq_criterio_da_avaliacao_da_ia;
CREATE TRIGGER hq_criterio_da_avaliacao_da_ia_nao_se_aplica
  BEFORE INSERT OR UPDATE ON hq_criterio_da_avaliacao_da_ia
  FOR EACH ROW EXECUTE FUNCTION hq_recusar_nao_se_aplica();

DROP TRIGGER IF EXISTS hq_criterio_da_avaliacao_do_curador_nao_se_aplica ON hq_criterio_da_avaliacao_do_curador;
CREATE TRIGGER hq_criterio_da_avaliacao_do_curador_nao_se_aplica
  BEFORE INSERT OR UPDATE ON hq_criterio_da_avaliacao_do_curador
  FOR EACH ROW EXECUTE FUNCTION hq_recusar_nao_se_aplica();

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
