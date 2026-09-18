import type { PontoDoPainel } from './ponto-do-painel';

const paletaDosAneis = [
  '#5ec4be',
  '#e07a3d',
  '#2b5f8f',
  '#7d4e8e',
  '#c9a227',
  '#3f7cac',
  '#4f8f63',
  '#c46b4a'
];

export function coresDoAnel(quantidade: number, deslocamento: number) {
  return Array.from(
    { length: quantidade },
    (_, indice) => paletaDosAneis[(indice + deslocamento) % paletaDosAneis.length]!
  );
}

export function fatiasVisiveisDoAnel(dados: PontoDoPainel[]) {
  return dados.filter((item) => item.valor > 0);
}
