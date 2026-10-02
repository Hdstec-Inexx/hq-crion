import type { TurnoDaTranscricao } from '@hq-crion/contracts/atendimento';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react';
import { PlayerDeAudio, type SaltoDoPlayer } from './PlayerDeAudio';
import {
  criarRelogioDoAudio,
  deveRolarAteAFalaAtiva,
  exibirVoltarAoMomentoAtual,
  falaForaDeVista,
  gestoDaRolagem,
  indiceDoTurnoAtivo,
  inicioDaFalaEmSegundos,
  teclaSaltaParaAFala,
  tempoRelativoDaFala,
  type RelogioDoAudio,
  type TempoRelativoDaFala
} from './transcricao';

function ConteudoDoBalao({
  rotulo,
  tempo,
  texto
}: {
  rotulo: string;
  tempo: TempoRelativoDaFala;
  texto: string;
}) {
  return (
    <>
      <div className="transcricao-meta" title={tempo.titulo}>
        {rotulo} · {tempo.texto}
      </div>
      <p>{texto}</p>
    </>
  );
}

function medirForaDeVista(caixa: HTMLElement, fala: HTMLElement) {
  const caixaRect = caixa.getBoundingClientRect();
  const falaRect = fala.getBoundingClientRect();

  return falaForaDeVista({
    rolagem: 0,
    visivel: caixaRect.height,
    topo: falaRect.top - caixaRect.top,
    altura: falaRect.height
  });
}

export function TranscricaoDoAtendimento({
  turnos,
  agente,
  iniciadoEm,
  relogio,
  onSeek
}: {
  turnos: readonly TurnoDaTranscricao[];
  agente: string;
  iniciadoEm: string;
  relogio: RelogioDoAudio;
  onSeek: (segundos: number) => void;
}) {
  const quadro = useSyncExternalStore(relogio.assinar, relogio.ler, relogio.ler);
  const instante = quadro.instante;
  const tocando = quadro.tocando;
  const rolagemRef = useRef<HTMLDivElement>(null);
  const falasRef = useRef<Array<HTMLElement | null>>([]);
  const rolagemDePrograma = useRef(false);
  const destinoPrograma = useRef<number | null>(null);
  const scrollAnterior = useRef(0);
  const fimDaRolagemDePrograma = useRef(0);
  const [acompanhando, setAcompanhando] = useState(true);
  const [foraDeVista, setForaDeVista] = useState(false);
  const falas = useMemo(
    () =>
      turnos.map((turno) => ({
        inicio: inicioDaFalaEmSegundos({ quando: turno.quando, iniciadoEm }),
        tempo: tempoRelativoDaFala({ quando: turno.quando, iniciadoEm })
      })),
    [turnos, iniciadoEm]
  );
  const indiceAtivo = indiceDoTurnoAtivo(
    falas.map((fala) => (fala.inicio === undefined ? Number.NaN : fala.inicio)),
    instante
  );
  const haFalaAtiva = indiceAtivo >= 0;

  function atualizarForaDeVista() {
    const caixa = rolagemRef.current;
    const fala = haFalaAtiva ? falasRef.current[indiceAtivo] : null;

    setForaDeVista(caixa && fala ? medirForaDeVista(caixa, fala) : false);
  }

  function encerrarRolagemDePrograma() {
    rolagemDePrograma.current = false;
    destinoPrograma.current = null;
    window.clearTimeout(fimDaRolagemDePrograma.current);
  }

  function rolarAteAFalaAtiva() {
    const caixa = rolagemRef.current;
    const fala = falasRef.current[indiceAtivo];

    if (!caixa || !fala) {
      return;
    }

    const caixaRect = caixa.getBoundingClientRect();
    const falaRect = fala.getBoundingClientRect();
    const delta = falaRect.top - caixaRect.top - (caixa.clientHeight - falaRect.height) / 2;
    const topo = Math.max(0, caixa.scrollTop + delta);

    destinoPrograma.current = topo;
    scrollAnterior.current = caixa.scrollTop;
    rolagemDePrograma.current = true;
    caixa.scrollTo({ top: topo, behavior: 'smooth' });
    window.clearTimeout(fimDaRolagemDePrograma.current);
    fimDaRolagemDePrograma.current = window.setTimeout(() => {
      encerrarRolagemDePrograma();
      atualizarForaDeVista();
    }, 700);
  }

  useLayoutEffect(() => {
    if (!deveRolarAteAFalaAtiva({ tocando, acompanhando, haFalaAtiva })) {
      return;
    }

    rolarAteAFalaAtiva();

    return () => {
      encerrarRolagemDePrograma();
    };
  }, [indiceAtivo, tocando, acompanhando, haFalaAtiva]);

  useEffect(() => {
    atualizarForaDeVista();
  }, [indiceAtivo, haFalaAtiva, turnos]);

  function pausarAcompanhamento() {
    encerrarRolagemDePrograma();
    setAcompanhando(false);
    atualizarForaDeVista();
  }

  function aoRolar() {
    const caixa = rolagemRef.current;

    if (!caixa) {
      return;
    }

    if (rolagemDePrograma.current) {
      const gesto = gestoDaRolagem({
        destino: destinoPrograma.current,
        anterior: scrollAnterior.current,
        agora: caixa.scrollTop
      });
      scrollAnterior.current = caixa.scrollTop;

      if (gesto === 'programa') {
        return;
      }

      encerrarRolagemDePrograma();

      if (gesto === 'chegou') {
        atualizarForaDeVista();
        return;
      }
    }

    setAcompanhando(false);
    atualizarForaDeVista();
  }

  function voltarAoMomentoAtual() {
    setAcompanhando(true);
    rolarAteAFalaAtiva();
  }

  function saltar(indice: number) {
    const inicio = falas[indice]?.inicio;

    if (inicio === undefined) {
      return;
    }

    onSeek(inicio);
  }

  function aoTeclado(evento: ReactKeyboardEvent<HTMLElement>, indice: number) {
    if (!teclaSaltaParaAFala(evento.key)) {
      return;
    }

    evento.preventDefault();
    saltar(indice);
  }

  const mostrarBotao = exibirVoltarAoMomentoAtual({
    acompanhando,
    foraDeVista,
    haFalaAtiva
  });

  return (
    <section className="transcricao" aria-label="Transcrição">
      <h2>Transcrição</h2>
      <div className="transcricao-acompanhamento transcricao-sincronizada">
        <div
          className="transcricao-rolagem"
          ref={rolagemRef}
          onWheel={pausarAcompanhamento}
          onTouchMove={pausarAcompanhamento}
          onScroll={aoRolar}
        >
          <div className="transcricao-colunas">
            {turnos.map((turno, index) => {
              const doAgente = turno.locutor === 'Agente de Voz';
              const tempo = falas[index]?.tempo ?? { texto: turno.quando };
              const ativa = index === indiceAtivo;
              const rotulo = doAgente ? agente : 'Cliente';
              const conteudo = <ConteudoDoBalao rotulo={rotulo} tempo={tempo} texto={turno.texto} />;

              return (
                <article
                  className={`transcricao-turno ${doAgente ? 'is-agente' : 'is-cliente'}${ativa ? ' ativa' : ''}`}
                  key={`${turno.quando}-${index}`}
                  tabIndex={0}
                  aria-current={ativa ? 'true' : undefined}
                  ref={(elemento) => {
                    falasRef.current[index] = elemento;
                  }}
                  onClick={() => {
                    saltar(index);
                  }}
                  onKeyDown={(evento) => {
                    aoTeclado(evento, index);
                  }}
                >
                  {doAgente ? (
                    <div className="transcricao-celula">
                      <span className="transcricao-trilho" aria-hidden="true" />
                      <div>{conteudo}</div>
                    </div>
                  ) : (
                    <div />
                  )}
                  {doAgente ? (
                    <div />
                  ) : (
                    <div className="transcricao-celula is-cliente">
                      <div>{conteudo}</div>
                      <span className="transcricao-trilho" aria-hidden="true" />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
        {mostrarBotao ? (
          <div className="transcricao-sincronizar">
            <button type="button" onClick={voltarAoMomentoAtual}>
              Voltar ao momento atual
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ReproducaoDoAtendimento({
  caminho,
  download,
  turnos,
  agente,
  iniciadoEm,
  children
}: {
  caminho: string;
  download?: ReactNode;
  turnos: readonly TurnoDaTranscricao[];
  agente: string;
  iniciadoEm: string;
  children?: ReactNode;
}) {
  const relogio = useRef(criarRelogioDoAudio()).current;
  const [salto, setSalto] = useState<SaltoDoPlayer | null>(null);
  const saltoId = useRef(0);

  useEffect(() => {
    relogio.definir({ instante: 0, tocando: false });
    setSalto(null);
  }, [caminho, relogio]);

  return (
    <>
      <div className="audio-faixa">
        <PlayerDeAudio caminho={caminho} onProgresso={relogio.definir} salto={salto} />
        {download}
      </div>
      {children}
      <TranscricaoDoAtendimento
        turnos={turnos}
        agente={agente}
        iniciadoEm={iniciadoEm}
        relogio={relogio}
        onSeek={(segundos) => {
          saltoId.current += 1;
          setSalto({ id: saltoId.current, segundos });
        }}
      />
    </>
  );
}
