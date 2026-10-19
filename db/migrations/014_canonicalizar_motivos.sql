-- Canonicalização de motivos por regex e trigger de integridade

CREATE OR REPLACE FUNCTION hq_chave_canonica_motivo(texto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  resultado text;
BEGIN
  IF texto IS NULL THEN
    RETURN '';
  END IF;

  resultado := lower(texto);
  resultado := translate(
    resultado,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
  resultado := regexp_replace(resultado, '[ªº]', '', 'g');
  resultado := regexp_replace(resultado, '[^a-z0-9\s]', ' ', 'g');
  resultado := trim(regexp_replace(resultado, '\s+', ' ', 'g'));

  RETURN resultado;
END;
$$;

CREATE OR REPLACE FUNCTION hq_canonicalizar_motivo(novo_motivo text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_chave text;
  v_oficiais text[] := ARRAY[
    'Pagamento no cartão',
    'Liberação de atendimento',
    'Alteração cadastral de endereço',
    'Alteração cadastral de nome e data de nascimento',
    'Negociação',
    'Consulta de carência',
    'Coparticipação e contestação',
    'Emissão de documentos: carta de permanência, demonstrativo, extrato de coparticipação e ficha financeira',
    'Reemissão de boleto',
    'Boleto',
    'Reajuste',
    'Inclusão de RN/RC',
    'Cancelamento de elegibilidade',
    'Confirmação de pagamento',
    'Boletos não gerados',
    'Atraso na liberação do código da carteirinha'
  ];
  v_oficial text;
  v_existente text;
BEGIN
  IF novo_motivo IS NULL OR trim(novo_motivo) = '' THEN
    RETURN novo_motivo;
  END IF;

  v_chave := hq_chave_canonica_motivo(novo_motivo);
  IF v_chave = '' THEN
    RETURN trim(novo_motivo);
  END IF;

  FOREACH v_oficial IN ARRAY v_oficiais LOOP
    IF hq_chave_canonica_motivo(v_oficial) = v_chave THEN
      RETURN v_oficial;
    END IF;
  END LOOP;

  SELECT motivo INTO v_existente
  FROM hq_atendimento
  WHERE motivo IS NOT NULL
    AND hq_chave_canonica_motivo(motivo) = v_chave
  LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  RETURN trim(novo_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION hq_gatilho_canonicalizar_motivo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.motivo IS NOT NULL THEN
    NEW.motivo := hq_canonicalizar_motivo(NEW.motivo);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hq_atendimento_canonicalizar_motivo ON hq_atendimento;

CREATE TRIGGER hq_atendimento_canonicalizar_motivo
  BEFORE INSERT OR UPDATE OF motivo ON hq_atendimento
  FOR EACH ROW
  EXECUTE FUNCTION hq_gatilho_canonicalizar_motivo();

UPDATE hq_atendimento
SET motivo = hq_canonicalizar_motivo(motivo)
WHERE motivo IS NOT NULL AND trim(motivo) <> '';
