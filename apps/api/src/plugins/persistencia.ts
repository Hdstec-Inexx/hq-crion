import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { aplicarMigracoes } from '../db/migrar.js';
import { semearEstrutura } from '../db/semente-estrutural.js';
import { repositorioEmMemoria } from '../modules/atendimentos/memoria.js';
import {
  repositorioPostgres,
  semearSeNecessario
} from '../modules/atendimentos/postgres.js';
import { ingerirElevenLabs, coletarDaFonte, registrarMidiaLocal } from '../modules/ingestao/boot.js';
import { baixarAudio } from '../modules/ingestao/elevenlabs.js';
import {
  gravarMidia,
  guardarMidiaLocal,
  lerMidiaDoDeposito,
  lerMidiaLocal,
  type MidiaGuardada
} from '../modules/midia/deposito.js';
import {
  buscarMidiaNoS3,
  bucketConfigurado,
  criarClienteS3,
  descobrirCaminhoNoS3
} from '../modules/midia/s3.js';
import {
  buscarMidiaNoMinio,
  criarClienteMinio,
  descobrirCaminhoNoMinio
} from '../modules/midia/minio.js';
import {
  aplicarConfiguracaoDaIa,
  lerConfiguracaoDoDeposito,
  usarDepositoDaIa
} from '../modules/ia-avaliadora/repositorio.js';
import {
  aplicarPerfis,
  lerPerfisDoDeposito,
  usarDepositoDePerfis
} from '../modules/perfil/repositorio.js';
import { aplicarRegua, lerReguaDoDeposito } from '../modules/regua/regua-unica.js';
import type { PortaDeAtendimentos } from '../modules/atendimentos/porta.js';

declare module 'fastify' {
  interface FastifyInstance {
    atendimentos: PortaDeAtendimentos;
  }
}

export type FonteDePersistencia = 'memoria' | 'postgres';

const timeoutPadraoDoPlugin = 10_000;
const timeoutDeProducaoDoPlugin = 120_000;

export function timeoutDoPluginPersistencia(env: { NODE_ENV?: string }) {
  return env.NODE_ENV === 'production'
    ? timeoutDeProducaoDoPlugin
    : timeoutPadraoDoPlugin;
}

export function ingestaoEsperaOPlugin(fonte: FonteDePersistencia) {
  return fonte === 'memoria';
}

export function fonteDePersistencia(env: {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DEPOSITO?: string;
}): FonteDePersistencia {
  const url = env.DATABASE_URL?.trim();
  const aceitePostgres =
    env.NODE_ENV === 'test' && env.DEPOSITO === 'postgres' && Boolean(url);

  if (env.NODE_ENV === 'test' && !aceitePostgres) {
    return 'memoria';
  }

  if (url) {
    return 'postgres';
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatório em produção; o HQ não usa o catálogo em memória.'
    );
  }

  return 'memoria';
}

function montarLeitorDeMidia(
  obterLocal: (chave: string) => Promise<MidiaGuardada | undefined> | MidiaGuardada | undefined,
  gravarLocal: ((chave: string, midia: MidiaGuardada) => Promise<void> | void) | null,
  clienteMinio: ReturnType<typeof criarClienteMinio>,
  clienteS3: ReturnType<typeof criarClienteS3>,
  bucket: string,
  elevenlabs?: { apiKey?: string; baseUrl: string }
) {
  return {
    lerMidia: async (arquivoOuId: string) => {
      const local = await obterLocal(arquivoOuId);
      if (local) {
        return local;
      }

      if (clienteMinio) {
        const doMinio = await buscarMidiaNoMinio(clienteMinio, bucket, arquivoOuId);
        if (doMinio) {
          return doMinio;
        }
      }

      if (clienteS3) {
        const doS3 = await buscarMidiaNoS3(clienteS3, bucket, arquivoOuId);
        if (doS3) {
          return doS3;
        }
      }

      if (elevenlabs?.apiKey) {
        const idLimpo = arquivoOuId.replace(/\.[A-Za-z0-9]+$/, '').replace(/^atendimentos\//, '');
        if (idLimpo.startsWith('conv_')) {
          try {
            const midia = await baixarAudio(
              fetch,
              elevenlabs.baseUrl,
              elevenlabs.apiKey,
              idLimpo
            );
            if (midia) {
              if (gravarLocal) {
                await gravarLocal(idLimpo, midia);
              }
              return midia;
            }
          } catch {
            // segue
          }
        }
      }

      return undefined;
    },
    descobrirMidia: async (id: string) => {
      const local = await obterLocal(id);
      if (local) {
        const idLimpo = id.replace(/\.[A-Za-z0-9]+$/, '');
        const extensao = local.tipo === 'audio/mpeg' ? 'mp3' : 'wav';
        return `/media/${idLimpo}.${extensao}`;
      }

      if (clienteMinio) {
        const doMinio = await descobrirCaminhoNoMinio(clienteMinio, bucket, id);
        if (doMinio) {
          return doMinio;
        }
      }

      if (clienteS3) {
        const doS3 = await descobrirCaminhoNoS3(clienteS3, bucket, id);
        if (doS3) {
          return doS3;
        }
      }

      if (elevenlabs?.apiKey) {
        const idLimpo = id.replace(/\.[A-Za-z0-9]+$/, '').replace(/^atendimentos\//, '');
        if (idLimpo.startsWith('conv_')) {
          try {
            const midia = await baixarAudio(
              fetch,
              elevenlabs.baseUrl,
              elevenlabs.apiKey,
              idLimpo
            );
            if (midia) {
              if (gravarLocal) {
                await gravarLocal(idLimpo, midia);
              }
              const extensao = midia.tipo === 'audio/mpeg' ? 'mp3' : 'wav';
              return `/media/${idLimpo}.${extensao}`;
            }
          } catch {
            // segue
          }
        }
      }

      return undefined;
    }
  };
}

export default fp(
  async (app) => {
    const fonte = fonteDePersistencia({
      NODE_ENV: app.config.NODE_ENV,
      DATABASE_URL: app.config.DATABASE_URL,
      DEPOSITO: app.config.DEPOSITO
    });

    const clienteMinio = criarClienteMinio(app.config);
    const clienteS3 = criarClienteS3(app.config);
    const bucket = bucketConfigurado(
      app.config.STORAGE_BUCKET ?? app.config.S3_BUCKET
    );

    if (fonte === 'memoria') {
      usarDepositoDePerfis(null);
      usarDepositoDaIa(null);
      const coletados = await coletarDaFonte(app.config, app.log);
      app.decorate('atendimentos', repositorioEmMemoria(registrarMidiaLocal(coletados)));
      const resolvedor = montarLeitorDeMidia(
        lerMidiaLocal,
        guardarMidiaLocal,
        clienteMinio,
        clienteS3,
        bucket,
        {
          apiKey: app.config.ELEVENLABS_API_KEY,
          baseUrl: app.config.ELEVENLABS_BASE_URL
        }
      );
      app.decorate('lerMidia', resolvedor.lerMidia);
      app.decorate('descobrirMidia', resolvedor.descobrirMidia);
      return;
    }

    const pool = new Pool({
      connectionString: app.config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
    let poolFechado = false;
    const fecharPool = async () => {
      if (poolFechado) {
        return;
      }

      poolFechado = true;
      await pool.end();
    };
    app.addHook('onClose', fecharPool);
    pool.on('connect', (conexao) => {
      void conexao.query("SET statement_timeout = '15s'");
    });

    try {
      await aplicarMigracoes(pool);
      await semearEstrutura(pool);
      await semearSeNecessario(pool, app.config.SKIP_SEED);
      const perfis = await lerPerfisDoDeposito(pool);
      const regua = await lerReguaDoDeposito(pool);
      const configuracao = await lerConfiguracaoDoDeposito(pool);
      aplicarPerfis(perfis);
      aplicarRegua(regua);
      aplicarConfiguracaoDaIa(configuracao);
      usarDepositoDePerfis(pool);
      usarDepositoDaIa(pool);
      app.decorate('atendimentos', repositorioPostgres(pool));
      const resolvedor = montarLeitorDeMidia(
        (arquivoOuId) => lerMidiaDoDeposito(pool, arquivoOuId),
        (arquivoOuId, midia) => gravarMidia(pool, arquivoOuId, midia),
        clienteMinio,
        clienteS3,
        bucket,
        {
          apiKey: app.config.ELEVENLABS_API_KEY,
          baseUrl: app.config.ELEVENLABS_BASE_URL
        }
      );
      app.decorate('lerMidia', resolvedor.lerMidia);
      app.decorate('descobrirMidia', resolvedor.descobrirMidia);
      if (!ingestaoEsperaOPlugin(fonte)) {
        void ingerirElevenLabs(pool, app.config, app.log).catch((error) => {
          app.log.warn(
            { err: error },
            'Ingestão mínima ElevenLabs falhou; o HQ segue com o DB Crion'
          );
        });
      }
    } catch (error) {
      await fecharPool();
      throw error;
    }
  },
  { name: 'persistencia', dependencies: ['config'] }
);
