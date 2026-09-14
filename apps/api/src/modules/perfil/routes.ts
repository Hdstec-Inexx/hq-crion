import {
  loginRequestSchema,
  loginResponseSchema,
  perfilSchema,
  type Perfil
} from '@hq-crion/contracts/perfil';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

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
    const parsed = loginRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const encontrado = perfisComSenha.find(
      (conta) =>
        conta.email === parsed.data.email && conta.senha === parsed.data.senha
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
    reply.header('Cache-Control', 'no-store');
    return loginResponseSchema.parse({
      perfil,
      sessao
    });
  });

  app.get('/perfil', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    return perfilSchema.parse(perfil);
  });

  app.post('/sair', async (request, reply) => {
    const token = tokenDaAutorizacao(request.headers.authorization);

    if (token) {
      sessoes.delete(token);
    }

    reply.header('Cache-Control', 'no-store');
    return reply.code(204).send();
  });
};

export default perfilRoutes;
