import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { MonitoramentoDetalhe } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { destinoDaLista, lerRecorte } from '@hq-crion/contracts/recorte';
import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { Link, useLocation, useParams, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { CorpoDoTurno } from '../atendimentos/DetalheDaFerramenta';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { lerSessao } from '../auth/sessao';
import { BotaoFavorito } from '../atendimentos/BotaoFavorito';
import { buscarDetalheDoMonitoramento, lerEventoDaObservacao, urlDaObservacao } from './api';
import {
  acompanhaOFim,
  aplicarEventoDaObservacao,
  avisoDaTranscricao,
  observarTranscricao,
  textoDaObservacao,
  type ObservacaoDaTranscricao
} from './observacao';
import { intervaloDoPulsoMs } from './pulso';
import { abortou } from './useAtualizacaoAoVivo';

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

const observacaoInicial: ObservacaoDaTranscricao = { transcricao: [], observando: true };

export function DetalheMonitoramento() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [atendimento, setAtendimento] = useState<MonitoramentoDetalhe | null>(null);
  const [erro, setErro] = useState<'nao-encontrado' | 'detalhe' | null>(null);
  const [observacao, setObservacao] = useState<ObservacaoDaTranscricao>(observacaoInicial);
  const [idDaTela, setIdDaTela] = useState(id);
  const [acompanha, setAcompanha] = useState(true);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const acompanhaRef = useRef(true);
  const ignorarRolagemRef = useRef(false);
  const observandoRef = useRef(true);
  const volta = listaComRecorte(searchParams);

  if (idDaTela !== id) {
    setIdDaTela(id);
    setAtendimento(null);
    setErro(null);
    setObservacao(observacaoInicial);
    setAcompanha(true);
    acompanhaRef.current = true;
    observandoRef.current = true;
  }

  useEffect(() => {
    observandoRef.current = observacao.observando;
  }, [observacao.observando]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const pedido = id;
    const controlador = new AbortController();
    let cancelado = false;
    let socket: WebSocket | undefined;
    let encerrou = false;

    function abrirCanal() {
      const sessao = lerSessao();

      if (!sessao || cancelado) {
        setErro('detalhe');
        return;
      }

      let aberto: WebSocket;

      try {
        aberto = new WebSocket(urlDaObservacao(pedido));
      } catch {
        setErro('detalhe');
        return;
      }

      socket = aberto;

      aberto.addEventListener('open', () => {
        if (cancelado) {
          aberto.close();
          return;
        }

        aberto.send(JSON.stringify({ tipo: 'sessao', sessao }));
      });

      aberto.addEventListener('message', (event) => {
        if (cancelado) {
          return;
        }

        const mensagem = lerEventoDaObservacao(String(event.data));

        if (!mensagem) {
          return;
        }

        if (mensagem.tipo === 'erro') {
          setErro('detalhe');
          return;
        }

        if (mensagem.tipo === 'encerrada') {
          encerrou = true;
          setErro(null);
        }

        setObservacao((atual) => aplicarEventoDaObservacao(atual, mensagem));
      });

      aberto.addEventListener('close', () => {
        if (cancelado || encerrou) {
          return;
        }

        setErro('detalhe');
      });
    }

    buscarDetalheDoMonitoramento(pedido, controlador.signal)
      .then((resultado) => {
        if (cancelado || controlador.signal.aborted) {
          return;
        }

        if (!resultado) {
          setErro('detalhe');
          return;
        }

        setAtendimento(resultado);
        setErro(null);
        setObservacao(
          observarTranscricao(observacaoInicial, {
            transcricao: resultado.transcricao,
            aberto: true
          })
        );
        abrirCanal();
      })
      .catch((error: unknown) => {
        if (cancelado || controlador.signal.aborted || abortou(error)) {
          return;
        }

        if (error instanceof Error && error.message === 'atendimento-nao-encontrado') {
          setAtendimento(null);
          setErro('nao-encontrado');
          setObservacao({ transcricao: [], observando: false });
          return;
        }

        setErro('detalhe');
      });

    const pulso = window.setInterval(() => {
      if (cancelado || !observandoRef.current) {
        return;
      }

      buscarDetalheDoMonitoramento(pedido)
        .then((resultado) => {
          if (cancelado || !resultado || !observandoRef.current) {
            return;
          }

          setObservacao((atual) =>
            observarTranscricao(atual, {
              transcricao: resultado.transcricao,
              aberto: true
            })
          );
        })
        .catch((error: unknown) => {
          if (cancelado || abortou(error)) {
            return;
          }

          if (error instanceof Error && error.message === 'atendimento-nao-encontrado') {
            encerrou = true;
            setObservacao((atual) =>
              observarTranscricao(atual, {
                transcricao: atual.transcricao,
                aberto: false
              })
            );
            socket?.close();
          }
        });
    }, intervaloDoPulsoMs);

    return () => {
      cancelado = true;
      window.clearInterval(pulso);
      controlador.abort();
      socket?.close();
    };
  }, [id]);

  function irParaOFim(el: HTMLDivElement) {
    ignorarRolagemRef.current = true;
    el.scrollTop = el.scrollHeight;

    return requestAnimationFrame(() => {
      ignorarRolagemRef.current = false;
    });
  }

  const ultimaFala = observacao.transcricao.at(-1)?.texto ?? '';

  useLayoutEffect(() => {
    const el = rolagemRef.current;

    if (!el || !acompanhaRef.current) {
      return;
    }

    const quadro = irParaOFim(el);

    return () => {
      cancelAnimationFrame(quadro);
    };
  }, [observacao.transcricao.length, ultimaFala, id]);

  function naRolagem(event: UIEvent<HTMLDivElement>) {
    if (ignorarRolagemRef.current) {
      return;
    }

    const el = event.currentTarget;
    const segue = acompanhaOFim({
      altura: el.scrollHeight,
      rolagem: el.scrollTop,
      visivel: el.clientHeight
    });
    acompanhaRef.current = segue;
    setAcompanha(segue);
  }

  function sincronizar() {
    const el = rolagemRef.current;
    acompanhaRef.current = true;
    setAcompanha(true);

    if (!el) {
      return;
    }

    irParaOFim(el);
  }

  const aviso = avisoDaTranscricao({
    observando: observacao.observando,
    quantidade: observacao.transcricao.length
  });

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
          <p className="detalhe-resumo">{textoDaObservacao(observacao.observando)}</p>
          <dl className="detalhe-fatos">
            {atendimento.administradora ? (
              <div>
                <dt>Administradora</dt>
                <dd>
                  <BadgeAdministradora
                    administradora={atendimento.administradora}
                    lista={searchParams.get('lista') ?? '/monitoramento'}
                  />
                </dd>
              </div>
            ) : null}
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
            {perfil.papel === 'Curador' ? (
              <div>
                <dt>Favorito</dt>
                <dd>
                  <BotaoFavorito
                    atendimentoId={atendimento.id}
                    favoritado={atendimento.favoritadoPeloUsuario ?? false}
                    disabled={!atendimento.persistidoNoHq}
                    onToggle={(novo) => {
                      setAtendimento((atual) =>
                        atual ? { ...atual, favoritadoPeloUsuario: novo } : atual
                      );
                    }}
                  />
                </dd>
              </div>
            ) : null}
          </dl>
          <section className="transcricao" aria-label="Transcrição">
            <h2>Transcrição</h2>
            {aviso ? <p className="transcricao-espera">{aviso}</p> : null}
            <div className="transcricao-acompanhamento">
              <div className="transcricao-rolagem" ref={rolagemRef} onScroll={naRolagem}>
                <div className="transcricao-colunas">
                  {observacao.transcricao.map((turno, index) => {
                    const doAgente = turno.locutor === 'Agente de Voz';

                    return (
                      <article
                        className={`transcricao-turno ${doAgente ? 'is-agente' : 'is-cliente'}`}
                        key={`${turno.quando}-${index}`}
                      >
                        {doAgente ? (
                          <div className="transcricao-celula">
                            <span className="transcricao-trilho" aria-hidden="true" />
                            <div>
                              <div className="transcricao-meta">
                                {atendimento.agente} · {turno.quando}
                              </div>
                              <CorpoDoTurno turno={turno} />
                            </div>
                          </div>
                        ) : (
                          <div />
                        )}
                        {doAgente ? (
                          <div />
                        ) : (
                          <div className="transcricao-celula is-cliente">
                            <div>
                              <div className="transcricao-meta">Cliente · {turno.quando}</div>
                              <CorpoDoTurno turno={turno} />
                            </div>
                            <span className="transcricao-trilho" aria-hidden="true" />
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
              {acompanha || observacao.transcricao.length === 0 ? null : (
                <div className="transcricao-sincronizar">
                  <button type="button" onClick={sincronizar}>
                    Voltar ao momento atual
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
