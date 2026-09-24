import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { aplicarMigracoes } from '../db/migrar.js';
import { semearEstrutura } from '../db/semente-estrutural.js';
import { repositorioEmMemoria } from '../modules/atendimentos/memoria.js';
import {
  repositorioPostgres,
  semearSeNecessario
} from '../modules/atendimentos/postgres.js';
import { ingerirElevenLabs, coletarDaFonte, registrarMidiaLocal } from '../modules/ingestao/boot.js';
import { lerMidiaDoDeposito, lerMidiaLocal } from '../modules/midia/deposito.js';
import {
  aplicarConfiguracaoDaIa,
  lerConfiguracaoDoDeposito,
  usarDepositoDaIa
} from '../modules/ia-avaliadora/repositorio.js';
import {
  aplicarPerfis,
  lerPerfisDoDeposito,
  usarDepositoDePerfis
} from '../modules/perfil/repositorio.js';
import { aplicarRegua, lerReguaDoDeposito } from '../modules/regua/regua-unica.js';
import type { PortaDeAtendimentos } from '../modules/atendimentos/porta.js';

declare module 'fastify' {
  interface FastifyInstance {
    atendimentos: PortaDeAtendimentos;
  }
}

export type FonteDePersistencia = 'memoria' | 'postgres';

export function fonteDePersistencia(env: {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DEPOSITO?: string;
}): FonteDePersistencia {
  const url = env.DATABASE_URL?.trim();
  const aceitePostgres =
    env.NODE_ENV === 'test' && env.DEPOSITO === 'postgres' && Boolean(url);

  if (env.NODE_ENV === 'test' && !aceitePostgres) {
    return 'memoria';
  }

  if (url) {
    return 'postgres';
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatório em produção; o HQ não usa o catálogo em memória.'
    );
  }

  return 'memoria';
}

export default fp(
  async (app) => {
    const fonte = fonteDePersistencia({
      NODE_ENV: app.config.NODE_ENV,
      DATABASE_URL: app.config.DATABASE_URL,
      DEPOSITO: app.config.DEPOSITO
    });

    if (fonte === 'memoria') {
      usarDepositoDePerfis(null);
      usarDepositoDaIa(null);
      const coletados = await coletarDaFonte(app.config, app.log);
      app.decorate('atendimentos', repositorioEmMemoria(registrarMidiaLocal(coletados)));
      app.decorate('lerMidia', async (id: string) => lerMidiaLocal(id));
      return;
    }

    const pool = new Pool({
      connectionString: app.config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
    let poolFechado = false;
    const fecharPool = async () => {
      if (poolFechado) {
        return;
      }

      poolFechado = true;
      await pool.end();
    };
    app.addHook('onClose', fecharPool);
    pool.on('connect', (conexao) => {
      void conexao.query("SET statement_timeout = '15s'");
    });

    try {
      await aplicarMigracoes(pool);
      await semearEstrutura(pool);
      await semearSeNecessario(pool, app.config.SKIP_SEED);
      const perfis = await lerPerfisDoDeposito(pool);
      const regua = await lerReguaDoDeposito(pool);
      const configuracao = await lerConfiguracaoDoDeposito(pool);
      aplicarPerfis(perfis);
      aplicarRegua(regua);
      aplicarConfiguracaoDaIa(configuracao);
      usarDepositoDePerfis(pool);
      usarDepositoDaIa(pool);
      await ingerirElevenLabs(pool, app.config, app.log);
      app.decorate('atendimentos', repositorioPostgres(pool));
      app.decorate('lerMidia', async (id: string) => lerMidiaDoDeposito(pool, id));
    } catch (error) {
      await fecharPool();
      throw error;
    }
  },
  { name: 'persistencia', dependencies: ['config'] }
);
