import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
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

export function formatarEndpointS3(endpoint: string | undefined): string | undefined {
  if (!endpoint || endpoint.trim() === '') {
    return undefined;
  }
  const limpo = endpoint.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(limpo)) {
    return limpo;
  }
  return `http://${limpo}`;
}

function chavesCandidatas(arquivoOuId: string): string[] {
  const limpo = arquivoOuId.trim();
  const semExt = limpo.replace(/\.[A-Za-z0-9]+$/, '');
  const baseName = semExt.replace(/^atendimentos\//, '');

  const set = new Set<string>();
  set.add(`atendimentos/${baseName}.mp3`);
  set.add(`atendimentos/${baseName}.wav`);
  if (limpo.endsWith('.mp3') || limpo.endsWith('.wav')) {
    set.add(limpo);
  }
  set.add(`${baseName}.mp3`);
  set.add(`${baseName}.wav`);
  set.add(`atendimentos/${baseName}`);
  set.add(baseName);
  set.add(semExt);
  set.add(limpo);

  return Array.from(set);
}

export function criarClienteS3(
  config: Pick<AppConfig, 'S3_ENDPOINT' | 'S3_ACCESS_KEY' | 'S3_SECRET_KEY' | 'S3_BUCKET'>
): S3Client | undefined {
  if (!config.S3_BUCKET && !config.S3_ENDPOINT) {
    return undefined;
  }

  const credentials =
    config.S3_ACCESS_KEY && config.S3_SECRET_KEY
      ? {
          accessKeyId: config.S3_ACCESS_KEY,
          secretAccessKey: config.S3_SECRET_KEY
        }
      : undefined;

  const endpoint = formatarEndpointS3(config.S3_ENDPOINT);

  return new S3Client({
    endpoint,
    region: 'us-east-1',
    ...(credentials ? { credentials } : {}),
    forcePathStyle: true,
    tls: endpoint ? endpoint.startsWith('https://') : false
  });
}

export async function buscarMidiaNoS3(
  cliente: S3Client,
  bucket: string,
  arquivoOuId: string
): Promise<MidiaGuardada | undefined> {
  const candidatos = chavesCandidatas(arquivoOuId);

  for (const chave of candidatos) {
    try {
      const resposta = await cliente.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: chave
        })
      );

      if (!resposta.Body) {
        continue;
      }

      const tipo = tipoDeMidiaPorChave(chave);
      const conteudo =
        typeof (resposta.Body as any).pipe === 'function'
          ? (resposta.Body as unknown as NodeJS.ReadableStream)
          : Buffer.from(await resposta.Body.transformToByteArray());

      return {
        conteudo,
        tipo
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function descobrirCaminhoNoS3(
  cliente: S3Client,
  bucket: string,
  id: string
): Promise<string | undefined> {
  const candidatos = chavesCandidatas(id);

  for (const chave of candidatos) {
    try {
      await cliente.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: chave
        })
      );

      const extensao = chave.endsWith('.mp3') ? 'mp3' : chave.endsWith('.wav') ? 'wav' : 'mp3';
      const caminhoLimpo = chave.includes('.') ? chave : `${chave}.${extensao}`;
      return `/media/${caminhoLimpo}`;
    } catch {
      try {
        const getRes = await cliente.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: chave,
            Range: 'bytes=0-0'
          })
        );

        if (getRes.Body) {
          const extensao = chave.endsWith('.mp3') ? 'mp3' : chave.endsWith('.wav') ? 'wav' : 'mp3';
          const caminhoLimpo = chave.includes('.') ? chave : `${chave}.${extensao}`;
          return `/media/${caminhoLimpo}`;
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}
