import { reguaDeAvaliacaoSchema } from '@hq-crion/contracts/regua';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { perfilDaAutorizacao } from '../perfil/sessoes.js';
import { reguaUnica } from './regua-unica.js';

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

const reguaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/regua', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    return reguaDeAvaliacaoSchema.parse(reguaUnica);
  });
};

export default reguaRoutes;
