import type { ExecutorSql } from '../atendimentos/postgres.js';

const locais = new Map<string, Buffer>();

export function guardarMidiaLocal(id: string, conteudo: Buffer) {
  locais.set(id, conteudo);
}

export function lerMidiaLocal(id: string) {
  return locais.get(id);
}

export async function gravarMidia(cliente: ExecutorSql, id: string, conteudo: Buffer) {
  await cliente.query(
    `INSERT INTO hq_midia (atendimento_id, conteudo)
     VALUES ($1, $2)
     ON CONFLICT (atendimento_id) DO UPDATE SET conteudo = EXCLUDED.conteudo`,
    [id, conteudo]
  );
}

export async function lerMidiaDoDeposito(cliente: ExecutorSql, id: string) {
  const resultado = await cliente.query(
    `SELECT conteudo FROM hq_midia WHERE atendimento_id = $1`,
    [id]
  );
  const conteudo = resultado.rows[0]?.conteudo as Buffer | undefined;
  return conteudo && conteudo.byteLength > 0 ? conteudo : undefined;
}

declare module 'fastify' {
  interface FastifyInstance {
    lerMidia(id: string): Promise<Buffer | undefined>;
  }
}
