-- Transferência é só a ferramenta executada transfer_to_number.
-- Recalcula o fato já gravado a partir da transcrição.
-- O marcador fecha em ] para não aceitar um nome maior, como transfer_to_number_sip.

UPDATE hq_atendimento AS atendimento
SET transferencia = (
  jsonb_typeof(atendimento.transcricao) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(atendimento.transcricao) AS turno
    WHERE turno ->> 'texto' LIKE '%[Chamada de Ferramenta: transfer_to_number]%'
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(turno -> 'detalhes') = 'array' THEN turno -> 'detalhes'
             ELSE '[]'::jsonb
           END
         ) AS detalhe
         WHERE detalhe ->> 'nomeDaFerramenta' = 'transfer_to_number'
       )
  )
);
