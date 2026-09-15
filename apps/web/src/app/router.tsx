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
import { ListagemAtendimentos } from '../features/atendimentos/ListagemAtendimentos';
import { CascaAutenticada, FalhaAoCarregarPerfil } from '../features/casca/CascaAutenticada';
import { HealthPage } from '../features/health/HealthPage';
import { PaginaArea } from '../features/paginas/PaginaArea';
import { PerfisPage } from '../features/perfis/PerfisPage';
import { listarPerfis } from '../features/perfis/api';
import { buscarRegua } from '../features/regua/api';
import { ReguaPage } from '../features/regua/ReguaPage';

const papeis: Papel[] = ['Admin', 'Gestão', 'Curador'];
const rotasDoInventario = [
  ...new Set(
    papeis.flatMap((papel) =>
      areasDaCasca(papel).map((area) => area.rota.replace(/^\//, ''))
    )
  ),
  'atendimentos/:id'
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
      { path: 'atendimentos', element: <ListagemAtendimentos /> },
      { path: 'regua', loader: carregarRegua, element: <ReguaPage /> },
      { path: 'usuarios', loader: carregarPerfis, element: <PerfisPage /> },
      ...rotasDoInventario
        .filter(
          (path) =>
            path !== 'regua' && path !== 'usuarios' && path !== 'atendimentos'
        )
        .map((path) => ({
          path,
          element: <PaginaArea />
        }))
    ]
  }
]);
