import { reguaDeAvaliacaoSchema, type ReguaDeAvaliacao } from '@hq-crion/contracts/regua';
import { autorizacao } from '../auth/api';
import { urlDaApi } from '../../urlDaApi';

const apiUrl = urlDaApi();

export async function buscarRegua(
  sessao: string,
  signal?: AbortSignal
): Promise<ReguaDeAvaliacao | null> {
  const response = await fetch(`${apiUrl}/regua`, {
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('regua-indisponivel');
  }

  return reguaDeAvaliacaoSchema.parse(await response.json());
}
