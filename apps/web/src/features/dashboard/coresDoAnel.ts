import type { PontoDoPainel } from './ponto-do-painel';

const paletaCrion = [
  '#5ec4be',
  '#2a9a94',
  '#7ed4ce',
  '#1e7a75',
  '#4aaea7',
  '#0f5c58',
  '#a3e0db',
  '#368f89'
];

export function coresDoAnel(quantidade: number, deslocamento: number) {
  return Array.from(
    { length: quantidade },
    (_, indice) => paletaCrion[(indice + deslocamento) % paletaCrion.length]!
  );
}

export function fatiasVisiveisDoAnel(dados: PontoDoPainel[]) {
  return dados.filter((item) => item.valor > 0);
}
