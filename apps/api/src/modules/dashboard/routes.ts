import { dashboardResponseSchema } from '@hq-crion/contracts/dashboard';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  passaNoDashboard,
  periodoDaQuery,
  recorteDaQuery
} from '../atendimentos/filtros.js';
import { registroDaAutorizacao } from '../perfil/sessoes.js';
import { pulsoDoDashboard } from './agregacao.js';

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel === 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const query = request.query as Record<string, string | undefined>;
    const recorte = recorteDaQuery(query);

    if (!recorte) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const filtrados = app.atendimentos
      .listar()
      .filter((item) => passaNoDashboard(item, recorte, query));

    return dashboardResponseSchema.parse(
      pulsoDoDashboard(filtrados, recorte, periodoDaQuery(query))
    );
  });
};

export default dashboardRoutes;
