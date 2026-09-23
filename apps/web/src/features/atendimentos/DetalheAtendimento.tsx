import { tituloDaPagina } from '@hq-crion/contracts/casca';
import {
  caminhoDeMidiaPermitido,
  custoVisivelPara,
  downloadVisivelPara,
  type AtendimentoDetalhe,
  type Avaliacao,
  type AvaliacaoDoCurador,
  type EstadoDoCriterio
} from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { destinoDaLista, lerRecorte } from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { buscarAtendimento, gravarConferencia } from './api';

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
      }),
      searchParams.get('lista') ?? '/atendimentos'
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
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);

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
          onEnded={(event) => {
            setTocando(false);
            setAtual(event.currentTarget.duration);
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

function PainelAvaliacao({
  titulo,
  avaliacao
}: {
  titulo: string;
  avaliacao: Avaliacao | AvaliacaoDoCurador;
}) {
  const aprovado = avaliacao.aprovacao === 'Aprovado';
  const doCurador = 'notaDaAvaliacaoDaIa' in avaliacao;

  return (
    <section className="avaliacao-painel" aria-label={titulo}>
      <header className="avaliacao-head">
        <h2>{titulo}</h2>
        <div className={`avaliacao-score${aprovado ? '' : ' is-fail'}`}>
          <strong>{formatarNota(avaliacao.nota)}</strong>
          <span>{avaliacao.aprovacao}</span>
        </div>
      </header>
      {doCurador ? (
        <p className="avaliacao-snapshot">
          Curador: {avaliacao.curador}. Nota da Avaliação da IA no snapshot:{' '}
          {formatarNota(avaliacao.notaDaAvaliacaoDaIa)}
        </p>
      ) : null}
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
      {doCurador && avaliacao.comentario ? (
        <p className="avaliacao-comentario">{avaliacao.comentario}</p>
      ) : null}
    </section>
  );
}

const estadosDoCriterio: EstadoDoCriterio[] = ['Atendido', 'Não atendido', 'Não se aplica'];

function FormularioConferencia({
  atendimento,
  onGravada
}: {
  atendimento: AtendimentoDetalhe & { avaliacaoDaIa: Avaliacao };
  onGravada: (detalhe: AtendimentoDetalhe) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const checklist = atendimento.avaliacaoDaIa.criterios.map((criterio) => ({
      nome: criterio.nome,
      estado: String(data.get(`estado-${criterio.nome}`) ?? '') as EstadoDoCriterio,
      pontos: criterio.pontos,
      critico: criterio.critico
    }));
    const comentario = String(data.get('comentario') ?? '').trim();

    setErro(null);
    setEnviando(true);

    try {
      const gravado = await gravarConferencia(atendimento.id, {
        checklist,
        notaDaRegua: Number(data.get('notaDaRegua')),
        notaDaAvaliacaoDaIa: atendimento.avaliacaoDaIa.nota,
        ...(comentario ? { comentario } : {})
      });

      if (!gravado) {
        setErro('A sessão expirou. Entre de novo.');
        return;
      }

      onGravada(gravado);
    } catch {
      setErro('Não foi possível gravar a conferência.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="conferencia-form" onSubmit={onSubmit} aria-label="Conferência">
      <h2>Conferência da Avaliação da IA</h2>
      <p>
        Checklist da Régua, nota da Régua e snapshot da Nota da Avaliação da IA.
        Comentário é opcional.
      </p>
      <div className="criterio-grid">
        {atendimento.avaliacaoDaIa.criterios.map((criterio) => (
          <label className="criterio-card" key={criterio.nome}>
            <span className="criterio-top">
              <strong>{criterio.nome}</strong>
              <span className="criterio-pontos">{formatarPontos(criterio.pontos)}</span>
            </span>
            {criterio.critico ? <span className="criterio-critico">Crítico</span> : null}
            <select name={`estado-${criterio.nome}`} defaultValue={criterio.estado} required>
              {estadosDoCriterio.map((estado) => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="conferencia-notas">
        <label>
          Nota da Régua
          <input
            name="notaDaRegua"
            type="number"
            step="0.1"
            min="0"
            max="10"
            defaultValue={atendimento.avaliacaoDaIa.nota}
            required
          />
        </label>
        <p>
          Nota da Avaliação da IA: {formatarNota(atendimento.avaliacaoDaIa.nota)}
        </p>
      </div>
      <label className="conferencia-comentario">
        Comentário (opcional)
        <textarea name="comentario" rows={3} />
      </label>
      {erro ? (
        <p className="listagem-erro" role="alert">
          {erro}
        </p>
      ) : null}
      <button type="submit" disabled={enviando}>
        Gravar conferência
      </button>
    </form>
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
                <BadgeAdministradora
                  administradora={atendimento.administradora}
                  lista={searchParams.get('lista') ?? '/atendimentos'}
                />
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
          {perfil.papel === 'Curador' &&
          atendimento.status === 'Concluído' &&
          atendimento.avaliacaoDaIa &&
          !atendimento.avaliacaoDoCurador ? (
            <FormularioConferencia
              atendimento={{ ...atendimento, avaliacaoDaIa: atendimento.avaliacaoDaIa }}
              onGravada={setAtendimento}
            />
          ) : null}
          <div
            className={`avaliacao-paineis${atendimento.avaliacaoDoCurador ? '' : ' ia-only'}`}
          >
            {atendimento.avaliacaoDaIa ? (
              <PainelAvaliacao titulo="Avaliação da IA" avaliacao={atendimento.avaliacaoDaIa} />
            ) : null}
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
