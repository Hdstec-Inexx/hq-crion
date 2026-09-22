import type { AppConfig } from '../../plugins/config.js';
import type { ExecutorSql } from '../atendimentos/postgres.js';
import { inserirAtendimentoSeAusente } from '../atendimentos/postgres.js';
import { coletarAtendimentosElevenLabs } from './elevenlabs.js';

export async function ingerirElevenLabs(
  cliente: ExecutorSql,
  config: AppConfig,
  log: { warn: (obj: unknown, msg?: string) => void }
) {
  if (!config.ELEVENLABS_API_KEY) {
    return;
  }

  try {
    const atendimentos = await coletarAtendimentosElevenLabs({
      apiKey: config.ELEVENLABS_API_KEY,
      baseUrl: config.ELEVENLABS_BASE_URL
    });

    for (const atendimento of atendimentos) {
      await inserirAtendimentoSeAusente(cliente, atendimento);
    }
  } catch (error) {
    log.warn({ err: error }, 'Ingestão mínima ElevenLabs falhou; o HQ segue com o DB Crion');
  }
}
