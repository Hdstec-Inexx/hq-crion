import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { MonitoramentoListagemResponse } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { administradoraSchema, queryDoRecorte } from '@hq-crion/contracts/recorte';
import { useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { buscarMonitoramento } from './api';

function formatarQuando(iso: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(new Date(iso));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === tipo)?.value ?? '';

  return `${valor('day')}/${valor('month')} ${valor('hour')}:${valor('minute')}`;
}

function destinoDoDetalhe(id: string, search: string) {
  const params = new URLSearchParams(search);
  params.set('lista', '/monitoramento');
  const qs = params.toString();

  return qs ? `/monitoramento/${id}?${qs}` : `/monitoramento/${id}`;
}

export function MonitoramentoPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listagem, setListagem] = useState<MonitoramentoListagemResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'listagem' | null>(null);

  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';

  useEffect(() => {
    const controller = new AbortController();

    buscarMonitoramento(searchParams, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setListagem(resultado);
        setErro(resultado ? null : 'listagem');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setListagem(null);
        setErro(
          error instanceof Error && error.message === 'recorte-invalido'
            ? 'recorte-invalido'
            : 'listagem'
        );
      });

    return () => controller.abort();
  }, [searchParams]);

  function atualizarRecorte(administradora: string, agente: string) {
    const recorteQuery = queryDoRecorte({
      administradora: administradoraSchema.safeParse(administradora).data ?? null,
      agente: administradora && agente ? agente : null
    });
    const proxima = new URLSearchParams(searchParams);
    proxima.delete('administradora');
    proxima.delete('agente');

    for (const [chave, valor] of recorteQuery) {
      proxima.set(chave, valor);
    }

    setSearchParams(proxima, { replace: true });
  }

  return (
    <div>
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        <RecorteCascata
          administradora={administradoraNaUrl}
          agente={agenteNaUrl}
          onChange={atualizarRecorte}
        />
      </div>
      {erro === 'recorte-invalido' ? (
        <p className="listagem-erro" role="alert">
          Este Recorte não é um par válido de Administradora e Agente de Voz.
        </p>
      ) : null}
      {erro === 'listagem' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar {tituloDaPagina(location.pathname, perfil.papel)}.
        </p>
      ) : null}
      {listagem ? (
        <>
          <div className="listagem-painel">
            {listagem.itens.length === 0 ? (
              <p>Nenhum Atendimento aberto neste Recorte.</p>
            ) : (
              listagem.itens.map((item) => (
                <article className="listagem-linha" key={item.id}>
                  <div>
                    <Link
                      className="listagem-link"
                      to={destinoDoDetalhe(item.id, location.search)}
                    >
                      {item.agente} · {formatarQuando(item.iniciadoEm)}
                    </Link>
                    <div className="listagem-meta">
                      {item.motivo} · {item.status}
                    </div>
                  </div>
                  <span className="badge-administradora">{item.administradora}</span>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
