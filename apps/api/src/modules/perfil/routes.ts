import {
  loginRequestSchema,
  loginResponseSchema,
  perfilSchema,
  type Perfil
} from '@hq-crion/contracts/perfil';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

const perfisComSenha: Array<Perfil & { senha: string }> = [
  {
    nome: 'Ana Souza',
    email: 'ana.souza@crion',
    papel: 'Gestão',
    senha: 'crion-hq'
  },
  {
    nome: 'Carla Mendes',
    email: 'carla.mendes@crion',
    papel: 'Curador',
    senha: 'crion-hq'
  },
  {
    nome: 'Bruno Alves',
    email: 'bruno.alves@crion',
    papel: 'Admin',
    senha: 'crion-hq'
  }
];

const sessoes = new Map<string, Perfil>();

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function senhaConfere(guardada: string, recebida: string) {
  const esperada = Buffer.from(guardada);
  const informada = Buffer.from(recebida);

  if (esperada.length !== informada.length) {
    timingSafeEqual(esperada, esperada);
    return false;
  }

  return timingSafeEqual(esperada, informada);
}

function tokenDaAutorizacao(authorization: string | undefined) {
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
}

function perfilDaAutorizacao(authorization: string | undefined) {
  const token = tokenDaAutorizacao(authorization);
  return token ? sessoes.get(token) : undefined;
}

const perfilRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    semCache(reply);
    const parsed = loginRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const email = parsed.data.email.trim();
    const encontrado = perfisComSenha.find(
      (registro) => registro.email === email && senhaConfere(registro.senha, parsed.data.senha)
    );

    if (!encontrado) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const perfil: Perfil = {
      nome: encontrado.nome,
      email: encontrado.email,
      papel: encontrado.papel
    };
    const sessao = randomUUID();
    sessoes.set(sessao, perfil);
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

  app.post('/sair', async (request, reply) => {
    semCache(reply);
    const token = tokenDaAutorizacao(request.headers.authorization);

    if (token) {
      sessoes.delete(token);
    }

    return reply.code(204).send();
  });
};

export default perfilRoutes;
