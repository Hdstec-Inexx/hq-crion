import { tituloDaPagina } from '@hq-crion/contracts/casca';
import { custoVisivelPara, type ListagemResponse } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { escreverRecorteNaQuery } from '@hq-crion/contracts/recorte';
import { useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { buscarAtendimentos } from './api';
import { BarraDeFiltrosDaListagem } from './BarraDeFiltrosDaListagem';

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

function formatarNota(nota: number) {
  return nota.toFixed(1).replace('.', ',');
}

function destinoDoDetalhe(id: string, search: string, lista: string) {
  const params = new URLSearchParams(search);
  params.set('lista', lista);
  const qs = params.toString();

  return qs ? `/atendimentos/${id}?${qs}` : `/atendimentos/${id}`;
}

export function ListagemAtendimentos({
  caminho = '/atendimentos'
}: {
  caminho?: string;
}) {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listagem, setListagem] = useState<ListagemResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'listagem' | null>(null);

  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';

  useEffect(() => {
    const controller = new AbortController();

    buscarAtendimentos(caminho, searchParams, controller.signal)
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
  }, [searchParams, caminho]);

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente, {
      resetarPagina: true
    }), { replace: true });
  }

  function irPara(pagina: number) {
    const proxima = new URLSearchParams(searchParams);
    proxima.set('pagina', String(pagina));
    setSearchParams(proxima);
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
      <BarraDeFiltrosDaListagem
        caminho={caminho}
        curadores={listagem?.curadores ?? []}
      />
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
              <p>Nenhum Atendimento neste Recorte.</p>
            ) : (
              listagem.itens.map((item) => (
                <article className="listagem-linha" key={item.id}>
                  <div>
                    <Link
                      className="listagem-link"
                      to={destinoDoDetalhe(item.id, location.search, location.pathname)}
                    >
                      {item.agente} · {formatarQuando(item.iniciadoEm)}
                    </Link>
                    <div className="listagem-meta">
                      {item.motivo} · {item.status}
                      {custoVisivelPara(perfil.papel) && item.custo ? ` · ${item.custo}` : ''}
                    </div>
                  </div>
                  <BadgeAdministradora
                    administradora={item.administradora}
                    lista={location.pathname}
                  />
                  <strong>{formatarNota(item.nota)}</strong>
                </article>
              ))
            )}
          </div>
          {listagem.total > listagem.tamanho ? (
            <div className="listagem-paginacao">
              <button
                type="button"
                disabled={listagem.pagina <= 1}
                onClick={() => irPara(listagem.pagina - 1)}
              >
                Anterior
              </button>
              <span>
                Página {listagem.pagina} de {Math.ceil(listagem.total / listagem.tamanho)}
              </span>
              <button
                type="button"
                disabled={listagem.pagina * listagem.tamanho >= listagem.total}
                onClick={() => irPara(listagem.pagina + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
