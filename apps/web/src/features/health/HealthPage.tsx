import { healthResponseSchema } from '@hq-crion/contracts/health';
import { useEffect, useState } from 'react';

type HealthState = 'loading' | 'ready' | 'error';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const mensagensPorEstado: Record<
  HealthState,
  { title: string; status: string }
> = {
  loading: {
    title: 'Verificando o HQ Crion',
    status: 'Consultando a API'
  },
  ready: {
    title: 'HQ Crion está no ar',
    status: 'API operacional'
  },
  error: {
    title: 'Não foi possível confirmar o HQ Crion',
    status: 'API indisponível'
  }
};

export function HealthPage() {
  const [state, setState] = useState<HealthState>('loading');

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Health request failed with ${response.status}`);
        }
        return healthResponseSchema.parse(await response.json());
      })
      .then(() => setState('ready'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState('error');
        }
      });

    return () => controller.abort();
  }, []);

  const { title, status } = mensagensPorEstado[state];

  return (
    <main className="health-page">
      <section className="health-card" aria-live="polite">
        <img src="/logo-crion.png" alt="Crion" width={132} height={36} />
        <h1>{title}</h1>
        <p>
          Página pública, fora da Casca autenticada. Quem chega aqui vê se o
          serviço de qualidade das Claras está no ar, sem login.
        </p>
        <p className={`health-status health-status-${state}`}>
          <span aria-hidden="true" />
          {status}
        </p>
      </section>
    </main>
  );
}
