-- Remove o bloqueio de imutabilidade estrita da Avaliação do Curador, de seus
-- Critérios e do Comentário vinculado, permitindo edição de conferência por
-- Curador e Admin mantendo unicidade da avaliação por atendimento (Issue #163).

DROP TRIGGER IF EXISTS hq_avaliacao_do_curador_imutavel ON hq_avaliacao_do_curador;
DROP TRIGGER IF EXISTS hq_criterio_da_avaliacao_do_curador_imutavel ON hq_criterio_da_avaliacao_do_curador;
DROP TRIGGER IF EXISTS hq_comentario_so_status ON hq_comentario;
