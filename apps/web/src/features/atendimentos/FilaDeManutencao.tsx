import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { FilaDeManutencaoResponse } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { escreverRecorteNaQuery } from '@hq-crion/contracts/recorte';
import { limparFiltrosDaQuery } from '@hq-crion/contracts/filtros-listagem';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { buscarFilaDeManutencao, marcarComentarioResolvido } from './api';

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
  params.set('lista', '/manutencao');
  const qs = params.toString();

  return qs ? `/atendimentos/${id}?${qs}` : `/atendimentos/${id}`;
}

export function FilaDeManutencao() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listagem, setListagem] = useState<FilaDeManutencaoResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'listagem' | 'resolucao' | null>(null);
  const [resolvendo, setResolvendo] = useState<string | null>(null);

  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';

  useEffect(() => {
    const controller = new AbortController();

    buscarFilaDeManutencao(searchParams, controller.signal)
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
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente, {
      resetarPagina: true
    }), { replace: true });
  }

  function onFiltrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const proxima = new URLSearchParams(searchParams);
    const campos = ['inicio', 'fim', 'status'] as const;

    for (const campo of campos) {
      const valor = String(data.get(campo) ?? '').trim();

      if (valor) {
        proxima.set(campo, valor);
      } else {
        proxima.delete(campo);
      }
    }

    proxima.delete('pagina');
    setSearchParams(proxima);
  }

  function limparFiltros() {
    setSearchParams(limparFiltrosDaQuery(searchParams));
  }

  function irPara(pagina: number) {
    const proxima = new URLSearchParams(searchParams);
    proxima.set('pagina', String(pagina));
    setSearchParams(proxima);
  }

  async function resolver(id: string) {
    if (resolvendo) {
      return;
    }

    setErro(null);
    setResolvendo(id);

    try {
      const gravado = await marcarComentarioResolvido(id);

      if (!gravado) {
        setErro('resolucao');
        return;
      }

      const statusFiltro = searchParams.get('status');
      setListagem((atual) => {
        if (!atual) {
          return atual;
        }

        const itens = atual.itens
          .map((item) => (item.id === gravado.id ? gravado : item))
          .filter((item) => !statusFiltro || item.status === statusFiltro);

        return {
          ...atual,
          total: atual.total - (itens.length === atual.itens.length ? 0 : 1),
          itens
        };
      });
    } catch {
      setErro('resolucao');
    } finally {
      setResolvendo(null);
    }
  }

  const periodoSubmetido = Boolean(searchParams.get('inicio') && searchParams.get('fim'));

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
      <form className="listagem-filtros listagem-filtros-pulso" onSubmit={onFiltrar}>
        <div className="listagem-filtro-periodo">
          <label>
            Data inicial
            <input
              name="inicio"
              type="date"
              defaultValue={periodoSubmetido ? (searchParams.get('inicio') ?? '') : ''}
              key={`inicio-${searchParams.get('inicio') ?? ''}`}
            />
          </label>
          <span aria-hidden="true" className="listagem-filtro-seta">
            →
          </span>
          <label>
            Data final
            <input
              name="fim"
              type="date"
              defaultValue={periodoSubmetido ? (searchParams.get('fim') ?? '') : ''}
              key={`fim-${searchParams.get('fim') ?? ''}`}
            />
          </label>
        </div>
        <label>
          Status do Comentário
          <select name="status" defaultValue={searchParams.get('status') ?? ''} key={`status-${searchParams.get('status') ?? ''}`}>
            <option value="">Todos</option>
            <option value="Pendente">Pendente</option>
            <option value="Resolvido">Resolvido</option>
          </select>
        </label>
        <button type="submit">Filtrar</button>
        <button type="button" onClick={limparFiltros}>
          Limpar
        </button>
      </form>
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
      {erro === 'resolucao' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível marcar o Comentário como Resolvido.
        </p>
      ) : null}
      {listagem ? (
        <>
          <div className="listagem-painel">
            {listagem.itens.length === 0 ? (
              <p>Nenhum Comentário neste Recorte.</p>
            ) : (
              listagem.itens.map((item) => (
                <article className="listagem-linha listagem-linha-manutencao" key={item.id}>
                  <div>
                    <Link
                      className="listagem-link"
                      to={destinoDoDetalhe(item.atendimentoId, location.search)}
                    >
                      {item.agente} · {formatarQuando(item.data)}
                    </Link>
                    <div className="listagem-meta">
                      {item.conversa} · {item.status}
                    </div>
                    <p className="listagem-comentario">{item.texto}</p>
                  </div>
                  <BadgeAdministradora administradora={item.administradora} lista="/manutencao" />
                  {item.status === 'Pendente' ? (
                    <button
                      type="button"
                      className="listagem-resolver"
                      disabled={resolvendo !== null}
                      onClick={() => {
                        void resolver(item.id);
                      }}
                    >
                      Marcar Resolvido
                    </button>
                  ) : (
                    <strong>{item.status}</strong>
                  )}
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
