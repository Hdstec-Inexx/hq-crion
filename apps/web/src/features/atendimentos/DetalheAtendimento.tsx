import { tituloDaPagina } from '@hq-crion/contracts/casca';
import {
  caminhoDeMidiaPermitido,
  custoVisivelPara,
  downloadVisivelPara,
  type AtendimentoDetalhe,
  type Avaliacao
} from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { destinoDaLista, lerRecorte } from '@hq-crion/contracts/recorte';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { buscarAtendimento } from './api';

function formatarNota(nota: number) {
  return nota.toFixed(1).replace('.', ',');
}

function formatarPontos(pontos: number) {
  return `${formatarNota(pontos)} pt`;
}

function classeDoEstado(estado: Avaliacao['criterios'][number]['estado']) {
  if (estado === 'Atendido') {
    return 'ok';
  }

  if (estado === 'Não atendido') {
    return 'no';
  }

  return 'na';
}

function listaComRecorte(searchParams: URLSearchParams) {
  try {
    return destinoDaLista(
      lerRecorte({
        administradora: searchParams.get('administradora') ?? undefined,
        agente: searchParams.get('agente') ?? undefined
      })
    );
  } catch {
    return '/atendimentos';
  }
}

function formatarTempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) {
    return '0:00';
  }

  const total = Math.floor(segundos);
  const minutos = Math.floor(total / 60);
  const resto = String(total % 60).padStart(2, '0');

  return `${minutos}:${resto}`;
}

function PlayerDeAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(12);
  const [duracao, setDuracao] = useState(161);

  async function onReproduzir() {
    const elemento = audio.current;

    if (!elemento) {
      return;
    }

    if (tocando) {
      elemento.pause();
      setTocando(false);
      return;
    }

    try {
      await elemento.play();
      setTocando(true);
    } catch {
      setTocando(false);
    }
  }

  return (
    <div className="audio-player" title="Player de áudio">
      {caminhoDeMidiaPermitido(src) ? (
        <audio
          ref={audio}
          src={src}
          onTimeUpdate={(event) => {
            const segundos = Math.floor(event.currentTarget.currentTime);
            setAtual((anterior) =>
              Math.floor(anterior) === segundos ? anterior : event.currentTarget.currentTime
            );
          }}
          onLoadedMetadata={(event) => {
            const media = event.currentTarget;

            if (Number.isFinite(media.duration) && media.duration > 0) {
              setDuracao(media.duration);
              setAtual(media.currentTime);
            }
          }}
          onEnded={() => {
            setTocando(false);
            setAtual(duracao);
          }}
          onPause={() => setTocando(false)}
          onPlay={() => setTocando(true)}
        />
      ) : null}
      <button
        className="audio-play"
        type="button"
        aria-label={tocando ? 'Pausar' : 'Reproduzir'}
        onClick={() => {
          void onReproduzir();
        }}
      >
        {tocando ? (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="0.8" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="0.8" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        )}
      </button>
      <span className="audio-time">
        {formatarTempo(atual)} / {formatarTempo(duracao)}
      </span>
      <div className="audio-onda" aria-hidden="true" />
    </div>
  );
}

function PainelAvaliacao({ titulo, avaliacao }: { titulo: string; avaliacao: Avaliacao }) {
  const aprovado = avaliacao.aprovacao === 'Aprovado';

  return (
    <section className="avaliacao-painel" aria-label={titulo}>
      <header className="avaliacao-head">
        <h2>{titulo}</h2>
        <div className={`avaliacao-score${aprovado ? '' : ' is-fail'}`}>
          <strong>{formatarNota(avaliacao.nota)}</strong>
          <span>{avaliacao.aprovacao}</span>
        </div>
      </header>
      <div className="criterio-grid">
        {avaliacao.criterios.map((criterio) => {
          const estadoClasse = classeDoEstado(criterio.estado);

          return (
            <article className={`criterio-card is-${estadoClasse}`} key={criterio.nome}>
              <div className="criterio-top">
                <h3>{criterio.nome}</h3>
                <span className="criterio-pontos">{formatarPontos(criterio.pontos)}</span>
              </div>
              {criterio.critico ? <span className="criterio-critico">Crítico</span> : null}
              <span className={`criterio-chip ${estadoClasse}`}>{criterio.estado}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function DetalheAtendimento() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [atendimento, setAtendimento] = useState<AtendimentoDetalhe | null>(null);
  const [erro, setErro] = useState<'nao-encontrado' | 'detalhe' | null>(null);
  const volta = listaComRecorte(searchParams);

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();

    buscarAtendimento(id, controller.signal)
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
          Este Atendimento não foi encontrado.
        </p>
      ) : null}
      {erro === 'detalhe' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Atendimento.
        </p>
      ) : null}
      {atendimento ? (
        <>
          <p className="detalhe-resumo">
            Resumo: conferência da Avaliação da IA neste contato da{' '}
            {atendimento.administradora}.
          </p>
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
            {custoVisivelPara(perfil.papel) && atendimento.custo ? (
              <div>
                <dt>Custo</dt>
                <dd>{atendimento.custo}</dd>
              </div>
            ) : null}
          </dl>
          <div className="audio-faixa">
            <PlayerDeAudio src={atendimento.audio} />
            {downloadVisivelPara(perfil.papel) &&
            atendimento.downloadDeAudio &&
            caminhoDeMidiaPermitido(atendimento.downloadDeAudio) ? (
              <a className="audio-download" href={atendimento.downloadDeAudio} download>
                Download de Áudio
              </a>
            ) : null}
          </div>
          <div
            className={`avaliacao-workspace${atendimento.avaliacaoDoCurador ? '' : ' ia-only'}`}
          >
            <PainelAvaliacao titulo="Avaliação da IA" avaliacao={atendimento.avaliacaoDaIa} />
            {atendimento.avaliacaoDoCurador ? (
              <PainelAvaliacao
                titulo="Avaliação do Curador"
                avaliacao={atendimento.avaliacaoDoCurador}
              />
            ) : null}
          </div>
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
