import { destinoDaNavegacao } from '@hq-crion/contracts/casca';
import {
  alternarVisibilidadeDaSenha,
  campoDaSenha,
  type Perfil,
  type VisibilidadeDaSenha
} from '@hq-crion/contracts/perfil';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { buscarPerfil, entrar } from './api';
import { lerSessao } from './sessao';

export function CampoSenha({
  rotulo,
  autoComplete,
  className,
  minimo
}: {
  rotulo: string;
  autoComplete: string;
  className?: string;
  minimo?: number;
}) {
  const id = useId();
  const [visibilidade, setVisibilidade] = useState<VisibilidadeDaSenha>('oculta');
  const campo = campoDaSenha(visibilidade);

  return (
    <div className={className ? `login-field ${className}` : 'login-field'}>
      <label htmlFor={id}>{rotulo}</label>
      <span className="senha-com-botao">
        <input
          id={id}
          name="senha"
          type={campo.tipo}
          autoComplete={autoComplete}
          minLength={minimo}
          maxLength={128}
          required
        />
        <button
          className="mostrar-senha"
          type="button"
          onClick={() => setVisibilidade(alternarVisibilidadeDaSenha)}
        >
          {campo.rotulo}
        </button>
      </span>
    </div>
  );
}

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

    buscarPerfil(sessao, controller.signal)
      .then((atual) => {
        if (!controller.signal.aborted) {
          setPerfil(atual);
        }
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }

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
        <CampoSenha rotulo="Senha" autoComplete="current-password" />
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
