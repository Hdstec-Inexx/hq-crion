export const velocidadesDoPlayer = [0.5, 1, 1.25, 1.5, 2] as const;

export type VelocidadeDoPlayer = (typeof velocidadesDoPlayer)[number];

export function velocidadeDoPlayer(valor: number): VelocidadeDoPlayer {
  return velocidadesDoPlayer.find((velocidade) => velocidade === valor) ?? 1;
}

export function reproducaoEmCurso({
  iniciada,
  encerrada
}: {
  iniciada: boolean;
  encerrada: boolean;
}) {
  return iniciada && !encerrada;
}

export function posicaoDoAudio(segundos: number, duracao: number) {
  if (!Number.isFinite(segundos) || segundos < 0) {
    return 0;
  }

  if (!Number.isFinite(duracao) || duracao <= 0) {
    return segundos;
  }

  return Math.min(segundos, duracao);
}

export function saltoDeTrintaSegundos(atual: number, duracao: number) {
  return posicaoDoAudio(posicaoDoAudio(atual, duracao) + 30, duracao);
}

export function barraContinuaVisivel({
  playerPrincipalForaDaTela,
  audioPresente,
  emCurso
}: {
  playerPrincipalForaDaTela: boolean;
  audioPresente: boolean;
  emCurso: boolean;
}) {
  return playerPrincipalForaDaTela && audioPresente && emCurso;
}
