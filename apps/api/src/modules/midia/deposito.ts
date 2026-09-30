import type { ExecutorSql } from '../atendimentos/postgres.js';
import { tipoDeMidia } from '../ingestao/elevenlabs.js';

export type MidiaGuardada = {
  conteudo: Buffer | NodeJS.ReadableStream;
  tipo: string;
};

const locais = new Map<string, MidiaGuardada>();

export function guardarMidiaLocal(id: string, midia: MidiaGuardada) {
  locais.set(id, midia);
}

export function removerExtensao(arquivoOuId: string): string {
  return arquivoOuId.replace(/\.[A-Za-z0-9]+$/, '');
}

export function lerMidiaLocal(id: string) {
  const idLimpo = removerExtensao(id);
  return locais.get(idLimpo) ?? locais.get(id);
}

export async function gravarMidia(
  cliente: ExecutorSql,
  id: string,
  midia: MidiaGuardada
) {
  await cliente.query(
    `INSERT INTO hq_midia (atendimento_id, conteudo, tipo)
     VALUES ($1, $2, $3)
     ON CONFLICT (atendimento_id) DO UPDATE SET
       conteudo = EXCLUDED.conteudo,
       tipo = EXCLUDED.tipo`,
    [id, midia.conteudo, midia.tipo]
  );
}

export async function lerMidiaDoDeposito(
  cliente: ExecutorSql,
  id: string
): Promise<MidiaGuardada | undefined> {
  const idLimpo = removerExtensao(id);
  const resultado = await cliente.query(
    `SELECT conteudo, tipo FROM hq_midia WHERE atendimento_id = $1 OR atendimento_id = $2`,
    [idLimpo, id]
  );
  const linha = resultado.rows[0] as { conteudo?: Buffer; tipo?: string } | undefined;
  const tipo = tipoDeMidia(linha?.tipo ?? null) ?? 'audio/wav';

  if (!linha?.conteudo || linha.conteudo.byteLength === 0) {
    return undefined;
  }

  return { conteudo: linha.conteudo, tipo };
}

declare module 'fastify' {
  interface FastifyInstance {
    lerMidia(id: string): Promise<MidiaGuardada | undefined>;
    descobrirMidia(id: string): Promise<string | undefined>;
  }
}
