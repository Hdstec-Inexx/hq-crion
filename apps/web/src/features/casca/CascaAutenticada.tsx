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
import { iconeDaArea } from './icones';

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
        <Link
          className="casca-marca"
          to={destinoInicial(perfil.papel)}
          aria-label="Abrir a primeira área do papel"
        >
          <img src="/logo-crion.png" alt="Crion" width={112} height={28} />
        </Link>
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
          <strong>
            {perfil.nome} · {perfil.papel}
          </strong>
          <div>
            <button
              type="button"
              onClick={() => setRecolhida((atual) => !atual)}
              aria-label={recolhida ? 'Expandir casca' : 'Recolher casca'}
            >
              {recolhida ? '▸' : '◂'}
            </button>
            <button className="casca-sair" type="button" onClick={onSair}>
              Sair
            </button>
          </div>
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
