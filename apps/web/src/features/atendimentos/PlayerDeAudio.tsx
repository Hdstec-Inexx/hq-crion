import { caminhoDeMidiaPermitido } from '@hq-crion/contracts/atendimento';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent
} from 'react';
import { buscarObjetoDaMidia } from './api';
import {
  barraContinuaVisivel,
  instanteDaBuscaNaOnda,
  posicaoDoArraste,
  posicaoDoAudio,
  reproducaoEmCurso,
  saltoDeTrintaSegundosParaFrente,
  saltoDeTrintaSegundosParaTras,
  velocidadeDoPlayer,
  velocidadesDoPlayer,
  type VelocidadeDoPlayer
} from './player';

function formatarTempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) {
    return '0:00';
  }

  const total = Math.floor(segundos);
  const minutos = Math.floor(total / 60);
  const resto = String(total % 60).padStart(2, '0');

  return `${minutos}:${resto}`;
}

function rotuloDaVelocidade(velocidade: VelocidadeDoPlayer) {
  return `${String(velocidade).replace('.', ',')}×`;
}

function RelogioDoAudio({ atual, duracao }: { atual: number; duracao: number }) {
  return (
    <span className="audio-time">
      {formatarTempo(atual)} / {formatarTempo(duracao)}
    </span>
  );
}

const saltos = {
  tras: {
    rotulo: 'Voltar 30 segundos',
    texto: '-30s',
    calcular: saltoDeTrintaSegundosParaTras
  },
  frente: {
    rotulo: 'Avançar 30 segundos',
    texto: '+30s',
    calcular: saltoDeTrintaSegundosParaFrente
  }
} as const;

type SentidoDoSalto = keyof typeof saltos;

function BotaoSalto({
  sentido,
  onSalto
}: {
  sentido: SentidoDoSalto;
  onSalto: () => void;
}) {
  const salto = saltos[sentido];

  return (
    <button className="audio-salto" type="button" aria-label={salto.rotulo} onClick={onSalto}>
      {salto.texto}
    </button>
  );
}

function BotaoReproduzir({
  tocando,
  onReproduzir
}: {
  tocando: boolean;
  onReproduzir: () => void;
}) {
  return (
    <button
      className="audio-play"
      type="button"
      aria-label={tocando ? 'Pausar' : 'Reproduzir'}
      onClick={onReproduzir}
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
  );
}

function SeletorDeVelocidade({
  velocidade,
  onEscolher
}: {
  velocidade: VelocidadeDoPlayer;
  onEscolher: (valor: VelocidadeDoPlayer) => void;
}) {
  return (
    <select
      className="audio-velocidade"
      aria-label="Velocidade"
      value={velocidade}
      onChange={(event) => {
        onEscolher(velocidadeDoPlayer(Number(event.currentTarget.value)));
      }}
    >
      {velocidadesDoPlayer.map((opcao) => (
        <option key={opcao} value={opcao}>
          {rotuloDaVelocidade(opcao)}
        </option>
      ))}
    </select>
  );
}

function aplicarVelocidade(elemento: HTMLAudioElement | null, velocidade: VelocidadeDoPlayer) {
  if (elemento) {
    elemento.playbackRate = velocidade;
  }
}

export function PlayerDeAudio({ caminho }: { caminho: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playerPrincipal = useRef<HTMLDivElement>(null);
  const onda = useRef<HTMLDivElement>(null);
  const quadroDoArraste = useRef(0);
  const ponteiroDoArraste = useRef(0);
  const arrasteAberto = useRef(false);
  const [src, setSrc] = useState('');
  const [tocando, setTocando] = useState(false);
  const [iniciada, setIniciada] = useState(false);
  const [encerrada, setEncerrada] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState<VelocidadeDoPlayer>(1);
  const [principalVisivel, setPrincipalVisivel] = useState(true);
  const audioPresente = Boolean(src);
  const mostrarBarra = barraContinuaVisivel({
    playerPrincipalForaDaTela: !principalVisivel,
    audioPresente,
    emCurso: reproducaoEmCurso({ iniciada, encerrada })
  });

  useEffect(() => {
    setTocando(false);
    setIniciada(false);
    setEncerrada(false);
    setAtual(0);
    setDuracao(0);

    if (!caminhoDeMidiaPermitido(caminho)) {
      setSrc('');
      return;
    }

    if (/^https?:\/\//i.test(caminho)) {
      setSrc(caminho);
      return () => {
        setSrc('');
      };
    }

    const controller = new AbortController();
    let objeto = '';

    void buscarObjetoDaMidia(caminho, controller.signal).then((url) => {
      if (controller.signal.aborted || !url) {
        if (url) {
          URL.revokeObjectURL(url);
        }
        return;
      }

      objeto = url;
      setSrc(url);
    });

    return () => {
      controller.abort();
      if (objeto) {
        URL.revokeObjectURL(objeto);
      }
      setSrc('');
    };
  }, [caminho]);

  useEffect(() => {
    const elemento = playerPrincipal.current;

    if (!elemento || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observador = new IntersectionObserver(([entrada]) => {
      setPrincipalVisivel(entrada?.isIntersecting ?? true);
    });

    observador.observe(elemento);

    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    aplicarVelocidade(audio.current, velocidade);
  }, [velocidade, src]);

  useEffect(() => {
    return () => {
      if (quadroDoArraste.current !== 0) {
        cancelAnimationFrame(quadroDoArraste.current);
      }
    };
  }, []);

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
      aplicarVelocidade(elemento, velocidade);
      await elemento.play();
      setTocando(true);
      setIniciada(true);
      setEncerrada(false);
    } catch {
      setTocando(false);
    }
  }

  function onSeek(segundos: number, solto = true) {
    const elemento = audio.current;

    if (!elemento) {
      return;
    }

    const destino = posicaoDoArraste(segundos, duracao, solto);
    elemento.currentTime = destino;
    setAtual(destino);

    if (solto && duracao > 0 && destino >= duracao) {
      elemento.pause();
      setTocando(false);
      setEncerrada(true);
      return;
    }

    setEncerrada(false);
  }

  function onReproduzirClique() {
    void onReproduzir();
  }

  function saltar(sentido: SentidoDoSalto) {
    onSeek(saltos[sentido].calcular(atual, duracao));
  }

  function instanteNoPonteiro(clientX: number) {
    const faixa = onda.current?.getBoundingClientRect();

    if (!faixa) {
      return 0;
    }

    return instanteDaBuscaNaOnda(clientX - faixa.left, faixa.width, duracao);
  }

  function agendarArraste() {
    if (quadroDoArraste.current !== 0) {
      return;
    }

    quadroDoArraste.current = requestAnimationFrame(() => {
      quadroDoArraste.current = 0;

      if (!arrasteAberto.current) {
        return;
      }

      onSeek(instanteNoPonteiro(ponteiroDoArraste.current), false);
    });
  }

  function onPonteiroNaOnda(event: PointerEvent<HTMLDivElement>) {
    if (event.type === 'pointermove' && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    ponteiroDoArraste.current = event.clientX;

    if (event.type === 'pointerdown') {
      event.currentTarget.setPointerCapture(event.pointerId);
      arrasteAberto.current = true;
      agendarArraste();
      return;
    }

    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      arrasteAberto.current = false;

      if (quadroDoArraste.current !== 0) {
        cancelAnimationFrame(quadroDoArraste.current);
        quadroDoArraste.current = 0;
      }

      onSeek(instanteNoPonteiro(event.clientX), true);
      return;
    }

    agendarArraste();
  }

  function onTeclaNaOnda(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      saltar('tras');
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      saltar('frente');
    }
  }

  const progresso =
    duracao > 0 ? `${(posicaoDoAudio(atual, duracao) / duracao) * 100}%` : '0%';

  return (
    <>
      <div ref={playerPrincipal} className="audio-player" title="Player de áudio">
        {audioPresente ? (
          <audio
            key={src}
            ref={audio}
            src={src}
            onTimeUpdate={(event) => {
              const segundos = event.currentTarget.currentTime;

              if (!Number.isFinite(segundos)) {
                return;
              }

              setAtual((anterior) =>
                Math.round(anterior * 10) === Math.round(segundos * 10) ? anterior : segundos
              );
            }}
            onLoadedMetadata={(event) => {
              const media = event.currentTarget;
              const carregada = media.duration;

              if (Number.isFinite(carregada) && carregada > 0) {
                setDuracao(carregada);
                setAtual(posicaoDoAudio(media.currentTime, carregada));
                aplicarVelocidade(media, velocidade);
              }
            }}
            onEnded={(event) => {
              const fim = event.currentTarget.duration;
              setTocando(false);
              setAtual(Number.isFinite(fim) ? fim : duracao);
              setEncerrada(true);
            }}
            onPause={() => setTocando(false)}
            onPlay={() => {
              setTocando(true);
              setIniciada(true);
              setEncerrada(false);
            }}
          />
        ) : null}
        <BotaoSalto sentido="tras" onSalto={() => saltar('tras')} />
        <BotaoReproduzir tocando={tocando} onReproduzir={onReproduzirClique} />
        <BotaoSalto sentido="frente" onSalto={() => saltar('frente')} />
        <RelogioDoAudio atual={atual} duracao={duracao} />
        <div
          ref={onda}
          className="audio-onda"
          role="slider"
          aria-label="Posição na onda"
          aria-valuemin={0}
          aria-valuemax={duracao || 0}
          aria-valuenow={Number.isFinite(atual) ? atual : 0}
          aria-valuetext={formatarTempo(atual)}
          tabIndex={0}
          style={{ '--progresso': progresso } as CSSProperties}
          onPointerDown={onPonteiroNaOnda}
          onPointerMove={onPonteiroNaOnda}
          onPointerUp={onPonteiroNaOnda}
          onPointerCancel={onPonteiroNaOnda}
          onKeyDown={onTeclaNaOnda}
        />
        <SeletorDeVelocidade velocidade={velocidade} onEscolher={setVelocidade} />
      </div>
      {mostrarBarra ? (
        <div className="audio-barra-continua" title="Player de áudio">
          <BotaoReproduzir tocando={tocando} onReproduzir={onReproduzirClique} />
          <RelogioDoAudio atual={atual} duracao={duracao} />
          <BotaoSalto sentido="tras" onSalto={() => saltar('tras')} />
          <input
            className="audio-progresso"
            type="range"
            min={0}
            max={duracao || 0}
            step={0.1}
            value={Number.isFinite(atual) ? atual : 0}
            aria-label="Progresso"
            onChange={(event) => {
              onSeek(Number(event.currentTarget.value));
            }}
          />
          <BotaoSalto sentido="frente" onSalto={() => saltar('frente')} />
          <SeletorDeVelocidade velocidade={velocidade} onEscolher={setVelocidade} />
        </div>
      ) : null}
    </>
  );
}
