import { motivosDeContato, notaIaDaQuery } from '@hq-crion/contracts/filtros-listagem';

export function queryAposFiltrar(
  atual: URLSearchParams,
  data: FormData,
  opcoesMotivo?: readonly string[]
) {
  const proxima = new URLSearchParams(atual);
  const filtrosDeValorUnico = [
    'inicio',
    'fim',
    'tipoData',
    'status',
    'motivo',
    'conversa',
    'cpf',
    'notaIa',
    'statusCuradoria',
    'curador'
  ] as const;

  for (const campo of filtrosDeValorUnico) {
    const valor = String(data.get(campo) ?? '').trim();

    if (campo === 'tipoData') {
      if (valor === 'curadoria') {
        proxima.set(campo, 'curadoria');
      } else {
        proxima.delete(campo);
      }
      continue;
    }

    if (campo === 'notaIa') {
      const notaIa = notaIaDaQuery(valor);

      if (notaIa === undefined) {
        proxima.delete(campo);
      } else {
        proxima.set(campo, String(notaIa));
      }

      continue;
    }

    if (campo === 'motivo') {
      if (opcoesMotivo && opcoesMotivo.length > 0) {
        const aceito = opcoesMotivo.find((opcao) => opcao === valor);
        if (aceito) {
          proxima.set(campo, aceito);
        } else {
          proxima.delete(campo);
        }
      } else {
        const motivo = motivosDeContato.find((opcao) => opcao === valor);

        if (motivo) {
          proxima.set(campo, motivo);
        } else {
          proxima.delete(campo);
        }
      }

      continue;
    }

    if (valor) {
      proxima.set(campo, valor);
    } else {
      proxima.delete(campo);
    }
  }

  for (const campo of ['criteriosAtendidos', 'criteriosNaoAtendidos'] as const) {
    const valores = data
      .getAll(campo)
      .map((valor) => String(valor).trim())
      .filter(Boolean);

    if (valores.length > 0) {
      proxima.set(campo, valores.join(','));
    } else {
      proxima.delete(campo);
    }
  }

  proxima.delete('nota');
  proxima.delete('curadoria');
  proxima.delete('pagina');

  return proxima;
}
