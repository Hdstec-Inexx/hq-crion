import type { MonitoramentoListagemResponse } from '@hq-crion/contracts/atendimento';
import { useEffect, useState } from 'react';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';
import { intervaloDoPulsoMs, normalizarListagemAoVivo } from './pulso';
import { abortou } from './useAtualizacaoAoVivo';

const apiUrl = urlDaApi();

export type EstadoDaListaAoVivo =
  | { status: 'loading' }
  | { status: 'error'; motivo: 'recorte' | 'lista' }
  | { status: 'ready'; data: MonitoramentoListagemResponse };

function queryDaListagem(query: URLSearchParams) {
  const limpa = new URLSearchParams();

  for (const chave of ['administradora', 'agente'] as const) {
    const valor = query.get(chave);

    if (valor) {
      limpa.set(chave, valor);
    }
  }

  return limpa;
}

export function useListaAoVivo(chave: string, searchParams: URLSearchParams) {
  const [state, setState] = useState<EstadoDaListaAoVivo>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;
    let releaseVisibilityWait: (() => void) | undefined;
    const abortController = new AbortController();
    const query = queryDaListagem(searchParams).toString();

    function delay(ms: number) {
      return new Promise<void>((resolve) => {
        refreshTimer = window.setTimeout(resolve, ms);
      });
    }

    function whenVisible() {
      if (document.visibilityState === 'visible') {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        function onVisibility() {
          if (document.visibilityState !== 'visible') {
            return;
          }

          document.removeEventListener('visibilitychange', onVisibility);
          releaseVisibilityWait = undefined;
          resolve();
        }

        releaseVisibilityWait = () => {
          document.removeEventListener('visibilitychange', onVisibility);
          releaseVisibilityWait = undefined;
          resolve();
        };
        document.addEventListener('visibilitychange', onVisibility);
      });
    }

    async function load(isInitial: boolean) {
      const session = lerSessao();

      if (!session) {
        if (!cancelled) {
          setState({ status: 'error', motivo: 'lista' });
        }

        return 'auth' as const;
      }

      if (isInitial) {
        setState({ status: 'loading' });
      }

      try {
        const response = await fetch(`${apiUrl}/monitoramento?${query}`, {
          headers: { authorization: autorizacao(session).Authorization },
          signal: abortController.signal
        });

        if (response.status === 400) {
          if (!cancelled && isInitial) {
            setState({ status: 'error', motivo: 'recorte' });
          }

          return 'error' as const;
        }

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const data = normalizarListagemAoVivo(await response.json());

        if (!data) {
          throw new Error('Request failed with invalid body');
        }

        if (!cancelled) {
          setState({ status: 'ready', data });
        }

        return 'ok' as const;
      } catch (error: unknown) {
        if (abortou(error) || (error instanceof DOMException && error.name === 'AbortError')) {
          return 'aborted' as const;
        }

        if (!cancelled && isInitial) {
          setState({ status: 'error', motivo: 'lista' });
        }

        return 'error' as const;
      }
    }

    async function poll() {
      const first = await load(true);

      if (cancelled || first === 'auth') {
        return;
      }

      while (!cancelled) {
        await delay(intervaloDoPulsoMs);
        if (cancelled) {
          return;
        }

        await whenVisible();
        if (cancelled) {
          return;
        }

        const result = await load(false);

        if (result === 'auth') {
          return;
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }

      releaseVisibilityWait?.();
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave já é searchParams.toString()
  }, [chave]);

  return state;
}
