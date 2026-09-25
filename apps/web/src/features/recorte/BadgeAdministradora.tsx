import {
  destinoDoBadge,
  type Administradora
} from '@hq-crion/contracts/recorte';
import { Link } from 'react-router-dom';

export function BadgeAdministradora({
  administradora,
  lista = '/atendimentos'
}: {
  administradora: Administradora;
  lista?: string;
}) {
  return (
    <Link
      className="badge-administradora"
      to={destinoDoBadge(administradora, lista)}
    >
      {administradora}
    </Link>
  );
}
