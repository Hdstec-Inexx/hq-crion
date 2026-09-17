export const motivosDeContato = [
  'Boleto',
  'Carência',
  'Não informado',
  'Rede credenciada'
] as const;

export const statusDaCuradoria = ['pendente', 'feita'] as const;

export type CampoVisivelDaListagem =
  | 'periodo'
  | 'conversa'
  | 'motivo'
  | 'criterios'
  | 'statusCuradoria'
  | 'curador'
  | 'notaIa'
  | 'statusAtendimento'
  | 'statusComentario'
  | 'limpar';

const camposPorRota: Record<string, readonly CampoVisivelDaListagem[]> = {
  '/atendimentos': [
    'periodo',
    'conversa',
    'motivo',
    'criterios',
    'statusCuradoria',
    'curador',
    'notaIa',
    'limpar',
    'statusAtendimento'
  ],
  '/fila-de-curadoria': ['periodo', 'conversa', 'motivo', 'notaIa', 'limpar'],
  '/minhas-curadorias': ['periodo', 'conversa', 'motivo', 'criterios', 'notaIa', 'limpar'],
  '/curadorias-realizadas': [
    'periodo',
    'conversa',
    'motivo',
    'criterios',
    'curador',
    'notaIa',
    'limpar'
  ],
  '/manutencao': ['periodo', 'statusComentario', 'limpar']
};

export function camposVisiveisDaListagem(rota: string): readonly CampoVisivelDaListagem[] {
  return camposPorRota[rota] ?? ['periodo', 'limpar'];
}

const chavesLimpaveis = [
  'inicio',
  'fim',
  'status',
  'nota',
  'motivo',
  'conversa',
  'curadoria',
  'notaIa',
  'statusCuradoria',
  'curador',
  'criteriosAtendidos',
  'criteriosNaoAtendidos',
  'indicador',
  'pagina'
] as const;

export function limparFiltrosDaQuery(query: URLSearchParams) {
  const proxima = new URLSearchParams(query);

  for (const chave of chavesLimpaveis) {
    proxima.delete(chave);
  }

  return proxima;
}
