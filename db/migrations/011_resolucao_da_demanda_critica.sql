-- Resolução da Demanda como Critério Crítico da Régua de Avaliação (Issue #132).
-- Atualiza o critério na Régua única para critico = true e valor = 1.5.
-- Atualiza os critérios gravados nas avaliações da IA e do Curador, recalculando
-- o selo de atendimentos históricos onde esse critério consta como Não atendido.

UPDATE hq_criterio_da_regua
SET critico = true, valor = 1.5
WHERE chave = 'resolucao-da-demanda' OR nome = 'Resolução da demanda';

UPDATE hq_criterio_da_avaliacao_da_ia
SET critico = true
WHERE chave = 'resolucao-da-demanda' OR nome = 'Resolução da demanda';

ALTER TABLE hq_criterio_da_avaliacao_do_curador DISABLE TRIGGER hq_criterio_da_avaliacao_do_curador_imutavel;

UPDATE hq_criterio_da_avaliacao_do_curador
SET critico = true
WHERE chave = 'resolucao-da-demanda' OR nome = 'Resolução da demanda';

ALTER TABLE hq_criterio_da_avaliacao_do_curador ENABLE TRIGGER hq_criterio_da_avaliacao_do_curador_imutavel;
