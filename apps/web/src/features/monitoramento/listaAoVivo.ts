import type { MonitoramentoListagemResponse } from '@hq-crion/contracts/atendimento';
import { useEffect, useRef, useState } from 'react';
import { buscarMonitoramento } from './api';
import {
  intervaloDoPulsoMs,
  reduzirCargaAoVivo,
  type CargaDaListaAoVivo,
  type EstadoDaListaAoVivo
} from './pulso';
import { abortou } from './useAtualizacaoAoVivo';

const vazio: EstadoDaListaAoVivo<MonitoramentoListagemResponse> = {
  lista: null,
  erro: null
};

export function useListaAoVivo(chave: string, searchParams: URLSearchParams) {
  const paramsRef = useRef(searchParams);
  const chaveRef = useRef(chave);
  paramsRef.current = searchParams;
  chaveRef.current = chave;
  const [chaveAplicada, setChaveAplicada] = useState(chave);
  const [estado, setEstado] = useState(vazio);

  if (chaveAplicada !== chave) {
    setChaveAplicada(chave);
    setEstado(vazio);
  }

  useEffect(() => {
    let cancelado = false;
    let timer: number | undefined;
    let resolverEspera: (() => void) | undefined;
    let soltarEspera: (() => void) | undefined;
    const abortController = new AbortController();
    const chaveDaBusca = chave;

    function esperar(ms: number) {
      return new Promise<void>((resolve) => {
        resolverEspera = resolve;
        timer = window.setTimeout(() => {
          resolverEspera = undefined;
          resolve();
        }, ms);
      });
    }

    function quandoVisivel() {
      if (document.visibilityState === 'visible') {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        function aoMudar() {
          if (document.visibilityState !== 'visible') {
            return;
          }

          document.removeEventListener('visibilitychange', aoMudar);
          soltarEspera = undefined;
          resolve();
        }

        soltarEspera = () => {
          document.removeEventListener('visibilitychange', aoMudar);
          soltarEspera = undefined;
          resolve();
        };
        document.addEventListener('visibilitychange', aoMudar);
      });
    }

    function vigente() {
      return !cancelado && chaveRef.current === chaveDaBusca;
    }

    function publicar(inicial: boolean, carga: CargaDaListaAoVivo<MonitoramentoListagemResponse>) {
      if (!vigente()) {
        return;
      }

      setEstado((atual) => reduzirCargaAoVivo(inicial ? vazio : atual, carga));
    }

    async function carregar(inicial: boolean) {
      try {
        const resultado = await buscarMonitoramento(paramsRef.current, abortController.signal);

        if (!vigente()) {
          return;
        }

        if (resultado.tipo === 'lista') {
          publicar(inicial, { tipo: 'lista', lista: resultado.lista });
          return;
        }

        publicar(
          inicial,
          resultado.tipo === 'recorte-invalido'
            ? { tipo: 'recorte-invalido', vigente: true }
            : { tipo: 'falha', vigente: true, abortada: false }
        );
      } catch (error: unknown) {
        if (!vigente() || abortou(error)) {
          return;
        }

        publicar(inicial, { tipo: 'falha', vigente: true, abortada: false });
      }
    }

    async function pulsar() {
      let inicial = true;

      while (!cancelado) {
        await quandoVisivel();
        if (cancelado) {
          return;
        }

        await carregar(inicial);
        inicial = false;
        if (cancelado) {
          return;
        }

        await esperar(intervaloDoPulsoMs);
      }
    }

    void pulsar();

    return () => {
      cancelado = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }

      resolverEspera?.();
      resolverEspera = undefined;
      soltarEspera?.();
      abortController.abort();
    };
  }, [chave]);

  if (chaveAplicada !== chave) {
    return vazio;
  }

  return estado;
}
