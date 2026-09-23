import { caminhoDeMidiaPermitido } from '@hq-crion/contracts/atendimento';
import { useEffect, useRef, useState } from 'react';
import {
  barraContinuaVisivel,
  posicaoDoAudio,
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

function RelogioDoAudio({ atual, duracao }: { atual: number; duracao: number }) {
  return (
    <span className="audio-time">
      {formatarTempo(atual)} / {formatarTempo(duracao)}
    </span>
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

export function PlayerDeAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playerPrincipal = useRef<HTMLDivElement>(null);
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
    emCurso: reproducaoEmCurso({ iniciada, encerrada })
  });

  useEffect(() => {
    setTocando(false);
    setIniciada(false);
    setEncerrada(false);
    setAtual(0);
    setDuracao(0);
  }, [src]);

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

  function onSeek(segundos: number) {
    const elemento = audio.current;

    if (!elemento) {
      return;
    }

    const destino = posicaoDoAudio(segundos, duracao);
    elemento.currentTime = destino;
    setAtual(destino);

    if (duracao > 0 && destino >= duracao) {
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
        <BotaoReproduzir tocando={tocando} onReproduzir={onReproduzirClique} />
        <RelogioDoAudio atual={atual} duracao={duracao} />
        <div className="audio-onda" aria-hidden="true" />
        <SeletorDeVelocidade velocidade={velocidade} onEscolher={setVelocidade} />
      </div>
      {mostrarBarra ? (
        <div className="audio-barra-continua" title="Player de áudio">
          <BotaoReproduzir tocando={tocando} onReproduzir={onReproduzirClique} />
          <RelogioDoAudio atual={atual} duracao={duracao} />
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
