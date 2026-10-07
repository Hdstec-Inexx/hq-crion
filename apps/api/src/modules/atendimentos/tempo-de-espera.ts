import { falaDoTexto, textoSoDeFerramenta } from '@hq-crion/contracts/atendimento';

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

function segundosDoTurno(turno: any): number | undefined {
  if (typeof turno === 'number' && Number.isFinite(turno)) {
    return Math.max(0, Math.floor(turno));
  }
  if (!turno || typeof turno !== 'object') {
    return undefined;
  }
  if (typeof turno.time_in_call_secs === 'number' && Number.isFinite(turno.time_in_call_secs)) {
    return Math.max(0, Math.floor(turno.time_in_call_secs));
  }
  if (typeof turno.segundos === 'number' && Number.isFinite(turno.segundos)) {
    return Math.max(0, Math.floor(turno.segundos));
  }
  if (typeof turno.tempo === 'number' && Number.isFinite(turno.tempo)) {
    return Math.max(0, Math.floor(turno.tempo));
  }
  if (typeof turno.quando === 'number' && Number.isFinite(turno.quando)) {
    return Math.max(0, Math.floor(turno.quando));
  }
  if (typeof turno.quando === 'string') {
    const limpo = turno.quando.trim();
    if (limpo.includes(':') && !limpo.includes('T') && !limpo.includes('-')) {
      return segundosDeQuando(limpo);
    }
    const d = new Date(limpo);
    if (!Number.isNaN(d.getTime())) {
      return Math.floor(d.getTime() / 1000);
    }
    return segundosDeQuando(limpo);
  }
  return undefined;
}

function turnoSoDeFerramenta(turno: any) {
  if (turno && typeof turno === 'object' && Array.isArray(turno.detalhes) && turno.detalhes.length > 0) {
    const texto = typeof turno.texto === 'string' ? turno.texto : '';
    return falaDoTexto(texto).length === 0;
  }
  return typeof turno?.texto === 'string' && textoSoDeFerramenta(turno.texto);
}

function ehCliente(turno: any): boolean {
  if (!turno || typeof turno !== 'object') return false;
  const loc = String(turno.locutor ?? turno.role ?? turno.speaker ?? '').toLowerCase().trim();
  return loc === 'cliente' || loc === 'user' || loc === 'customer' || loc.includes('cliente') || loc.includes('user');
}

function ehAgente(turno: any): boolean {
  if (!turno || typeof turno !== 'object') return false;
  const loc = String(turno.locutor ?? turno.role ?? turno.speaker ?? '').toLowerCase().trim();
  return loc === 'agente de voz' || loc === 'agent' || loc === 'bot' || loc === 'assistant' || loc.includes('agente') || loc.includes('agent');
}

export function tempoDeEsperaDaTranscricao(
  turnos: readonly any[]
) {
  if (!Array.isArray(turnos) || turnos.length === 0) {
    return undefined;
  }

  const falas = turnos.filter((turno) => !turnoSoDeFerramenta(turno));

  const falasDoAgente = falas
    .filter(ehAgente)
    .map(segundosDoTurno)
    .filter((s): s is number => s !== undefined);

  const primeiraDoCliente = falas
    .filter(ehCliente)
    .map(segundosDoTurno)
    .find((s): s is number => s !== undefined);

  if (primeiraDoCliente === undefined || falasDoAgente.length < 2) {
    return undefined;
  }

  const segundaFala =
    falasDoAgente.slice(1).find((s) => s >= primeiraDoCliente) ?? falasDoAgente[1];

  if (
    segundaFala === undefined ||
    segundaFala < primeiraDoCliente
  ) {
    return undefined;
  }

  return segundaFala - primeiraDoCliente;
}
