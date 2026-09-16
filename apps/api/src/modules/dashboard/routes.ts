import { dashboardResponseSchema } from '@hq-crion/contracts/dashboard';
import { lerRecorte } from '@hq-crion/contracts/recorte';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { passaNoDashboard, periodoDaQuery } from '../atendimentos/filtros.js';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';
import { registroDaAutorizacao } from '../perfil/sessoes.js';
import { reguaUnica } from '../regua/regua-unica.js';

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function kpisDoPeriodo(itens: RegistroDeAtendimento[]) {
  const atendimentos = itens.length;
  const notaMedia =
    atendimentos === 0
      ? null
      : itens.reduce((soma, item) => soma + item.nota, 0) / atendimentos;
  const aprovados = itens.filter(
    (item) => item.nota >= reguaUnica.limiarDeAprovacao
  ).length;
  const aprovacao =
    atendimentos === 0 ? null : (aprovados / atendimentos) * 100;

  return [
    { id: 'atendimentos' as const, rotulo: 'Atendimentos', valor: atendimentos },
    { id: 'notaMedia' as const, rotulo: 'Nota média', valor: notaMedia },
    { id: 'aprovacao' as const, rotulo: 'Aprovação', valor: aprovacao }
  ];
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
    let recorte;

    try {
      recorte = lerRecorte({
        administradora: query.administradora,
        agente: query.agente
      });
    } catch {
      return reply.code(400).send({ statusCode: 400 });
    }

    const filtrados = app.atendimentos
      .listar()
      .filter((item) => passaNoDashboard(item, recorte, query));

    return dashboardResponseSchema.parse({
      recorte,
      periodo: periodoDaQuery(query),
      kpis: kpisDoPeriodo(filtrados)
    });
  });
};

export default dashboardRoutes;
