export type TempoRelativoDaFala = {
  texto: string;
  titulo?: string;
};

function formatarMmSs(total: number) {
  const segundos = Math.max(0, Math.floor(total));
  const minutos = Math.floor(segundos / 60);
  const resto = String(segundos % 60).padStart(2, '0');

  return `${String(minutos).padStart(2, '0')}:${resto}`;
}

function instanteIso(valor: string) {
  const texto = valor.trim();

  if (!/[T-]/.test(texto)) {
    return undefined;
  }

  const marca = Date.parse(texto);

  return Number.isNaN(marca) ? undefined : marca;
}

function segundosDoRelogio(quando: string) {
  const partes = /^(\d+):([0-5]\d)$/.exec(quando.trim());

  if (!partes) {
    return undefined;
  }

  return Number(partes[1]) * 60 + Number(partes[2]);
}

export function inicioDaFalaEmSegundos(entrada: {
  quando: string;
  iniciadoEm?: string;
}) {
  const relogio = segundosDoRelogio(entrada.quando);

  if (relogio !== undefined) {
    return relogio;
  }

  const fala = instanteIso(entrada.quando);
  const inicio = entrada.iniciadoEm ? instanteIso(entrada.iniciadoEm) : undefined;

  if (fala === undefined || inicio === undefined) {
    return undefined;
  }

  return Math.max(0, Math.floor((fala - inicio) / 1000));
}

export function tempoRelativoDaFala(entrada: {
  quando: string;
  iniciadoEm?: string;
}): TempoRelativoDaFala {
  const segundos = inicioDaFalaEmSegundos(entrada);
  const iso = instanteIso(entrada.quando) !== undefined;

  if (segundos === undefined) {
    return iso ? { texto: entrada.quando, titulo: entrada.quando } : { texto: entrada.quando };
  }

  return {
    texto: formatarMmSs(segundos),
    ...(iso ? { titulo: entrada.quando } : {})
  };
}

export function indiceDoTurnoAtivo(inicios: readonly number[], instante: number) {
  if (!Number.isFinite(instante) || instante < 0) {
    return -1;
  }

  let ativo = -1;

  for (let indice = 0; indice < inicios.length; indice += 1) {
    const inicio = inicios[indice];

    if (inicio !== undefined && Number.isFinite(inicio) && inicio <= instante) {
      ativo = indice;
    }
  }

  return ativo;
}

export type OrigemDaRolagem = 'wheel' | 'touchmove' | 'scroll' | 'programa';

export function acompanhamentoAposRolagem(origem: OrigemDaRolagem, acompanhando: boolean) {
  if (origem === 'programa') {
    return acompanhando;
  }

  return false;
}

export function retomarAcompanhamento() {
  return true;
}

export function falaForaDeVista(caixa: {
  rolagem: number;
  visivel: number;
  topo: number;
  altura: number;
}) {
  const base = caixa.topo + caixa.altura;
  const vistaBase = caixa.rolagem + caixa.visivel;

  return base <= caixa.rolagem || caixa.topo >= vistaBase;
}

export function exibirVoltarAoMomentoAtual(entrada: {
  acompanhando: boolean;
  foraDeVista: boolean;
  haFalaAtiva: boolean;
}) {
  return !entrada.acompanhando && entrada.foraDeVista && entrada.haFalaAtiva;
}

export function deveRolarAteAFalaAtiva(entrada: {
  tocando: boolean;
  acompanhando: boolean;
  haFalaAtiva: boolean;
}) {
  return entrada.tocando && entrada.acompanhando && entrada.haFalaAtiva;
}

export function teclaSaltaParaAFala(tecla: string) {
  return tecla === 'Enter' || tecla === ' ';
}
