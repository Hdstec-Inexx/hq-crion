import fp from 'fastify-plugin';
import { repositorioEmMemoria } from '../modules/atendimentos/memoria.js';
import type { PortaDeLeituraDeAtendimentos } from '../modules/atendimentos/porta.js';

declare module 'fastify' {
  interface FastifyInstance {
    atendimentos: PortaDeLeituraDeAtendimentos;
  }
}

export default fp(
  async (app) => {
    app.decorate('atendimentos', repositorioEmMemoria());
  },
  { name: 'persistencia', dependencies: ['config'] }
);
