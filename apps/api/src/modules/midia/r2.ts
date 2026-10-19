import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import type { AppConfig } from '../../plugins/config.js';
import type { MidiaGuardada } from './deposito.js';

export { S3Client };

export const BUCKET_PADRAO_R2 = 'hq-crion';

export type TipoDeMidiaAudio = 'audio/mpeg' | 'audio/wav';

export function bucketConfiguradoR2(bucket: string | undefined): string {
  return bucket?.trim() || BUCKET_PADRAO_R2;
}

export function tipoDeMidiaPorChave(chave: string): TipoDeMidiaAudio {
  if (chave.toLowerCase().endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  return 'audio/wav';
}

export function formatarEndpointR2(endpoint: string | undefined): string | undefined {
  if (!endpoint || endpoint.trim() === '') {
    return undefined;
  }
  const limpo = endpoint.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(limpo)) {
    return limpo;
  }
  return `https://${limpo}`;
}

export function chavesCandidatas(arquivoOuId: string): string[] {
  const limpo = arquivoOuId.trim();
  const semExt = limpo.replace(/\.[A-Za-z0-9]+$/, '');
  const baseName = semExt.replace(/^atendimentos\//, '');
  const convName = baseName.startsWith('conv_') ? baseName : `conv_${baseName}`;

  const set = new Set<string>();
  // 1. Chaves com prefixo atendimentos/
  set.add(`atendimentos/${baseName}.mp3`);
  set.add(`atendimentos/${baseName}.wav`);
  set.add(`atendimentos/${convName}.mp3`);
  set.add(`atendimentos/${convName}.wav`);

  // 2. Chaves na raiz do bucket
  set.add(`${baseName}.mp3`);
  set.add(`${baseName}.wav`);
  set.add(`${convName}.mp3`);
  set.add(`${convName}.wav`);

  // 3. Chave original se tiver extensão de áudio
  if (limpo.toLowerCase().endsWith('.mp3') || limpo.toLowerCase().endsWith('.wav')) {
    set.add(limpo);
  }

  return Array.from(set);
}

export function criarClienteR2(
  config: Pick<
    AppConfig,
    'R2_ENDPOINT' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET'
  >
): S3Client | undefined {
  const endpoint = formatarEndpointR2(config.R2_ENDPOINT);
  if (
    !endpoint ||
    !config.R2_ACCESS_KEY_ID ||
    !config.R2_SECRET_ACCESS_KEY
  ) {
    return undefined;
  }

  const credentials = {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY
  };

  return new S3Client({
    endpoint,
    region: 'auto',
    credentials,
    forcePathStyle: true
  });
}

export async function buscarMidiaNoR2(
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

export async function descobrirCaminhoNoR2(
  cliente: S3Client,
  bucket: string,
  id: string
): Promise<string | undefined> {
  const candidatos = chavesCandidatas(id);
  const baseId = id.trim().replace(/\.[A-Za-z0-9]+$/, '').replace(/^atendimentos\//, '');
  const formatarCaminho = (chave: string) => {
    const extensao = chave.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav';
    return `/media/${baseId}.${extensao}`;
  };

  for (const chave of candidatos) {
    try {
      await cliente.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: chave
        })
      );

      return formatarCaminho(chave);
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
          try {
            (getRes.Body as any).destroy?.();
          } catch {
            // ignora erro ao fechar stream de probing
          }
          return formatarCaminho(chave);
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}
