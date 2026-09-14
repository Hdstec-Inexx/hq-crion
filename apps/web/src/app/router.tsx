import { areasDaCasca, destinoDaNavegacao } from '@hq-crion/contracts/casca';
import type { Papel } from '@hq-crion/contracts/perfil';
import {
  createBrowserRouter,
  redirect,
  type LoaderFunctionArgs
} from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { buscarPerfil } from '../features/auth/api';
import { lerSessao, limparSessao } from '../features/auth/sessao';
import { CascaAutenticada, FalhaAoCarregarPerfil } from '../features/casca/CascaAutenticada';
import { HealthPage } from '../features/health/HealthPage';
import { PaginaArea } from '../features/paginas/PaginaArea';

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
      ...rotasDoInventario.map((path) => ({
        path,
        element: <PaginaArea />
      }))
    ]
  }
]);
