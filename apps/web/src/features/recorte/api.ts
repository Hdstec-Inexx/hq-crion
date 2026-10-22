import {
  catalogoAgentesResponseSchema,
  agentesDeVoz,
  type AgenteDeVoz
} from '@hq-crion/contracts/recorte';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';

const apiUrl = urlDaApi();

let catalogoCache: AgenteDeVoz[] | null = null;
let promessaEmVoo: Promise<AgenteDeVoz[]> | null = null;

export async function buscarAgentes(signal?: AbortSignal, forcar = false): Promise<AgenteDeVoz[]> {
  const sessao = typeof sessionStorage !== 'undefined' ? lerSessao() : null;

  if (!sessao) {
    return agentesDeVoz;
  }

  if (catalogoCache && !forcar) {
    return catalogoCache;
  }

  if (promessaEmVoo && !forcar) {
    return promessaEmVoo;
  }

  promessaEmVoo = (async () => {
    try {
      const response = await fetch(`${apiUrl}/agentes`, {
        signal,
        headers: {
          ...autorizacao(sessao),
          'Cache-Control': 'no-store'
        }
      });

      if (!response.ok) {
        return catalogoCache ?? agentesDeVoz;
      }

      const json = await response.json();
      const parseado = catalogoAgentesResponseSchema.safeParse(json);
      if (parseado.success && parseado.data.length > 0) {
        catalogoCache = parseado.data;
        return parseado.data;
      }
      return catalogoCache ?? agentesDeVoz;
    } catch {
      return catalogoCache ?? agentesDeVoz;
    } finally {
      promessaEmVoo = null;
    }
  })();

  return promessaEmVoo;
}

export function limparCacheCatalogoAgentes() {
  catalogoCache = null;
  promessaEmVoo = null;
}
