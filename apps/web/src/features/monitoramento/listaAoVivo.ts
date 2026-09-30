import type { MonitoramentoListagemResponse } from '@hq-crion/contracts/atendimento';
import { useEffect, useRef, useState } from 'react';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';
import {
  consultaDaListaAoVivo,
  destinoDaFalhaInicial,
  intervaloDoPulsoMs,
  normalizarListagemAoVivo
} from './pulso';
import { abortou } from './useAtualizacaoAoVivo';

const apiUrl = urlDaApi();

export type EstadoDaListaAoVivo =
  | { status: 'loading' }
  | { status: 'error'; motivo: 'recorte' | 'lista' }
  | { status: 'ready'; data: MonitoramentoListagemResponse };

export function useListaAoVivo(searchParams: URLSearchParams) {
  const [state, setState] = useState<EstadoDaListaAoVivo>({ status: 'loading' });
  const paramsRef = useRef(searchParams);
  const geracaoRef = useRef(0);
  paramsRef.current = searchParams;
  const recorte = consultaDaListaAoVivo(searchParams);

  useEffect(() => {
    setState((atual) => (atual.status === 'loading' ? atual : { status: 'loading' }));
    let cancelled = false;
    let refreshTimer: number | undefined;
    let releaseVisibilityWait: (() => void) | undefined;
    let activeAbort: AbortController | undefined;
    const geracao = ++geracaoRef.current;

    function vigente() {
      return !cancelled && geracaoRef.current === geracao;
    }

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

    function leituraDescartada(error: unknown, signal: AbortSignal) {
      return !vigente() || signal.aborted || abortou(error);
    }

    function manterListaOuFalhar(motivo: 'lista' | 'recorte') {
      setState((atual) =>
        atual.status === 'ready' ? atual : { status: 'error', motivo }
      );
    }

    async function buscarUmaVez(inicial: boolean, tentativa: number) {
      const session = lerSessao();

      if (!session) {
        if (vigente()) {
          manterListaOuFalhar('lista');
        }

        return 'auth' as const;
      }

      if (inicial && tentativa === 0 && vigente()) {
        setState({ status: 'loading' });
      }

      const controller = new AbortController();
      activeAbort?.abort();
      activeAbort = controller;
      const query = consultaDaListaAoVivo(paramsRef.current);

      try {
        const response = await fetch(`${apiUrl}/monitoramento?${query}`, {
          headers: {
            ...autorizacao(session),
            'Cache-Control': 'no-store'
          },
          signal: controller.signal
        });

        if (!vigente()) {
          return 'aborted' as const;
        }

        if (response.status === 400) {
          if (vigente()) {
            if (inicial) {
              setState({ status: 'error', motivo: 'recorte' });
            } else {
              manterListaOuFalhar('recorte');
            }
          }

          return 'error' as const;
        }

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const data = normalizarListagemAoVivo(await response.json());

        if (!vigente() || consultaDaListaAoVivo(paramsRef.current) !== query) {
          return 'aborted' as const;
        }

        if (!data) {
          throw new Error('Request failed with invalid body');
        }

        setState({ status: 'ready', data });
        return 'ok' as const;
      } catch (error: unknown) {
        const destino = destinoDaFalhaInicial({
          descartada: leituraDescartada(error, controller.signal),
          podeRepetir: inicial && tentativa < 1
        });

        if (destino === 'ignorar') {
          return 'aborted' as const;
        }

        if (destino === 'repetir') {
          return 'repetir' as const;
        }

        if (vigente()) {
          manterListaOuFalhar('lista');
        }

        return 'error' as const;
      }
    }

    async function load(isInitial: boolean) {
      const limite = isInitial ? 2 : 1;

      for (let tentativa = 0; tentativa < limite; tentativa += 1) {
        const resultado = await buscarUmaVez(isInitial, tentativa);

        if (resultado !== 'repetir') {
          return resultado;
        }
      }

      return 'error' as const;
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
      activeAbort?.abort();
    };
  }, [recorte]);

  return state;
}
