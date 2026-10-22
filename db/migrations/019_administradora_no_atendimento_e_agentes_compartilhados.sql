-- Adiciona administradora em hq_atendimento, torna administradora anulável em hq_agente_de_voz
-- e define trigger para auto-cadastro de agente e preservação da administradora do atendimento.

ALTER TABLE hq_atendimento
  ADD COLUMN IF NOT EXISTS administradora TEXT CHECK (administradora IN ('Affix', 'Alter', 'Conectaplan'));

UPDATE hq_atendimento a
SET administradora = ag.administradora
FROM hq_agente_de_voz ag
WHERE a.agente_id = ag.id
  AND a.administradora IS NULL;

ALTER TABLE hq_agente_de_voz
  ALTER COLUMN administradora DROP NOT NULL;

CREATE OR REPLACE FUNCTION hq_inferir_administradora_do_agente(nome_agente TEXT)
RETURNS TEXT AS $$
BEGIN
  IF nome_agente IS NULL THEN
    RETURN NULL;
  END IF;

  IF nome_agente ~* 'Conectaplan' THEN
    RETURN 'Conectaplan';
  ELSIF nome_agente ~* 'Affix' THEN
    RETURN 'Affix';
  ELSIF nome_agente ~* 'Alter' THEN
    RETURN 'Alter';
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION hq_trg_atendimento_agente_e_administradora()
RETURNS TRIGGER AS $$
DECLARE
  v_ag_admin TEXT;
BEGIN
  -- 1. Auto-cadastro de novos agentes para evitar erro de chave estrangeira
  IF NEW.agente_id IS NOT NULL THEN
    INSERT INTO hq_agente_de_voz (id, nome, administradora)
    VALUES (
      NEW.agente_id,
      NEW.agente_id,
      hq_inferir_administradora_do_agente(NEW.agente_id)
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 2. Preserva administradora do atendimento ou preenche a partir do agente
  IF NEW.administradora IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.administradora IS NOT NULL THEN
      NEW.administradora := OLD.administradora;
    ELSE
      SELECT ag.administradora INTO v_ag_admin
      FROM hq_agente_de_voz ag
      WHERE ag.id = NEW.agente_id;
      NEW.administradora := v_ag_admin;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hq_atendimento_agente_e_administradora ON hq_atendimento;
CREATE TRIGGER trg_hq_atendimento_agente_e_administradora
  BEFORE INSERT OR UPDATE ON hq_atendimento
  FOR EACH ROW
  EXECUTE FUNCTION hq_trg_atendimento_agente_e_administradora();
