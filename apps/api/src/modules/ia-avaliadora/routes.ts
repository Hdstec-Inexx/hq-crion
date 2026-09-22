import { configuracaoDaIaAvaliadoraSchema } from '@hq-crion/contracts/ia-avaliadora';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { perfilDaAutorizacao } from '../perfil/sessoes.js';
import { gravarConfiguracao, lerConfiguracao } from './repositorio.js';

function recusarSeNaoForAdmin(request: FastifyRequest, reply: FastifyReply) {
  const perfil = perfilDaAutorizacao(request.headers.authorization);

  if (!perfil) {
    return reply.code(401).send({ statusCode: 401 });
  }

  if (perfil.papel !== 'Admin') {
    return reply.code(403).send({ statusCode: 403 });
  }

  return null;
}

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

const iaAvaliadoraRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ia-avaliadora', async (request, reply) => {
    semCache(reply);
    const recusa = recusarSeNaoForAdmin(request, reply);

    if (recusa) {
      return recusa;
    }

    return lerConfiguracao();
  });

  app.put(
    '/ia-avaliadora',
    { bodyLimit: 32_768 },
    async (request, reply) => {
      semCache(reply);
      const recusa = recusarSeNaoForAdmin(request, reply);

      if (recusa) {
        return recusa;
      }

      const parsed = configuracaoDaIaAvaliadoraSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400 });
      }

      return gravarConfiguracao(parsed.data);
    }
  );
};

export default iaAvaliadoraRoutes;
