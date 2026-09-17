import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { repositorioEmMemoria } from '../modules/atendimentos/memoria.js';
import {
  aplicarSchema,
  repositorioPostgres,
  semearSeNecessario
} from '../modules/atendimentos/postgres.js';
import { ingerirFonteExterna } from '../modules/ingestao/boot.js';
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
}): FonteDePersistencia {
  if (env.NODE_ENV === 'test') {
    return 'memoria';
  }

  const url = env.DATABASE_URL?.trim();

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
      DATABASE_URL: app.config.DATABASE_URL
    });

    if (fonte === 'memoria') {
      app.decorate('atendimentos', repositorioEmMemoria());
      return;
    }

    const pool = new Pool({ connectionString: app.config.DATABASE_URL });
    await aplicarSchema(pool);
    await semearSeNecessario(pool, app.config.SKIP_SEED);
    await ingerirFonteExterna(pool, app.config, app.log);
    app.decorate('atendimentos', repositorioPostgres(pool));
    app.addHook('onClose', async () => {
      await pool.end();
    });
  },
  { name: 'persistencia', dependencies: ['config'] }
);
