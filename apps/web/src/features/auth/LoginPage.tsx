import { destinoDaNavegacao } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { buscarPerfil, entrar } from './api';
import { lerSessao } from './sessao';

export function LoginPage() {
  const location = useLocation();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erro, setErro] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const sessao = lerSessao();

    if (!sessao) {
      return;
    }

    const controller = new AbortController();

    buscarPerfil(sessao)
      .then((atual) => {
        if (!controller.signal.aborted) {
          setPerfil(atual);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPerfil(null);
        }
      });

    return () => controller.abort();
  }, []);

  if (perfil) {
    return (
      <Navigate
        to={destinoDaNavegacao({ perfil, pathname: location.pathname })}
        replace
      />
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '');
    const senha = String(data.get('senha') ?? '');

    setErro(false);
    setEnviando(true);

    try {
      setPerfil(await entrar(email, senha));
    } catch {
      setErro(true);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <img src="/logo-crion.png" alt="Crion" width={132} height={36} />
        <h1>Entrar no HQ</h1>
        <p>Qualidade das Claras · Affix, Alter e Conectaplan</p>
        <label className="login-field">
          E-mail
          <input name="email" type="text" autoComplete="username" required />
        </label>
        <label className="login-field">
          Senha
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {erro ? (
          <p className="login-error" role="alert">
            Não foi possível entrar. Confira o e-mail e a senha.
          </p>
        ) : null}
        <button className="login-cta" type="submit" disabled={enviando}>
          Entrar
        </button>
      </form>
    </main>
  );
}
