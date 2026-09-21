import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export function DestinoDoGrafico({
  destino,
  className,
  rotulo,
  tamanhoDoMiolo,
  children
}: {
  destino: string;
  className: string;
  rotulo?: string;
  tamanhoDoMiolo: number;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const irAoPainel = () => navigate(destino);

  return (
    <div className={className} onClick={irAoPainel}>
      {children}
      <button
        aria-label={rotulo}
        className="dashboard-anel-miolo"
        onClick={(evento) => {
          evento.stopPropagation();
          irAoPainel();
        }}
        style={{ width: tamanhoDoMiolo, height: tamanhoDoMiolo }}
        type="button"
      />
    </div>
  );
}
