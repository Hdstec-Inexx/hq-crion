-- Uma Avaliação do Curador por Atendimento. Conferências antigas podiam
-- gravar outra linha; a mais recente permanece, com o Comentário dela.
ALTER TABLE hq_avaliacao_do_curador DISABLE TRIGGER hq_avaliacao_do_curador_imutavel;
ALTER TABLE hq_criterio_da_avaliacao_do_curador DISABLE TRIGGER hq_criterio_da_avaliacao_do_curador_imutavel;
ALTER TABLE hq_comentario DISABLE TRIGGER hq_comentario_so_status;

DELETE FROM hq_comentario
WHERE avaliacao_id IN (
  SELECT revisao.id
  FROM hq_avaliacao_do_curador revisao
  WHERE revisao.id IS DISTINCT FROM (
    SELECT vig.id
    FROM hq_avaliacao_do_curador vig
    WHERE vig.atendimento_id = revisao.atendimento_id
    ORDER BY vig.criada_em DESC, vig.id DESC
    LIMIT 1
  )
);

DELETE FROM hq_criterio_da_avaliacao_do_curador
WHERE avaliacao_id IN (
  SELECT revisao.id
  FROM hq_avaliacao_do_curador revisao
  WHERE revisao.id IS DISTINCT FROM (
    SELECT vig.id
    FROM hq_avaliacao_do_curador vig
    WHERE vig.atendimento_id = revisao.atendimento_id
    ORDER BY vig.criada_em DESC, vig.id DESC
    LIMIT 1
  )
);

DELETE FROM hq_avaliacao_do_curador revisao
WHERE revisao.id IS DISTINCT FROM (
  SELECT vig.id
  FROM hq_avaliacao_do_curador vig
  WHERE vig.atendimento_id = revisao.atendimento_id
  ORDER BY vig.criada_em DESC, vig.id DESC
  LIMIT 1
);

ALTER TABLE hq_comentario ENABLE TRIGGER hq_comentario_so_status;
ALTER TABLE hq_criterio_da_avaliacao_do_curador ENABLE TRIGGER hq_criterio_da_avaliacao_do_curador_imutavel;
ALTER TABLE hq_avaliacao_do_curador ENABLE TRIGGER hq_avaliacao_do_curador_imutavel;

CREATE UNIQUE INDEX IF NOT EXISTS hq_avaliacao_do_curador_por_atendimento
  ON hq_avaliacao_do_curador (atendimento_id);
