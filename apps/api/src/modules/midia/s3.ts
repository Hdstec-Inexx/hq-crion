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

function chavesCandidatas(arquivoOuId: string): string[] {
  if (arquivoOuId.endsWith('.mp3') || arquivoOuId.endsWith('.wav')) {
    return [arquivoOuId];
  }

  return [
    `${arquivoOuId}.mp3`,
    `${arquivoOuId}.wav`
  ];
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

  return new S3Client({
    endpoint: config.S3_ENDPOINT || undefined,
    region: 'us-east-1',
    ...(credentials ? { credentials } : {}),
    forcePathStyle: true
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

      return `/media/${chave}`;
    } catch {
      continue;
    }
  }

  return undefined;
}
