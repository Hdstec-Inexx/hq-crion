import {
  listaDePerfisSchema,
  loginRequestSchema,
  loginResponseSchema,
  ativoDoPerfilSchema,
  motivoUltimoAdmin,
  perfilSchema,
  redefinirSenhaSchema
} from '@hq-crion/contracts/perfil';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  atualizarPerfil,
  buscarPorEmail,
  criarPerfil,
  definirAtivo,
  gravarHashSeTextoClaro,
  listarPerfis,
  perfilComId,
  perfilDaSessao,
  redefinirSenha
} from './repositorio.js';
import { senhaConfere, hashParaPerfilAusente } from './senha.js';
import {
  invalidarSessao,
  invalidarSessoesDoPerfil,
  perfilDaAutorizacao,
  registrarSessao,
  tokenDaAutorizacao
} from './sessoes.js';

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

function ehUltimoAdmin(resultado: unknown): resultado is typeof motivoUltimoAdmin {
  return resultado === motivoUltimoAdmin;
}

function recusarUltimoAdmin(reply: FastifyReply) {
  return reply.code(409).send({ statusCode: 409, motivo: motivoUltimoAdmin });
}

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

const perfilRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    semCache(reply);
    const parsed = loginRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const encontrado = buscarPorEmail(parsed.data.email);
    const senhaOk = senhaConfere(
      encontrado?.senha ?? hashParaPerfilAusente,
      parsed.data.senha
    );

    if (!encontrado || !senhaOk || !encontrado.ativo) {
      return reply.code(401).send({ statusCode: 401 });
    }

    await gravarHashSeTextoClaro(encontrado, parsed.data.senha);

    const perfil = perfilDaSessao(encontrado);
    const sessao = randomUUID();
    registrarSessao(sessao, encontrado.id, encontrado.versao);
    return loginResponseSchema.parse({
      perfil,
      sessao
    });
  });

  app.get('/perfil', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    return perfilSchema.parse(perfil);
  });

  app.get('/perfis', async (request, reply) => {
    semCache(reply);
    const recusa = recusarSeNaoForAdmin(request, reply);

    if (recusa) {
      return recusa;
    }

    return listaDePerfisSchema.parse({
      perfis: listarPerfis()
    });
  });

  app.post('/perfis', async (request, reply) => {
    semCache(reply);
    const recusa = recusarSeNaoForAdmin(request, reply);

    if (recusa) {
      return recusa;
    }

    const parsed = perfilSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    if (buscarPorEmail(parsed.data.email)) {
      return reply.code(409).send({ statusCode: 409 });
    }

    const registro = await criarPerfil(parsed.data);
    return reply.code(201).send(perfilComId(registro));
  });

  app.put('/perfis/:id', async (request, reply) => {
    semCache(reply);
    const recusa = recusarSeNaoForAdmin(request, reply);

    if (recusa) {
      return recusa;
    }

    const parsed = perfilSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const emailEmUso = buscarPorEmail(parsed.data.email);

    if (emailEmUso && emailEmUso.id !== id) {
      return reply.code(409).send({ statusCode: 409 });
    }

    const registro = await atualizarPerfil(id, parsed.data);

    if (ehUltimoAdmin(registro)) {
      return recusarUltimoAdmin(reply);
    }

    if (!registro) {
      return reply.code(404).send({ statusCode: 404 });
    }

    return perfilComId(registro);
  });

  app.put('/perfis/:id/ativo', async (request, reply) => {
    semCache(reply);
    const recusa = recusarSeNaoForAdmin(request, reply);

    if (recusa) {
      return recusa;
    }

    const parsed = ativoDoPerfilSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const resultado = await definirAtivo(id, parsed.data.ativo);

    if (ehUltimoAdmin(resultado)) {
      return recusarUltimoAdmin(reply);
    }

    if (!resultado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (!resultado.ativo) {
      invalidarSessoesDoPerfil(resultado.id);
    }

    return perfilComId(resultado);
  });

  app.put('/perfis/:id/senha', async (request, reply) => {
    semCache(reply);
    const recusa = recusarSeNaoForAdmin(request, reply);

    if (recusa) {
      return recusa;
    }

    const parsed = redefinirSenhaSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const registro = await redefinirSenha(id, parsed.data.senha);

    if (!registro) {
      return reply.code(404).send({ statusCode: 404 });
    }

    invalidarSessoesDoPerfil(registro.id);
    return reply.code(204).send();
  });

  app.post('/sair', async (request, reply) => {
    semCache(reply);
    const token = tokenDaAutorizacao(request.headers.authorization);

    if (token) {
      invalidarSessao(token);
    }

    return reply.code(204).send();
  });
};

export default perfilRoutes;
