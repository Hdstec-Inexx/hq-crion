import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export function DestinoDoGrafico({
  destino,
  className,
  rotulo,
  children
}: {
  destino: string;
  className: string;
  rotulo?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <button
      aria-label={rotulo}
      className={className}
      onClick={() => navigate(destino)}
      type="button"
    >
      {children}
    </button>
  );
}
