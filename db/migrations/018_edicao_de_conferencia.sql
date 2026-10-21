-- Remove o bloqueio de imutabilidade estrita da Avaliação do Curador e de seus
-- Critérios e ajusta a trigger do Comentário vinculado, permitindo edição de
-- conferência por Curador e Admin mantendo unicidade da avaliação por atendimento (Issue #163).

DROP TRIGGER IF EXISTS hq_avaliacao_do_curador_imutavel ON hq_avaliacao_do_curador;
DROP TRIGGER IF EXISTS hq_criterio_da_avaliacao_do_curador_imutavel ON hq_criterio_da_avaliacao_do_curador;
DROP TRIGGER IF EXISTS hq_comentario_so_status ON hq_comentario;

CREATE OR REPLACE FUNCTION hq_comentario_so_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.avaliacao_id IS DISTINCT FROM OLD.avaliacao_id
     OR NEW.atendimento_id IS DISTINCT FROM OLD.atendimento_id
     OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'Identificadores e data de criação do comentário são imutáveis';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER hq_comentario_so_status
  BEFORE UPDATE OR DELETE ON hq_comentario
  FOR EACH ROW EXECUTE FUNCTION hq_comentario_so_status();
