import type { AppConfig } from '../../plugins/config.js';
import type { ExecutorSql } from '../atendimentos/postgres.js';
import { inserirAtendimentoSeAusente } from '../atendimentos/postgres.js';
import { gravarMidia, guardarMidiaLocal } from '../midia/deposito.js';
import {
  coletarAtendimentosElevenLabs,
  type AtendimentoColetado
} from './elevenlabs.js';

function semMidia(item: AtendimentoColetado) {
  const { midia: _midia, tipoDaMidia: _tipo, ...registro } = item;
  return registro;
}

export async function coletarDaFonte(
  config: AppConfig,
  log: { warn: (obj: unknown, msg?: string) => void }
) {
  if (!config.ELEVENLABS_API_KEY) {
    return [];
  }

  try {
    return await coletarAtendimentosElevenLabs({
      apiKey: config.ELEVENLABS_API_KEY,
      baseUrl: config.ELEVENLABS_BASE_URL
    });
  } catch (error) {
    log.warn({ err: error }, 'Ingestão mínima ElevenLabs falhou; o HQ segue com o DB Crion');
    return [];
  }
}

export async function ingerirElevenLabs(
  cliente: ExecutorSql,
  config: AppConfig,
  log: { warn: (obj: unknown, msg?: string) => void }
) {
  const atendimentos = await coletarDaFonte(config, log);

  for (const atendimento of atendimentos) {
    await inserirAtendimentoSeAusente(cliente, semMidia(atendimento));

    if (!atendimento.midia) {
      continue;
    }

    await gravarMidia(cliente, atendimento.id, {
      conteudo: atendimento.midia,
      tipo: atendimento.tipoDaMidia ?? 'audio/wav'
    });
  }
}

export function registrarMidiaLocal(atendimentos: readonly AtendimentoColetado[]) {
  for (const atendimento of atendimentos) {
    if (atendimento.midia) {
      guardarMidiaLocal(atendimento.id, {
        conteudo: atendimento.midia,
        tipo: atendimento.tipoDaMidia ?? 'audio/wav'
      });
    }
  }

  return atendimentos.map(semMidia);
}
