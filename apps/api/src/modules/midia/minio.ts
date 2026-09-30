import { Client as MinioClient } from 'minio';
import type { AppConfig } from '../../plugins/config.js';
import type { MidiaGuardada } from './deposito.js';

export const BUCKET_PADRAO = 'hq-crion';

export function bucketConfigurado(bucket: string | undefined): string {
  return bucket?.trim() || BUCKET_PADRAO;
}

export function tipoDeMidiaPorChave(chave: string): string {
  if (chave.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  return 'audio/wav';
}

export function chavesCandidatas(arquivoOuId: string): string[] {
  const limpo = arquivoOuId.trim();
  const semExt = limpo.replace(/\.[A-Za-z0-9]+$/, '');
  const baseName = semExt.replace(/^atendimentos\//, '');

  const set = new Set<string>();
  // 1. Chaves com prefixo atendimentos/ (padrão n8n / hq-geap)
  set.add(`atendimentos/${baseName}.mp3`);
  set.add(`atendimentos/${baseName}.wav`);
  // 2. Chaves na raiz do bucket
  set.add(`${baseName}.mp3`);
  set.add(`${baseName}.wav`);
  // 3. Chave exata
  set.add(limpo);
  set.add(`atendimentos/${baseName}`);
  set.add(baseName);

  return Array.from(set);
}

export function formatarEndpointMinio(endpoint: string | undefined): {
  endPoint: string;
  port: number;
  useSSL: boolean;
} | undefined {
  if (!endpoint || endpoint.trim() === '') {
    return undefined;
  }

  const raw = endpoint.trim();
  const withProto = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

  try {
    const url = new URL(withProto);
    const useSSL = url.protocol === 'https:';
    const port = url.port ? Number(url.port) : useSSL ? 443 : 80;

    return {
      endPoint: url.hostname,
      port,
      useSSL
    };
  } catch {
    return undefined;
  }
}

export function criarClienteMinio(
  config: Pick<
    AppConfig,
    | 'S3_ENDPOINT'
    | 'S3_ACCESS_KEY'
    | 'S3_SECRET_KEY'
    | 'S3_BUCKET'
    | 'STORAGE_ENDPOINT'
    | 'STORAGE_ACCESS_KEY'
    | 'STORAGE_SECRET_KEY'
    | 'STORAGE_BUCKET'
  >
): MinioClient | undefined {
  const endpointStr = config.STORAGE_ENDPOINT ?? config.S3_ENDPOINT;
  const accessKey =
    config.STORAGE_ACCESS_KEY ?? config.S3_ACCESS_KEY ?? 'minioadmin';
  const secretKey =
    config.STORAGE_SECRET_KEY ?? config.S3_SECRET_KEY ?? 'minioadmin';

  if (!endpointStr) {
    return undefined;
  }

  const endpointConfig = formatarEndpointMinio(endpointStr);
  if (!endpointConfig) {
    return undefined;
  }

  try {
    return new MinioClient({
      endPoint: endpointConfig.endPoint,
      port: endpointConfig.port,
      useSSL: endpointConfig.useSSL,
      accessKey,
      secretKey
    });
  } catch {
    return undefined;
  }
}

export async function buscarMidiaNoMinio(
  minio: MinioClient,
  bucket: string,
  arquivoOuId: string
): Promise<MidiaGuardada | undefined> {
  const candidatos = chavesCandidatas(arquivoOuId);

  for (const chave of candidatos) {
    try {
      const stream = await minio.getObject(bucket, chave);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const conteudo = Buffer.concat(chunks);
      if (conteudo.byteLength === 0) {
        continue;
      }

      return {
        conteudo,
        tipo: tipoDeMidiaPorChave(chave)
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function descobrirCaminhoNoMinio(
  minio: MinioClient,
  bucket: string,
  id: string
): Promise<string | undefined> {
  const candidatos = chavesCandidatas(id);
  const baseId = id.trim().replace(/\.[A-Za-z0-9]+$/, '').replace(/^atendimentos\//, '');

  for (const chave of candidatos) {
    try {
      const stat = await minio.statObject(bucket, chave);
      if (stat && stat.size > 0) {
        try {
          return await minio.presignedGetObject(bucket, chave, 15 * 60);
        } catch {
          const extensao = chave.endsWith('.mp3') ? 'mp3' : 'wav';
          return `/media/${baseId}.${extensao}`;
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
