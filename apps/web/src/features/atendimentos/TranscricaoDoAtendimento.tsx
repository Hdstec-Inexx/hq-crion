import type { TurnoDaTranscricao } from '@hq-crion/contracts/atendimento';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import {
  acompanhamentoAposRolagem,
  deveRolarAteAFalaAtiva,
  exibirVoltarAoMomentoAtual,
  falaForaDeVista,
  indiceDoTurnoAtivo,
  inicioDaFalaEmSegundos,
  retomarAcompanhamento,
  teclaSaltaParaAFala,
  tempoRelativoDaFala,
  type OrigemDaRolagem
} from './transcricao';

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
  atual,
  tocando,
  onSeek
}: {
  turnos: readonly TurnoDaTranscricao[];
  agente: string;
  iniciadoEm: string;
  atual: number;
  tocando: boolean;
  onSeek: (segundos: number) => void;
}) {
  const rolagemRef = useRef<HTMLDivElement>(null);
  const falasRef = useRef<Array<HTMLElement | null>>([]);
  const rolagemDePrograma = useRef(false);
  const fimDaRolagemDePrograma = useRef(0);
  const [acompanhando, setAcompanhando] = useState(true);
  const [foraDeVista, setForaDeVista] = useState(false);
  const inicios = turnos.map((turno) =>
    inicioDaFalaEmSegundos({ quando: turno.quando, iniciadoEm })
  );
  const indiceAtivo = indiceDoTurnoAtivo(
    inicios.map((inicio) => (inicio === undefined ? Number.NaN : inicio)),
    atual
  );
  const haFalaAtiva = indiceAtivo >= 0;

  function atualizarForaDeVista() {
    const caixa = rolagemRef.current;
    const fala = haFalaAtiva ? falasRef.current[indiceAtivo] : null;

    setForaDeVista(caixa && fala ? medirForaDeVista(caixa, fala) : false);
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

    rolagemDePrograma.current = true;
    caixa.scrollTo({ top: topo, behavior: 'smooth' });
    window.clearTimeout(fimDaRolagemDePrograma.current);
    fimDaRolagemDePrograma.current = window.setTimeout(() => {
      rolagemDePrograma.current = false;
      atualizarForaDeVista();
    }, 400);
  }

  useLayoutEffect(() => {
    if (!deveRolarAteAFalaAtiva({ tocando, acompanhando, haFalaAtiva })) {
      return;
    }

    rolarAteAFalaAtiva();

    return () => {
      window.clearTimeout(fimDaRolagemDePrograma.current);
    };
  }, [indiceAtivo, tocando, acompanhando, haFalaAtiva]);

  useEffect(() => {
    atualizarForaDeVista();
  }, [indiceAtivo, haFalaAtiva, turnos]);

  function aoInteragir(origem: OrigemDaRolagem) {
    if (origem === 'scroll' && rolagemDePrograma.current) {
      setAcompanhando((atualAcompanhamento) =>
        acompanhamentoAposRolagem('programa', atualAcompanhamento)
      );
      window.clearTimeout(fimDaRolagemDePrograma.current);
      fimDaRolagemDePrograma.current = window.setTimeout(() => {
        rolagemDePrograma.current = false;
        atualizarForaDeVista();
      }, 80);
      return;
    }

    if (origem !== 'scroll') {
      rolagemDePrograma.current = false;
    }

    setAcompanhando((atualAcompanhamento) => acompanhamentoAposRolagem(origem, atualAcompanhamento));
    atualizarForaDeVista();
  }

  function voltarAoMomentoAtual() {
    setAcompanhando(retomarAcompanhamento());
    rolarAteAFalaAtiva();
  }

  function saltar(indice: number) {
    const inicio = inicios[indice];

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
          onWheel={() => {
            aoInteragir('wheel');
          }}
          onTouchMove={() => {
            aoInteragir('touchmove');
          }}
          onScroll={() => {
            aoInteragir('scroll');
          }}
        >
          <div className="transcricao-colunas">
            {turnos.map((turno, index) => {
              const doAgente = turno.locutor === 'Agente de Voz';
              const tempo = tempoRelativoDaFala({ quando: turno.quando, iniciadoEm });
              const ativa = index === indiceAtivo;
              const rotulo = doAgente ? agente : 'Cliente';

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
                      <div>
                        <div className="transcricao-meta" title={tempo.titulo}>
                          {rotulo} · {tempo.texto}
                        </div>
                        <p>{turno.texto}</p>
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
                        <div className="transcricao-meta" title={tempo.titulo}>
                          {rotulo} · {tempo.texto}
                        </div>
                        <p>{turno.texto}</p>
                      </div>
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
