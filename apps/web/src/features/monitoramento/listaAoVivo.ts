import type { MonitoramentoListagemResponse } from '@hq-crion/contracts/atendimento';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { buscarMonitoramento } from './api';
import {
  deveBuscarDeNovo,
  esperaDoPulso,
  reduzirCargaAoVivo,
  type ErroDaListaAoVivo
} from './pulso';
import { abortou } from './useAtualizacaoAoVivo';

type Estado = {
  chave: string;
  lista: MonitoramentoListagemResponse | null;
  erro: ErroDaListaAoVivo | null;
};

const vazio: Estado = { chave: '', lista: null, erro: null };
let estado: Estado = vazio;
const ouvintes = new Set<() => void>();

function publicar(proximo: Estado) {
  estado = proximo;

  for (const ouvinte of ouvintes) {
    ouvinte();
  }
}

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function lerEstado() {
  return estado;
}

export function useListaAoVivo(chave: string, searchParams: URLSearchParams) {
  const paramsRef = useRef(searchParams);
  const chaveRef = useRef(chave);
  paramsRef.current = searchParams;
  chaveRef.current = chave;
  const instantaneo = useSyncExternalStore(inscrever, lerEstado, lerEstado);

  useEffect(() => {
    let cancelado = false;
    let emCurso = false;
    let ultimaBusca: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function executar() {
      if (emCurso || cancelado) {
        return;
      }

      emCurso = true;
      const pedido = chave;

      try {
        const resultado = await buscarMonitoramento(paramsRef.current);

        if (chaveRef.current !== pedido) {
          return;
        }

        if (!resultado && cancelado) {
          return;
        }

        const base =
          estado.chave === pedido
            ? { lista: estado.lista, erro: estado.erro }
            : { lista: null, erro: null };
        const reduzido = reduzirCargaAoVivo(
          base,
          resultado
            ? { tipo: 'lista', lista: resultado }
            : { tipo: 'falha', vigente: !cancelado, abortada: false }
        );
        publicar({ chave: pedido, lista: reduzido.lista, erro: reduzido.erro });
      } catch (error: unknown) {
        if (cancelado || abortou(error) || chaveRef.current !== pedido) {
          return;
        }

        const base =
          estado.chave === pedido
            ? { lista: estado.lista, erro: estado.erro }
            : { lista: null, erro: null };
        const reduzido = reduzirCargaAoVivo(
          base,
          error instanceof Error && error.message === 'recorte-invalido'
            ? { tipo: 'recorte-invalido', vigente: true }
            : { tipo: 'falha', vigente: true, abortada: false }
        );
        publicar({ chave: pedido, lista: reduzido.lista, erro: reduzido.erro });
      } finally {
        emCurso = false;

        if (!cancelado) {
          ultimaBusca = Date.now();
        }
      }
    }

    function agendar() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelado || document.visibilityState !== 'visible') {
          return;
        }

        void executar().finally(() => {
          if (!cancelado) {
            agendar();
          }
        });
      }, esperaDoPulso(ultimaBusca, Date.now()));
    }

    function aoFicarVisivel() {
      if (cancelado) {
        return;
      }

      const visivel = document.visibilityState === 'visible';

      if (
        !deveBuscarDeNovo({
          visivel,
          emCurso,
          ultimaBusca,
          agora: Date.now()
        })
      ) {
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
    }

    document.addEventListener('visibilitychange', aoFicarVisivel);

    if (document.visibilityState === 'visible') {
      void executar().finally(() => {
        if (!cancelado) {
          agendar();
        }
      });
    }

    return () => {
      cancelado = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoFicarVisivel);
    };
  }, [chave]);

  if (instantaneo.chave !== chave) {
    return { lista: null, erro: null };
  }

  return { lista: instantaneo.lista, erro: instantaneo.erro };
}
