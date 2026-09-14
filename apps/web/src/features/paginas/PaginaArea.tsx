import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { useLocation, useRouteLoaderData } from 'react-router-dom';

export function PaginaArea() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();

  return (
    <div className="pagina-head">
      <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
    </div>
  );
}
