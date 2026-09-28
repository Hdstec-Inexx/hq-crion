import { useEffect, useRef } from 'react';
import { devePulsar, esperaDoPulso } from './pulso';

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
      timer = setTimeout(seguirPulso, esperaDoPulso(ultimaBusca, Date.now()));
    }

    function continuar() {
      clearTimeout(timer);
      void executar().finally(() => {
        if (!cancelado) {
          agendar();
        }
      });
    }

    function seguirPulso() {
      if (cancelado) {
        return;
      }

      const visivel = document.visibilityState === 'visible';
      const agora = Date.now();
      const decorrido = ultimaBusca === 0 ? esperaDoPulso(0, agora) : agora - ultimaBusca;

      if (!devePulsar({ visivel, msDesdeUltimaBusca: decorrido })) {
        if (visivel) {
          agendar();
        }

        return;
      }

      continuar();
    }

    document.addEventListener('visibilitychange', seguirPulso);

    if (document.visibilityState === 'visible') {
      continuar();
    }

    return () => {
      cancelado = true;
      controlador?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', seguirPulso);
    };
  }, [habilitado, chave]);
}
