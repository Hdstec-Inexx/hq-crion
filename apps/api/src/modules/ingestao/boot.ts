import type { AppConfig } from '../../plugins/config.js';
import type { ClienteSql } from '../atendimentos/postgres.js';
import { gravarAtendimento } from '../atendimentos/postgres.js';
import { coletarConversasElevenLabs } from './elevenlabs.js';

export async function ingerirFonteExterna(
  cliente: ClienteSql,
  config: AppConfig,
  log: { warn: (obj: unknown, msg?: string) => void }
) {
  if (!config.ELEVENLABS_API_KEY) {
    return;
  }

  try {
    const atendimentos = await coletarConversasElevenLabs({
      apiKey: config.ELEVENLABS_API_KEY,
      baseUrl: config.ELEVENLABS_BASE_URL
    });

    for (const atendimento of atendimentos) {
      await gravarAtendimento(cliente, atendimento);
    }
  } catch (error) {
    log.warn({ err: error }, 'Ingestão mínima ElevenLabs falhou; o HQ segue com o DB Crion');
  }
}
