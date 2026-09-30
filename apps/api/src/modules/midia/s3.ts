import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import type { AppConfig } from '../../plugins/config.js';
import type { MidiaGuardada } from './deposito.js';

export function tipoDeMidiaPorChave(chave: string): string {
  if (chave.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  return 'audio/wav';
}

function chavesCandidatas(arquivoOuId: string): string[] {
  if (/\.[A-Za-z0-9]+$/.test(arquivoOuId)) {
    return [arquivoOuId];
  }

  return [
    `${arquivoOuId}.mp3`,
    `${arquivoOuId}.wav`,
    arquivoOuId
  ];
}

export function criarClienteS3(
  config: Pick<AppConfig, 'S3_ENDPOINT' | 'S3_ACCESS_KEY' | 'S3_SECRET_KEY' | 'S3_BUCKET'>
): S3Client | undefined {
  if (!config.S3_BUCKET) {
    return undefined;
  }

  return new S3Client({
    endpoint: config.S3_ENDPOINT || undefined,
    region: 'us-east-1',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY ?? '',
      secretAccessKey: config.S3_SECRET_KEY ?? ''
    },
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

      const bytes = await resposta.Body.transformToByteArray();

      if (!bytes || bytes.length === 0) {
        continue;
      }

      const tipo =
        resposta.ContentType && /^audio\/[a-z0-9.+-]+$/.test(resposta.ContentType)
          ? resposta.ContentType
          : tipoDeMidiaPorChave(chave);

      return {
        conteudo: Buffer.from(bytes),
        tipo
      };
    } catch {
      // Tenta o próximo candidato se a chave não existir
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
