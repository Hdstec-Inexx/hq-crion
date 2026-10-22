-- Atualiza a inferência de administradora para aceitar variações como 'Conecta Plan' com espaços/hífen
-- e retroalimenta o catálogo de agentes e atendimentos já persistidos.

CREATE OR REPLACE FUNCTION hq_inferir_administradora_do_agente(nome_agente TEXT)
RETURNS TEXT AS $$
BEGIN
  IF nome_agente IS NULL THEN
    RETURN NULL;
  END IF;

  IF nome_agente ~* 'conecta[\s-]*plan' THEN
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

-- Atualiza administradoras nulas de agentes cujo nome contenha variação de Conecta Plan ou outra administradora
UPDATE hq_agente_de_voz
SET administradora = hq_inferir_administradora_do_agente(nome)
WHERE administradora IS NULL
  AND hq_inferir_administradora_do_agente(nome) IS NOT NULL;

-- Atualiza atendimentos que estejam sem administradora e cujo agente agora tem administradora dedicada
UPDATE hq_atendimento a
SET administradora = ag.administradora
FROM hq_agente_de_voz ag
WHERE a.agente_id = ag.id
  AND a.administradora IS NULL
  AND ag.administradora IS NOT NULL;
