import type {
  CategoriaCausaCancelamento,
  DiagnosticoCancelamento
} from '@hq-crion/contracts/cancelamento';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';

interface ConcorrenteDef {
  nome: string;
  padrao: RegExp;
}

const CONCORRENTES: ConcorrenteDef[] = [
  { nome: 'Hapvida', padrao: /\b(hapvida|hap\s*vida)\b/i },
  { nome: 'Unimed', padrao: /\b(unimed)\b/i },
  { nome: 'Amil', padrao: /\b(amil)\b/i },
  { nome: 'Bradesco Saúde', padrao: /\b(bradesco(?:\s*sa[uú]de)?)\b/i },
  { nome: 'SulAmérica', padrao: /\b(sul\s*am[eé]rica)\b/i },
  { nome: 'NotreDame', padrao: /\b(notredame|notre\s*dame|gndi)\b/i },
  { nome: 'Assim Saúde', padrao: /\b(assim(?:\s*sa[uú]de)?)\b/i },
  { nome: 'MedSênior', padrao: /\b(med\s*s[eê]nior|meds[eê]nior)\b/i },
  { nome: 'Prevent Senior', padrao: /\b(prevent\s*senior)\b/i },
  { nome: 'São Francisco', padrao: /\b(s[aã]o\s*francisco)\b/i },
  { nome: 'Porto Seguro Saúde', padrao: /\b(porto\s*seguro(?:\s*sa[uú]de)?)\b/i },
  { nome: 'Golden Cross', padrao: /\b(golden\s*cross)\b/i },
  { nome: 'Qsaúde', padrao: /\b(q\s*sa[uú]de|qsa[uú]de)\b/i },
  { nome: 'Alice', padrao: /\b(?:plano|operadora)?\s*\balice\b/i }
];

const PADRAO_CANCELAMENTO =
  /\b(cancelar|cancelamento|cancelei|cancelando|desistir|desistindo|desisto|desist[eê]ncia|encerrar(?:\s*o)?\s*plano|encerrar(?:\s*o)?\s*contrato|rescindir|rescis[aã]o|portabilidade|mudar(?:\s*de)?\s*plano|trocar(?:\s*de)?\s*plano|sa[ií]da|sair(?:\s*do)?\s*plano|deixar(?:\s*o)?\s*plano|fui\s*pra|fui\s*para|migrei\s*pra|migrei\s*para|migrando|vou\s*para|vou\s*pra)\b/i;

const PADRAO_VENDA_MAL_FEITA_DIRETO =
  /\b(venda\s*mal\s*feita|propaganda\s*enganosa|engana(?:do|da|ram)|menti(?:u|ram)|mentira|omiti(?:u|ram)|iludid[oa]|promessa\s*do\s*(?:corretor|vendedor)|car[eê]ncia\s*zero|sem\s*car[eê]ncia|n[aã]o\s*tinha\s*car[eê]ncia|hospital\s*n[aã]o\s*atende|n[aã]o\s*cobre|n[aã]o\s*atende|rede\s*divergente|n[aã]o\s*foi\s*(?:o\s*que\s*)?contratado|n[aã]o\s*avisou|n[aã]o\s*informou)\b/i;

const PADRAO_AGENTE_COMERCIAL =
  /\b(corretor[a]?|vendedor[a]?|venda|comercial|na\s*contrata[cç][aã]o|quando\s*contratei|quando\s*comprei|ao\s*contratar|na\s*ades[aã]o)\b/i;

const PADRAO_PROMESSA_OU_DIVERGENCIA =
  /\b(prometeu|garantiu|disse\s*que|falou\s*que|afirmou\s*que|assegurou|enganad[oa]|promessa|diverg[eê]ncia|diferente|cobran[cç]a\s*indevida|car[eê]ncia|hospital|rede|reajuste|taxa)\b/i;

function encontrarConcorrente(texto: string): string | null {
  for (const item of CONCORRENTES) {
    if (item.padrao.test(texto)) {
      return item.nome;
    }
  }
  return null;
}

function identificarVendaMalFeita(texto: string): boolean {
  if (PADRAO_VENDA_MAL_FEITA_DIRETO.test(texto)) {
    return true;
  }
  if (
    PADRAO_AGENTE_COMERCIAL.test(texto) &&
    PADRAO_PROMESSA_OU_DIVERGENCIA.test(texto)
  ) {
    return true;
  }
  return false;
}

function classificarCategoriaCausa(
  motivo: string,
  texto: string,
  vendaMalFeita: boolean,
  concorrente: string | null
): CategoriaCausaCancelamento {
  const combinado = `${motivo} ${texto}`.toLowerCase();

  if (
    combinado.includes('hospital') ||
    combinado.includes('médico') ||
    combinado.includes('medico') ||
    combinado.includes('clínica') ||
    combinado.includes('clinica') ||
    combinado.includes('rede credenciada') ||
    combinado.includes('cobertura') ||
    combinado.includes('descredenciamento')
  ) {
    return 'Rede credenciada / Cobertura';
  }

  if (
    combinado.includes('boleto') ||
    combinado.includes('fatura') ||
    combinado.includes('cobrança') ||
    combinado.includes('cobranca') ||
    combinado.includes('pagamento') ||
    combinado.includes('segunda via') ||
    combinado.includes('financeiro')
  ) {
    return 'Problema financeiro / Boleto';
  }

  if (
    combinado.includes('reajuste') ||
    combinado.includes('aumento') ||
    combinado.includes('mensalidade') ||
    combinado.includes('preço') ||
    combinado.includes('preco') ||
    combinado.includes('caro')
  ) {
    return 'Preço / Reajuste';
  }

  if (vendaMalFeita) {
    return 'Venda mal feita / Divergência comercial';
  }

  if (concorrente) {
    return 'Migração para concorrente';
  }

  if (
    combinado.includes('grosseria') ||
    combinado.includes('mau atendimento') ||
    combinado.includes('mal atendido') ||
    combinado.includes('demora') ||
    combinado.includes('insatisfa')
  ) {
    return 'Insatisfação com atendimento';
  }

  return 'Outros';
}

function extrairMelhorTrecho(
  transcricao: Array<{ locutor: string; texto: string }>,
  resumo?: string | null
): string | null {
  const eTrechoRelevante = (texto: string) =>
    PADRAO_CANCELAMENTO.test(texto) ||
    CONCORRENTES.some((c) => c.padrao.test(texto)) ||
    PADRAO_VENDA_MAL_FEITA_DIRETO.test(texto) ||
    identificarVendaMalFeita(texto);

  for (const turno of transcricao) {
    if (turno.locutor.toLowerCase().includes('cliente') && eTrechoRelevante(turno.texto)) {
      return turno.texto;
    }
  }

  for (const turno of transcricao) {
    if (eTrechoRelevante(turno.texto)) {
      return turno.texto;
    }
  }

  if (resumo && eTrechoRelevante(resumo)) {
    return resumo;
  }

  return transcricao[1]?.texto ?? transcricao[0]?.texto ?? null;
}

export function extrairDiagnosticoDeCancelamento(
  atendimento: Pick<
    RegistroDeAtendimento,
    'motivo' | 'transcricao' | 'avaliacaoDaIa'
  >
): DiagnosticoCancelamento {
  // Se já houver diagnóstico salvo com houveIntencaoCancelamento definido, respeitamos a gravação
  const diagSalvo = atendimento.avaliacaoDaIa?.diagnosticoCancelamento;
  if (
    diagSalvo &&
    typeof diagSalvo.houveIntencaoCancelamento === 'boolean'
  ) {
    return {
      houveIntencaoCancelamento: diagSalvo.houveIntencaoCancelamento,
      categoriaCausa: diagSalvo.categoriaCausa ?? null,
      vendaMalFeita: Boolean(diagSalvo.vendaMalFeita),
      concorrenteCitado: diagSalvo.concorrenteCitado ?? null,
      diagnostico: diagSalvo.diagnostico ?? null,
      evidenciaTrecho: diagSalvo.evidenciaTrecho ?? null,
      origem: diagSalvo.origem ?? 'ia'
    };
  }

  const motivo = atendimento.motivo ?? '';
  const transcricao = atendimento.transcricao ?? [];
  const resumo = atendimento.avaliacaoDaIa?.resumo ?? '';
  const falhas = (atendimento.avaliacaoDaIa?.falhasIdentificadas ?? []).join(' ');

  const falas = transcricao.map((t) => t.texto).join(' ');
  const textoCompleto = `${motivo} ${resumo} ${falhas} ${falas}`;

  const concorrente = encontrarConcorrente(textoCompleto);
  const temIntencaoTexto = PADRAO_CANCELAMENTO.test(textoCompleto);
  const motivoCancelamento = PADRAO_CANCELAMENTO.test(motivo);
  const vendaMalFeita = identificarVendaMalFeita(textoCompleto);

  const houveIntencaoCancelamento = Boolean(
    motivoCancelamento ||
      temIntencaoTexto ||
      (concorrente && (vendaMalFeita || textoCompleto.includes('migr') || textoCompleto.includes('fui')))
  );

  if (!houveIntencaoCancelamento) {
    return {
      houveIntencaoCancelamento: false,
      categoriaCausa: null,
      vendaMalFeita: false,
      concorrenteCitado: null,
      diagnostico: null,
      evidenciaTrecho: null,
      origem: 'heuristica'
    };
  }

  const categoriaCausa = classificarCategoriaCausa(
    motivo,
    textoCompleto,
    vendaMalFeita,
    concorrente
  );

  const trecho = extrairMelhorTrecho(transcricao, resumo);

  let diagnostico = '';
  if (concorrente && vendaMalFeita) {
    diagnostico = `Cliente manifestou cancelamento e migração para a ${concorrente} motivado por venda mal feita e promessas divergentes na contratação.`;
  } else if (concorrente) {
    diagnostico = `Cliente declarou cancelamento ou migração para a operadora concorrente ${concorrente}.`;
  } else if (vendaMalFeita) {
    diagnostico = `Cliente manifestou insatisfação com intenção de cancelamento devido a promessa comercial não cumprida (venda mal feita).`;
  } else {
    diagnostico = `Cliente manifestou intenção de cancelamento por motivo de ${categoriaCausa.toLowerCase()}.`;
  }

  return {
    houveIntencaoCancelamento: true,
    categoriaCausa,
    vendaMalFeita,
    concorrenteCitado: concorrente,
    diagnostico,
    evidenciaTrecho: trecho,
    origem: 'heuristica'
  };
}
