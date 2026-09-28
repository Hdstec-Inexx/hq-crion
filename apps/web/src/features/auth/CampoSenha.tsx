import { maximoDaSenha } from '@hq-crion/contracts/perfil';
import { useId, useState } from 'react';
import {
  alternarVisibilidadeDaSenha,
  campoDaSenha,
  type VisibilidadeDaSenha
} from './campo-da-senha';

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
          maxLength={maximoDaSenha}
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
