import type { Papel } from './perfil.js';

export type AreaDaCasca = {
  rota: string;
  rotulo: string;
  titulo: string;
};

const dashboard: AreaDaCasca = {
  rota: '/dashboard',
  rotulo: 'Dashboard',
  titulo: 'Dashboard'
};

const atendimentos: AreaDaCasca = {
  rota: '/atendimentos',
  rotulo: 'Atendimentos',
  titulo: 'Atendimentos'
};

const aoVivo: AreaDaCasca = {
  rota: '/monitoramento',
  rotulo: 'Ao vivo',
  titulo: 'Monitoramento ao Vivo'
};

const filaDeCuradoria: AreaDaCasca = {
  rota: '/fila-de-curadoria',
  rotulo: 'Fila de curadoria',
  titulo: 'Fila de Curadoria'
};

const curadoriasRealizadas: AreaDaCasca = {
  rota: '/curadorias-realizadas',
  rotulo: 'Curadorias realizadas',
  titulo: 'Curadorias Realizadas'
};

const minhasCuradorias: AreaDaCasca = {
  rota: '/minhas-curadorias',
  rotulo: 'Minhas curadorias',
  titulo: 'Minhas Curadorias'
};

const manutencao: AreaDaCasca = {
  rota: '/manutencao',
  rotulo: 'Manutenção',
  titulo: 'Fila de Manutenção'
};

const usuarios: AreaDaCasca = {
  rota: '/usuarios',
  rotulo: 'Usuários',
  titulo: 'Perfis'
};

const iaAvaliadora: AreaDaCasca = {
  rota: '/ia-avaliadora',
  rotulo: 'IA Avaliadora',
  titulo: 'IA Avaliadora'
};

const regua: AreaDaCasca = {
  rota: '/regua',
  rotulo: 'Régua',
  titulo: 'Régua de Avaliação'
};

const areasPorPapel: Record<Papel, AreaDaCasca[]> = {
  Gestão: [
    dashboard,
    atendimentos,
    aoVivo,
    filaDeCuradoria,
    curadoriasRealizadas,
    regua
  ],
  Curador: [
    atendimentos,
    aoVivo,
    filaDeCuradoria,
    minhasCuradorias,
    regua
  ],
  Admin: [
    dashboard,
    atendimentos,
    aoVivo,
    filaDeCuradoria,
    curadoriasRealizadas,
    manutencao,
    usuarios,
    iaAvaliadora,
    regua
  ]
};

export function areasDaCasca(papel: Papel): AreaDaCasca[] {
  return areasPorPapel[papel];
}

export function destinoInicial(papel: Papel): string {
  return areasPorPapel[papel][0].rota;
}

function isDetalheDeAtendimento(pathname: string) {
  return /^\/atendimentos\/.+/.test(pathname);
}

export function destinoDaNavegacao(input: {
  perfil: { papel: Papel } | null;
  pathname: string;
}): string {
  if (!input.perfil) {
    if (input.pathname === '/health' || input.pathname === '/login') {
      return input.pathname;
    }

    return '/login';
  }

  if (input.pathname === '/' || input.pathname === '/login') {
    return destinoInicial(input.perfil.papel);
  }

  if (input.pathname === '/health') {
    return input.pathname;
  }

  if (!areaLiberada(input.perfil.papel, input.pathname)) {
    return destinoInicial(input.perfil.papel);
  }

  return input.pathname;
}

function areaLiberada(papel: Papel, pathname: string) {
  if (isDetalheDeAtendimento(pathname)) {
    return areasDaCasca(papel).some((area) => area.rota === '/atendimentos');
  }

  return areasDaCasca(papel).some((area) => area.rota === pathname);
}

export function tituloDaPagina(pathname: string, papel: Papel): string {
  if (isDetalheDeAtendimento(pathname)) {
    return 'Atendimento';
  }

  return areasDaCasca(papel).find((area) => area.rota === pathname)?.titulo ?? '';
}
