import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { MonitoramentoDetalhe } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { destinoDaLista, lerRecorte } from '@hq-crion/contracts/recorte';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { buscarDetalheDoMonitoramento } from './api';

function listaComRecorte(searchParams: URLSearchParams) {
  try {
    return destinoDaLista(
      lerRecorte({
        administradora: searchParams.get('administradora') ?? undefined,
        agente: searchParams.get('agente') ?? undefined
      }),
      searchParams.get('lista') ?? '/monitoramento'
    );
  } catch {
    return '/monitoramento';
  }
}

export function DetalheMonitoramento() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [atendimento, setAtendimento] = useState<MonitoramentoDetalhe | null>(null);
  const [erro, setErro] = useState<'nao-encontrado' | 'detalhe' | null>(null);
  const volta = listaComRecorte(searchParams);

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();

    buscarDetalheDoMonitoramento(id, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setAtendimento(resultado);
        setErro(resultado ? null : 'detalhe');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setAtendimento(null);
        setErro(
          error instanceof Error && error.message === 'atendimento-nao-encontrado'
            ? 'nao-encontrado'
            : 'detalhe'
        );
      });

    return () => controller.abort();
  }, [id]);

  return (
    <div>
      <div className="pagina-head">
        <div>
          <Link className="voltar-lista" to={volta}>
            Voltar à lista
          </Link>
          <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        </div>
      </div>
      {erro === 'nao-encontrado' ? (
        <p className="listagem-erro" role="alert">
          Este Atendimento aberto não foi encontrado.
        </p>
      ) : null}
      {erro === 'detalhe' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Monitoramento ao Vivo.
        </p>
      ) : null}
      {atendimento ? (
        <>
          <p className="detalhe-resumo">Observação em texto, sem áudio e sem ação no contato.</p>
          <dl className="detalhe-fatos">
            <div>
              <dt>Administradora</dt>
              <dd>
                <span className="badge-administradora">{atendimento.administradora}</span>
              </dd>
            </div>
            <div>
              <dt>Agente de Voz</dt>
              <dd>{atendimento.agente}</dd>
            </div>
            <div>
              <dt>Motivo de Contato</dt>
              <dd>{atendimento.motivo}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{atendimento.status}</dd>
            </div>
          </dl>
          <section className="transcricao" aria-label="Transcrição">
            <h2>Transcrição</h2>
            <div className="transcricao-colunas">
              {atendimento.transcricao.map((turno, index) => {
                const agente = turno.locutor === 'Agente de Voz';

                return (
                  <article
                    className={`transcricao-turno ${agente ? 'is-agente' : 'is-cliente'}`}
                    key={`${turno.quando}-${index}`}
                  >
                    {agente ? (
                      <div className="transcricao-celula">
                        <span className="transcricao-trilho" aria-hidden="true" />
                        <div>
                          <div className="transcricao-meta">
                            {atendimento.agente} · {turno.quando}
                          </div>
                          <p>{turno.texto}</p>
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}
                    {agente ? (
                      <div />
                    ) : (
                      <div className="transcricao-celula is-cliente">
                        <div>
                          <div className="transcricao-meta">Cliente · {turno.quando}</div>
                          <p>{turno.texto}</p>
                        </div>
                        <span className="transcricao-trilho" aria-hidden="true" />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
