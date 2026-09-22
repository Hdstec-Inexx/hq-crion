import { agentesDeVoz } from '@hq-crion/contracts/recorte';
import { emTransacao, type PoolDeDeposito } from './cliente.js';
import { idDaLinhaUnica } from './linha-unica.js';
import { configuracaoPadraoDaIa } from '../modules/ia-avaliadora/repositorio.js';
import { perfisDaSemente } from '../modules/perfil/repositorio.js';
import { reguaUnica } from '../modules/regua/regua-unica.js';

export async function semearEstrutura(pool: PoolDeDeposito) {
  await emTransacao(pool, async (cliente) => {
    for (const perfil of perfisDaSemente) {
      await cliente.query(
        `INSERT INTO hq_perfil (id, nome, email, senha, papel, ativo)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [perfil.id, perfil.nome, perfil.email, perfil.senha, perfil.papel, perfil.ativo]
      );
    }

    for (const agente of agentesDeVoz) {
      await cliente.query(
        `INSERT INTO hq_agente_de_voz (id, nome, administradora)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [agente.id, agente.nome, agente.administradora]
      );
    }

    await cliente.query(
      `INSERT INTO hq_regua (id, limiar_de_aprovacao)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [idDaLinhaUnica, reguaUnica.limiarDeAprovacao]
    );

    for (const [indice, criterio] of reguaUnica.criterios.entries()) {
      await cliente.query(
        `INSERT INTO hq_criterio_da_regua (regua_id, ordem, nome, valor, critico)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (regua_id, ordem) DO NOTHING`,
        [idDaLinhaUnica, indice + 1, criterio.nome, criterio.valor, criterio.critico]
      );
    }

    await cliente.query(
      `INSERT INTO hq_ia_avaliadora (id, prompt, modelo, temperatura)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        idDaLinhaUnica,
        configuracaoPadraoDaIa.prompt,
        configuracaoPadraoDaIa.modelo,
        configuracaoPadraoDaIa.temperatura
      ]
    );
  });
}
