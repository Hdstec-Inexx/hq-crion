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

export function saltoDeTrintaSegundos(atual: number, duracao: number) {
  const origem = Number.isFinite(atual) && atual > 0 ? atual : 0;
  const destino = origem + 30;

  if (!Number.isFinite(duracao) || duracao <= 0) {
    return destino;
  }

  return Math.min(destino, duracao);
}

export function barraContinuaVisivel({
  playerPrincipalForaDaTela,
  audioPresente,
  reproducaoEmCurso
}: {
  playerPrincipalForaDaTela: boolean;
  audioPresente: boolean;
  reproducaoEmCurso: boolean;
}) {
  return playerPrincipalForaDaTela && audioPresente && reproducaoEmCurso;
}
