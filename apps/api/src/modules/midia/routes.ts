import type { FastifyPluginAsync } from 'fastify';
import { perfilDaAutorizacao } from '../perfil/sessoes.js';

function semCache(reply: { header(name: string, value: string): void }) {
  reply.header('Cache-Control', 'no-store');
}

const midiaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/media/:arquivo', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const { arquivo } = request.params as { arquivo: string };

    if (!/^[A-Za-z0-9_-]+\.wav$/.test(arquivo)) {
      return reply.code(404).send({ statusCode: 404 });
    }

    const bytes = await app.lerMidia(arquivo.slice(0, -'.wav'.length));

    if (!bytes) {
      return reply.code(404).send({ statusCode: 404 });
    }

    reply.header('Content-Type', bytes.tipo);
    return reply.send(bytes.conteudo);
  });
};

export default midiaRoutes;
