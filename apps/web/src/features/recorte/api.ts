import {
  catalogoAgentesResponseSchema,
  agentesDeVoz,
  type AgenteDeVoz
} from '@hq-crion/contracts/recorte';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';

const apiUrl = urlDaApi();

export async function buscarAgentes(signal?: AbortSignal): Promise<AgenteDeVoz[]> {
  const sessao = lerSessao();

  if (!sessao) {
    return agentesDeVoz;
  }

  try {
    const response = await fetch(`${apiUrl}/agentes`, {
      signal,
      headers: {
        ...autorizacao(sessao),
        'Cache-Control': 'no-store'
      }
    });

    if (!response.ok) {
      return agentesDeVoz;
    }

    const json = await response.json();
    const parseado = catalogoAgentesResponseSchema.safeParse(json);
    return parseado.success && parseado.data.length > 0 ? parseado.data : agentesDeVoz;
  } catch {
    return agentesDeVoz;
  }
}
