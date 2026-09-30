import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { perfilDaAutorizacao } from '../perfil/sessoes.js';

function semCache(reply: { header(name: string, value: string): void }) {
  reply.header('Cache-Control', 'no-store');
}

const midiaRoutes: FastifyPluginAsync = async (app) => {
  const servirMidia = async (arquivo: string, request: any, reply: any) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const limpo = path.posix.normalize(arquivo).replace(/^(\.\.(\/|$))+/, '');

    if (!limpo || limpo.includes('..') || !/\.(wav|mp3)$/i.test(limpo)) {
      return reply.code(404).send({ statusCode: 404 });
    }

    const bytes = await app.lerMidia(limpo);

    if (!bytes) {
      return reply.code(404).send({ statusCode: 404 });
    }

    reply.header('Content-Type', bytes.tipo);
    return reply.send(bytes.conteudo);
  };

  app.get('/media/:arquivo', async (request, reply) => {
    const { arquivo } = request.params as { arquivo: string };
    return servirMidia(arquivo, request, reply);
  });

  app.get('/media/*', async (request, reply) => {
    const arquivo = (request.params as { '*': string })['*'];
    return servirMidia(arquivo, request, reply);
  });
};

export default midiaRoutes;
