import { useEffect, useRef } from 'react';
import { devePulsar, intervaloDoPulsoMs } from './pulso';

export function abortou(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export function useAtualizacaoAoVivo(
  habilitado: boolean,
  chave: string,
  carregar: (signal: AbortSignal) => Promise<void>
) {
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    if (!habilitado) {
      return;
    }

    let cancelado = false;
    let controlador: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ultimaBusca = 0;

    async function executar() {
      controlador?.abort();
      const atual = new AbortController();
      controlador = atual;

      try {
        await carregarRef.current(atual.signal);
      } catch (error) {
        if (abortou(error) || atual.signal.aborted) {
          return;
        }

        throw error;
      } finally {
        if (!cancelado && controlador === atual && !atual.signal.aborted) {
          ultimaBusca = Date.now();
        }
      }
    }

    function agendar() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelado) {
          return;
        }

        const visivel = document.visibilityState === 'visible';

        if (!devePulsar({ visivel, msDesdeUltimaBusca: Date.now() - ultimaBusca })) {
          if (visivel) {
            agendar();
          }

          return;
        }

        void executar().finally(() => {
          if (!cancelado) {
            agendar();
          }
        });
      }, intervaloDoPulsoMs);
    }

    function aoMudarVisibilidade() {
      if (cancelado || document.visibilityState !== 'visible') {
        return;
      }

      const decorrido = ultimaBusca === 0 ? intervaloDoPulsoMs : Date.now() - ultimaBusca;

      if (!devePulsar({ visivel: true, msDesdeUltimaBusca: decorrido })) {
        agendar();
        return;
      }

      clearTimeout(timer);
      void executar().finally(() => {
        if (!cancelado) {
          agendar();
        }
      });
    }

    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    if (document.visibilityState === 'visible') {
      void executar().finally(() => {
        if (!cancelado) {
          agendar();
        }
      });
    }

    return () => {
      cancelado = true;
      controlador?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [habilitado, chave]);
}
