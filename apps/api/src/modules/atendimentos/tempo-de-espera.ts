export function quandoDaFonte(segundos: number) {
  const total = Math.max(0, Math.floor(segundos));
  const minutos = Math.floor(total / 60);
  const resto = String(total % 60).padStart(2, '0');

  return `${minutos}:${resto}`;
}

function segundosDeQuando(quando: string) {
  const partes = quando.split(':');

  if (partes.length !== 2) {
    return undefined;
  }

  const minutos = Number(partes[0]);
  const segundos = Number(partes[1]);

  if (
    !Number.isInteger(minutos) ||
    !Number.isInteger(segundos) ||
    minutos < 0 ||
    segundos < 0 ||
    segundos > 59
  ) {
    return undefined;
  }

  return minutos * 60 + segundos;
}

export function tempoDeEsperaDaTranscricao(
  turnos: readonly { locutor: string; quando: string }[]
) {
  const falasDoAgente = turnos
    .filter((turno) => turno.locutor === 'Agente de Voz')
    .map((turno) => segundosDeQuando(turno.quando));
  const primeiraDoCliente = turnos
    .filter((turno) => turno.locutor === 'Cliente')
    .map((turno) => segundosDeQuando(turno.quando))
    .find((segundos) => segundos !== undefined);
  const segundaFala = falasDoAgente[1];

  if (
    segundaFala === undefined ||
    primeiraDoCliente === undefined ||
    segundaFala < primeiraDoCliente
  ) {
    return undefined;
  }

  return segundaFala - primeiraDoCliente;
}
