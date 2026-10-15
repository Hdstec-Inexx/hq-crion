import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { perfilDaAutorizacao } from '../perfil/sessoes.js';
import { extrairIntervaloDeBytes } from './range.js';

function semCache(reply: { header(name: string, value: string): void }) {
  reply.header('Cache-Control', 'no-store');
}

async function resolverBuffer(conteudo: Buffer | NodeJS.ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(conteudo)) {
    return conteudo;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of conteudo as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

    const buffer = await resolverBuffer(bytes.conteudo);
    const total = buffer.byteLength;

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', bytes.tipo);

    const rangeHeader = request.headers.range;
    if (rangeHeader) {
      const resultadoRange = extrairIntervaloDeBytes(rangeHeader, total);

      if (resultadoRange.tipo === 'insatisfativel') {
        reply.code(416);
        reply.header('Content-Range', `bytes */${total}`);
        return reply.send();
      }

      if (resultadoRange.tipo === 'intervalo') {
        const { inicio, fim } = resultadoRange;
        const fatia = buffer.subarray(inicio, fim + 1);
        reply.code(206);
        reply.header('Content-Range', `bytes ${inicio}-${fim}/${total}`);
        reply.header('Content-Length', fatia.byteLength);
        return reply.send(fatia);
      }
    }

    reply.code(200);
    reply.header('Content-Length', total);
    return reply.send(buffer);
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
