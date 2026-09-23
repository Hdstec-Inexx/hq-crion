import { caminhoDeMidiaPermitido } from '@hq-crion/contracts/atendimento';
import { useEffect, useRef, useState } from 'react';
import {
  barraContinuaVisivel,
  reproducaoEmCurso,
  saltoDeTrintaSegundos,
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

export function PlayerDeAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const principal = useRef<HTMLDivElement>(null);
  const [tocando, setTocando] = useState(false);
  const [iniciada, setIniciada] = useState(false);
  const [encerrada, setEncerrada] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState<VelocidadeDoPlayer>(1);
  const [principalVisivel, setPrincipalVisivel] = useState(true);
  const audioPresente = caminhoDeMidiaPermitido(src);
  const mostrarBarra = barraContinuaVisivel({
    playerPrincipalForaDaTela: !principalVisivel,
    audioPresente,
    reproducaoEmCurso: reproducaoEmCurso({ iniciada, encerrada })
  });

  useEffect(() => {
    const elemento = principal.current;

    if (!elemento || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observador = new IntersectionObserver(([entrada]) => {
      setPrincipalVisivel(entrada?.isIntersecting !== false);
    });

    observador.observe(elemento);

    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const elemento = audio.current;

    if (elemento) {
      elemento.playbackRate = velocidade;
    }
  }, [velocidade]);

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
      setIniciada(true);
      setEncerrada(false);
    } catch {
      setTocando(false);
    }
  }

  function onSeek(segundos: number) {
    const elemento = audio.current;

    if (!elemento) {
      return;
    }

    elemento.currentTime = segundos;
    setAtual(segundos);
    setEncerrada(duracao > 0 && segundos >= duracao);
  }

  return (
    <>
      <div ref={principal} className="audio-player" title="Player de áudio">
        {audioPresente ? (
          <audio
            ref={audio}
            src={src}
            onTimeUpdate={(event) => {
              const segundos = event.currentTarget.currentTime;
              setAtual((anterior) =>
                Math.floor(anterior) === Math.floor(segundos) ? anterior : segundos
              );
            }}
            onLoadedMetadata={(event) => {
              const media = event.currentTarget;

              if (Number.isFinite(media.duration) && media.duration > 0) {
                setDuracao(media.duration);
                setAtual(media.currentTime);
                media.playbackRate = velocidade;
              }
            }}
            onEnded={(event) => {
              setTocando(false);
              setAtual(event.currentTarget.duration);
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
        <BotaoReproduzir
          tocando={tocando}
          onReproduzir={() => {
            void onReproduzir();
          }}
        />
        <span className="audio-time">
          {formatarTempo(atual)} / {formatarTempo(duracao)}
        </span>
        <div className="audio-onda" aria-hidden="true" />
        <SeletorDeVelocidade velocidade={velocidade} onEscolher={setVelocidade} />
      </div>
      {mostrarBarra ? (
        <div className="audio-barra-continua" title="Player de áudio">
          <BotaoReproduzir
            tocando={tocando}
            onReproduzir={() => {
              void onReproduzir();
            }}
          />
          <span className="audio-time">
            {formatarTempo(atual)} / {formatarTempo(duracao)}
          </span>
          <input
            className="audio-progresso"
            type="range"
            min={0}
            max={duracao || 0}
            step={0.1}
            value={atual}
            aria-label="Progresso"
            onChange={(event) => {
              onSeek(Number(event.currentTarget.value));
            }}
          />
          <button
            className="audio-salto"
            type="button"
            aria-label="Avançar 30 segundos"
            onClick={() => {
              onSeek(saltoDeTrintaSegundos(atual, duracao));
            }}
          >
            +30s
          </button>
          <SeletorDeVelocidade velocidade={velocidade} onEscolher={setVelocidade} />
        </div>
      ) : null}
    </>
  );
}
