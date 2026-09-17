import {
  areasDaCasca,
  destinoDaNavegacao,
  destinoInicial
} from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { encerrarSessao } from '../auth/api';
import { iconeDaArea, iconeRecolherCasca } from './icones';

export function CascaAutenticada() {
  const perfil = useLoaderData() as Perfil;
  const location = useLocation();
  const navigate = useNavigate();
  const [recolhida, setRecolhida] = useState(false);
  const destino = destinoDaNavegacao({
    perfil,
    pathname: location.pathname
  });

  if (destino !== location.pathname) {
    return <Navigate to={destino} replace />;
  }

  const areas = areasDaCasca(perfil.papel);

  async function onSair() {
    try {
      await encerrarSessao();
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className={`enquadramento${recolhida ? ' is-collapsed' : ''}`}>
      <aside className="casca">
        <div className="casca-topo">
          {!recolhida ? (
            <Link
              className="casca-marca"
              to={destinoInicial(perfil.papel)}
              aria-label="Abrir a primeira área do papel"
            >
              <img src="/logo-crion.png" alt="Crion" width={112} height={28} />
            </Link>
          ) : null}
          <button
            className="casca-recolher"
            type="button"
            onClick={() => setRecolhida((atual) => !atual)}
            aria-expanded={!recolhida}
            aria-label={recolhida ? 'Expandir casca' : 'Recolher casca'}
          >
            {iconeRecolherCasca(recolhida)}
          </button>
        </div>
        <nav className="casca-nav" aria-label="Casca autenticada">
          {areas.map((area) => (
            <NavLink
              key={area.rota}
              to={area.rota}
              title={area.rotulo}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {iconeDaArea(area.rota)}
              <span>{area.rotulo}</span>
            </NavLink>
          ))}
        </nav>
        <div className="casca-foot">
          <strong title={`${perfil.nome} · ${perfil.papel}`}>
            {perfil.nome} · {perfil.papel}
          </strong>
          <button
            className="casca-sair"
            type="button"
            onClick={onSair}
            aria-label={`Sair de ${perfil.nome}`}
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="casca-main">
        <Outlet />
      </main>
    </div>
  );
}

export function FalhaAoCarregarPerfil() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Não foi possível confirmar o Perfil</h1>
        <p>
          A sessão pode estar inválida ou a API indisponível. Entre de novo
          pela página de login.
        </p>
        <Link className="login-cta" to="/login">
          Ir para o login
        </Link>
      </section>
    </main>
  );
}
