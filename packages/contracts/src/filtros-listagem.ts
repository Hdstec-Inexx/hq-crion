import { z } from 'zod';

export const motivosDeContato = [
  'Boleto',
  'Carência',
  'Não informado',
  'Rede credenciada'
] as const;

export type MotivoDeContato = string;

export const statusDaCuradoria = ['pendente', 'feita'] as const;

export const tiposData = ['atendimento', 'curadoria'] as const;
export const tipoDataSchema = z.enum(tiposData);
export type TipoData = z.infer<typeof tipoDataSchema>;

export type CampoVisivelDaListagem =
  | 'periodo'
  | 'tipoData'
  | 'conversa'
  | 'cpf'
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
    'tipoData',
    'conversa',
    'cpf',
    'motivo',
    'criterios',
    'statusCuradoria',
    'curador',
    'notaIa',
    'limpar',
    'statusAtendimento'
  ],
  '/favoritos': [
    'conversa',
    'curador',
    'limpar'
  ],
  '/fila-de-curadoria': ['periodo', 'conversa', 'cpf', 'motivo', 'notaIa', 'limpar'],
  '/minhas-curadorias': [
    'periodo',
    'tipoData',
    'conversa',
    'cpf',
    'motivo',
    'criterios',
    'notaIa',
    'limpar'
  ],
  '/curadorias-realizadas': [
    'periodo',
    'tipoData',
    'conversa',
    'cpf',
    'motivo',
    'criterios',
    'curador',
    'notaIa',
    'limpar'
  ],
  '/manutencao': ['periodo', 'conversa', 'statusComentario', 'limpar']
};

export function camposVisiveisDaListagem(
  rota: string,
  papel?: 'Admin' | 'Gestão' | 'Curador'
): readonly CampoVisivelDaListagem[] {
  if (rota === '/favoritos' && papel === 'Curador') {
    return ['conversa', 'limpar'];
  }
  const campos = camposPorRota[rota] ?? ['periodo', 'limpar'];
  if (rota === '/atendimentos' && papel === 'Curador') {
    return campos.filter(
      (campo) => campo !== 'statusCuradoria' && campo !== 'tipoData'
    );
  }
  return campos;
}

const chavesLimpaveis = [
  'inicio',
  'fim',
  'tipoData',
  'status',
  'nota',
  'motivo',
  'conversa',
  'cpf',
  'curadoria',
  'notaIa',
  'statusCuradoria',
  'curador',
  'perfilId',
  'criteriosAtendidos',
  'criteriosNaoAtendidos',
  'indicador',
  'pagina'
] as const;

export function notaIaDaQuery(valor: string | undefined) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    return undefined;
  }

  const nota = Number(valor);

  if (!Number.isFinite(nota) || nota <= 0 || nota > 10 || !Number.isInteger(nota * 2)) {
    return undefined;
  }

  return nota;
}

export function limparFiltrosDaQuery(query: URLSearchParams) {
  const proxima = new URLSearchParams(query);

  for (const chave of chavesLimpaveis) {
    proxima.delete(chave);
  }

  return proxima;
}
