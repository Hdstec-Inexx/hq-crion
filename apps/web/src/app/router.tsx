import { areasDaCasca, destinoDaNavegacao, destinoInicial } from '@hq-crion/contracts/casca';
import type { Papel } from '@hq-crion/contracts/perfil';
import {
  createBrowserRouter,
  redirect,
  type LoaderFunctionArgs
} from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { buscarPerfil } from '../features/auth/api';
import { lerSessao, limparSessao } from '../features/auth/sessao';
import { DetalheAtendimento } from '../features/atendimentos/DetalheAtendimento';
import { FilaDeManutencao } from '../features/atendimentos/FilaDeManutencao';
import { ListagemAtendimentos } from '../features/atendimentos/ListagemAtendimentos';
import { CascaAutenticada, FalhaAoCarregarPerfil } from '../features/casca/CascaAutenticada';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HealthPage } from '../features/health/HealthPage';
import { PaginaArea } from '../features/paginas/PaginaArea';
import { PerfisPage } from '../features/perfis/PerfisPage';
import { MonitoramentoPage } from '../features/monitoramento/MonitoramentoPage';
import { DetalheMonitoramento } from '../features/monitoramento/DetalheMonitoramento';
import { IaAvaliadoraPage } from '../features/ia-avaliadora/IaAvaliadoraPage';
import { buscarIaAvaliadora } from '../features/ia-avaliadora/api';
import { listarPerfis } from '../features/perfis/api';
import { buscarRegua } from '../features/regua/api';
import { ReguaPage } from '../features/regua/ReguaPage';

const papeis: Papel[] = ['Admin', 'Gestão', 'Curador'];
const rotasDoInventario = [
  ...new Set(
    papeis.flatMap((papel) =>
      areasDaCasca(papel).map((area) => area.rota.replace(/^\//, ''))
    )
  )
];

async function carregarPerfil({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const sessao = lerSessao();

  if (!sessao) {
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  const perfil = await buscarPerfil(sessao, request.signal);

  if (!perfil) {
    limparSessao();
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  return perfil;
}

async function carregarRegua({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const sessao = lerSessao();

  if (!sessao) {
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  const regua = await buscarRegua(sessao, request.signal);

  if (!regua) {
    limparSessao();
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  return regua;
}

async function carregarIaAvaliadora({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const sessao = lerSessao();

  if (!sessao) {
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  const configuracao = await buscarIaAvaliadora(sessao, request.signal);

  if (configuracao === null) {
    limparSessao();
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  if (configuracao === 'negado') {
    const perfil = await buscarPerfil(sessao, request.signal);

    if (!perfil) {
      limparSessao();
      throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
    }

    throw redirect(destinoInicial(perfil.papel));
  }

  return configuracao;
}

async function carregarPerfis({ request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const sessao = lerSessao();

  if (!sessao) {
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  const lista = await listarPerfis(sessao, request.signal);

  if (lista === null) {
    limparSessao();
    throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
  }

  if (lista === 'negado') {
    const perfil = await buscarPerfil(sessao, request.signal);

    if (!perfil) {
      limparSessao();
      throw redirect(destinoDaNavegacao({ perfil: null, pathname }));
    }

    throw redirect(destinoInicial(perfil.papel));
  }

  return lista;
}

export const router = createBrowserRouter([
  { path: '/health', element: <HealthPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    id: 'casca',
    path: '/',
    loader: carregarPerfil,
    shouldRevalidate: () => false,
    errorElement: <FalhaAoCarregarPerfil />,
    element: <CascaAutenticada />,
    children: [
      { index: true, element: null },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'atendimentos', element: <ListagemAtendimentos /> },
      { path: 'atendimentos/:id', element: <DetalheAtendimento /> },
      { path: 'monitoramento', element: <MonitoramentoPage /> },
      { path: 'monitoramento/:id', element: <DetalheMonitoramento /> },
      {
        path: 'fila-de-curadoria',
        element: <ListagemAtendimentos caminho="/fila-de-curadoria" />
      },
      {
        path: 'minhas-curadorias',
        element: <ListagemAtendimentos caminho="/minhas-curadorias" />
      },
      {
        path: 'curadorias-realizadas',
        element: <ListagemAtendimentos caminho="/curadorias-realizadas" />
      },
      { path: 'manutencao', element: <FilaDeManutencao /> },
      { path: 'regua', loader: carregarRegua, element: <ReguaPage /> },
      { path: 'usuarios', loader: carregarPerfis, element: <PerfisPage /> },
      {
        path: 'ia-avaliadora',
        loader: carregarIaAvaliadora,
        element: <IaAvaliadoraPage />
      },
      ...rotasDoInventario
        .filter(
          (path) =>
            path !== 'regua' &&
            path !== 'usuarios' &&
            path !== 'ia-avaliadora' &&
            path !== 'dashboard' &&
            path !== 'atendimentos' &&
            path !== 'monitoramento' &&
            path !== 'fila-de-curadoria' &&
            path !== 'minhas-curadorias' &&
            path !== 'curadorias-realizadas' &&
            path !== 'manutencao'
        )
        .map((path) => ({
          path,
          element: <PaginaArea />
        }))
    ]
  }
]);
