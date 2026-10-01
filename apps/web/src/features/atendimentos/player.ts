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

function duracaoUtil(duracao: number) {
  return Number.isFinite(duracao) && duracao > 0 ? duracao : 0;
}

function dentroDoAudio(segundos: number, duracao: number) {
  const teto = duracaoUtil(duracao);

  if (teto === 0) {
    return 0;
  }

  return posicaoDoAudio(segundos, teto);
}

function saltoDeTrintaSegundos(atual: number, duracao: number, deslocamento: number) {
  return dentroDoAudio(dentroDoAudio(atual, duracao) + deslocamento, duracao);
}

export function saltoDeTrintaSegundosParaTras(atual: number, duracao: number) {
  return saltoDeTrintaSegundos(atual, duracao, -30);
}

export function saltoDeTrintaSegundosParaFrente(atual: number, duracao: number) {
  return saltoDeTrintaSegundos(atual, duracao, 30);
}

export function posicaoDoArraste(segundos: number, duracao: number, solto: boolean) {
  const destino = dentroDoAudio(segundos, duracao);
  const teto = duracaoUtil(duracao);

  if (!solto && teto > 0 && destino >= teto) {
    return Math.max(0, teto - Math.min(0.05, teto / 2));
  }

  return destino;
}

export function instanteDaBuscaNaOnda(deslocamento: number, largura: number, duracao: number) {
  if (!Number.isFinite(deslocamento) || !Number.isFinite(largura) || largura <= 0) {
    return 0;
  }

  return dentroDoAudio((deslocamento / largura) * duracao, duracao);
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
