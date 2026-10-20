import type {
  CategoriaCausaCancelamento,
  DiagnosticoCancelamento
} from '@hq-crion/contracts/cancelamento';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';

interface ConcorrenteDef {
  nome: string;
  padrao: RegExp;
}

export const CONCORRENTES: ConcorrenteDef[] = [
  { nome: 'Hapvida', padrao: /\b(hapvida|hap\s*vida)\b/i },
  { nome: 'Unimed', padrao: /\b(unimed)\b/i },
  { nome: 'Amil', padrao: /\b(amil)\b/i },
  {
    nome: 'Bradesco Saúde',
    padrao: /\b(bradesco\s*sa[uú]de|plano\s*bradesco|seguro\s*bradesco)\b/i
  },
  { nome: 'SulAmérica', padrao: /\b(sul\s*am[eé]rica)\b/i },
  { nome: 'NotreDame', padrao: /\b(notredame|notre\s*dame|gndi)\b/i },
  { nome: 'Assim Saúde', padrao: /\b(assim\s+sa[uú]de)\b/i },
  { nome: 'MedSênior', padrao: /\b(med\s*s[eê]nior|meds[eê]nior)\b/i },
  { nome: 'Prevent Senior', padrao: /\b(prevent\s*senior)\b/i },
  {
    nome: 'São Francisco',
    padrao: /\b(s[aã]o\s*francisco\s*sa[uú]de|s[aã]o\s*francisco\s*odonto|plano\s*s[aã]o\s*francisco|operadora\s*s[aã]o\s*francisco)\b/i
  },
  {
    nome: 'Porto Seguro Saúde',
    padrao: /\b(porto\s*seguro\s*sa[uú]de|plano\s*porto\s*seguro)\b/i
  },
  { nome: 'Golden Cross', padrao: /\b(golden\s*cross)\b/i },
  { nome: 'Qsaúde', padrao: /\b(q\s*sa[uú]de|qsa[uú]de)\b/i },
  {
    nome: 'Alice',
    padrao: /\b(plano\s*alice|operadora\s*alice)\b/i
  }
];

const PADRAO_CANCELAMENTO =
  /\b(cancelar|cancelamento|cancelei|cancelando|desistir|desistindo|desisto|desist[eê]ncia|encerrar(?:\s*o)?\s*plano|encerrar(?:\s*o)?\s*contrato|rescindir|rescis[aã]o|portabilidade|mudar(?:\s*de)?\s*plano|trocar(?:\s*de)?\s*plano|sa[ií]da|sair(?:\s*do)?\s*plano|deixar(?:\s*o)?\s*plano|fui\s*pra|fui\s*para|migrei\s*pra|migrei\s*para|migrando|vou\s*para|vou\s*pra)\b/i;

const PADRAO_MIGRACAO_DESTINO =
  /\b(migr(?:ar|ei|ando|ado|ou|amos)|fui\s*(?:pra|para)|vou\s*(?:pra|para)|mudar\s*(?:pra|para)|mudei\s*(?:pra|para)|trocar\s*(?:pra|para|pela|pelo)|troquei\s*(?:pra|para|pela|pelo)|fechei\s*(?:com|na|no)|contratei\s*(?:a|o|na|no)?|fiz\s*plano\s*(?:na|no|com)|aderi\s*(?:[aà]|ao)|outro\s*plano\s*(?:na|no))\b/i;

const PADRAO_CANAL_OU_PLANO_ATUAL =
  /\b(seria\s*(?:com\s*voc[eê]s\s*ou\s*direto\s*com|com\s*a\s*operadora)|solicitar\s*o\s*cancelamento\s*com\s*voc[eê]s\s*ou|cancelar\s*(?:o\s*meu\s*plano\s*(?:da|de|do)|meu\s*plano|a|o)?\s*(?:unimed|assim|amil|hapvida|sul\s*am[eé]rica|notredame|bradesco)|sou\s*benefici[aá]ri[oa]|meu\s*plano\s*[eé])\b/i;

const PADRAO_VENDA_MAL_FEITA_DIRETO =
  /\b(venda\s*mal\s*feita|propaganda\s*enganosa|engana(?:do|da|ram)|menti(?:u|ram)|mentira|omiti(?:u|ram)|iludid[oa]|promessa\s*do\s*(?:corretor|vendedor)|car[eê]ncia\s*zero|sem\s*car[eê]ncia|n[aã]o\s*tinha\s*car[eê]ncia|hospital\s*n[aã]o\s*atende|n[aã]o\s*cobre|n[aã]o\s*atende|rede\s*divergente|n[aã]o\s*foi\s*(?:o\s*que\s*)?contratado|n[aã]o\s*avisou|n[aã]o\s*informou)\b/i;

const PADRAO_AGENTE_COMERCIAL =
  /\b(corretor[a]?|vendedor[a]?|venda|comercial|na\s*contrata[cç][aã]o|quando\s*contratei|quando\s*comprei|ao\s*contratar|na\s*ades[aã]o)\b/i;

const PADRAO_PROMESSA_OU_DIVERGENCIA =
  /\b(prometeu|garantiu|disse\s*que|falou\s*que|afirmou\s*que|assegurou|enganad[oa]|promessa|diverg[eê]ncia|diferente|cobran[cç]a\s*indevida|car[eê]ncia|hospital|rede|reajuste|taxa)\b/i;

export function identificarConcorrenteDeMigracao(
  transcricao: Array<{ locutor: string; texto: string }>,
  resumo?: string | null
): string | null {
  // Apenas falas do cliente devem ser analisadas para migração para concorrente
  const falasCliente = transcricao
    .filter((t) => {
      const loc = String(t.locutor ?? (t as any).role ?? (t as any).speaker ?? '').toLowerCase().trim();
      return loc.includes('cliente') || loc === 'user';
    })
    .map((t) => t.texto);

  // Procura por turno do cliente onde há menção ao concorrente
  for (const texto of falasCliente) {
    for (const item of CONCORRENTES) {
      if (item.padrao.test(texto)) {
        // Verifica se a menção é apenas dúvida de canal ou referência ao plano atual administrado
        if (PADRAO_CANAL_OU_PLANO_ATUAL.test(texto) && !PADRAO_MIGRACAO_DESTINO.test(texto)) {
          continue;
        }

        // Deve haver contexto explícito de migração/troca ou contratação de outro plano
        if (PADRAO_MIGRACAO_DESTINO.test(texto)) {
          return item.nome;
        }
      }
    }
  }

  // Caso não haja turnos de cliente com declaração de migração, o resumo da Avaliação
  // da IA Avaliadora só pode indicar concorrente se contiver padrão explícito de migração
  // para concorrente e não colidir com menção ao próprio plano atual.
  if (resumo && typeof resumo === 'string') {
    for (const item of CONCORRENTES) {
      if (item.padrao.test(resumo)) {
        if (PADRAO_CANAL_OU_PLANO_ATUAL.test(resumo) && !PADRAO_MIGRACAO_DESTINO.test(resumo)) {
          continue;
        }
        if (PADRAO_MIGRACAO_DESTINO.test(resumo)) {
          return item.nome;
        }
      }
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

export function sanearDiagnosticoContraFalsosPositivos(
  atendimento: Pick<
    RegistroDeAtendimento,
    'motivo' | 'transcricao' | 'avaliacaoDaIa'
  >,
  diag: DiagnosticoCancelamento
): DiagnosticoCancelamento {
  const transcricao = atendimento.transcricao ?? [];
  const resumo = atendimento.avaliacaoDaIa?.resumo ?? '';
  const falasCliente = transcricao
    .filter((t) => {
      const loc = String(t.locutor ?? (t as any).role ?? (t as any).speaker ?? '').toLowerCase().trim();
      return loc.includes('cliente') || loc === 'user';
    })
    .map((t) => t.texto)
    .join(' ');

  const textoSuporte = falasCliente.trim()
    ? falasCliente
    : `${diag.evidenciaTrecho ?? ''} ${resumo}`.trim();

  let concorrenteValido = diag.concorrenteCitado ?? null;
  let categoriaCausa = diag.categoriaCausa ?? null;
  let diagnostico = diag.diagnostico ?? null;

  if (concorrenteValido) {
    const def = CONCORRENTES.find(
      (c) => c.nome.toLowerCase() === concorrenteValido?.toLowerCase()
    );

    // Validação estrita: a fala do cliente precisa comprovar a menção à operadora e o contexto de migração
    const mencionaOperadora = def
      ? def.padrao.test(textoSuporte)
      : textoSuporte.toLowerCase().includes(concorrenteValido.toLowerCase());
    const temMigracao = PADRAO_MIGRACAO_DESTINO.test(textoSuporte);
    const eDuvidaCanal = PADRAO_CANAL_OU_PLANO_ATUAL.test(textoSuporte);

    if (!mencionaOperadora || !temMigracao || (eDuvidaCanal && !temMigracao)) {
      concorrenteValido = null;
    }

    if (!concorrenteValido) {
      if (categoriaCausa === 'Migração para concorrente') {
        const motivo = atendimento.motivo ?? '';
        const falhas = (atendimento.avaliacaoDaIa?.falhasIdentificadas ?? []).join(' ');
        const textoCompleto = `${motivo} ${resumo} ${falhas} ${transcricao.map((t) => t.texto).join(' ')}`;
        categoriaCausa = classificarCategoriaCausa(
          motivo,
          textoCompleto,
          Boolean(diag.vendaMalFeita),
          null
        );
      }

      // Ajusta síntese textual do diagnóstico para remover menção indevida ao concorrente saneado
      if (
        !diagnostico ||
        diagnostico.toLowerCase().includes('concorrente') ||
        (def && def.padrao.test(diagnostico))
      ) {
        if (diag.vendaMalFeita) {
          diagnostico =
            'Cliente manifestou insatisfação com intenção de cancelamento devido a promessa comercial não cumprida (venda mal feita).';
        } else {
          diagnostico = `Cliente manifestou intenção de cancelamento por motivo de ${
            categoriaCausa ? categoriaCausa.toLowerCase() : 'outros'
          }.`;
        }
      }
    }
  }

  return {
    houveIntencaoCancelamento: diag.houveIntencaoCancelamento,
    categoriaCausa,
    vendaMalFeita: Boolean(diag.vendaMalFeita),
    concorrenteCitado: concorrenteValido,
    diagnostico,
    evidenciaTrecho: diag.evidenciaTrecho ?? null,
    origem: diag.origem ?? 'ia'
  };
}

export function extrairDiagnosticoDeCancelamento(
  atendimento: Pick<
    RegistroDeAtendimento,
    'motivo' | 'transcricao' | 'avaliacaoDaIa'
  >
): DiagnosticoCancelamento {
  // Se já houver diagnóstico salvo com houveIntencaoCancelamento definido, validamos contra falsos positivos óbvios
  const diagSalvo = atendimento.avaliacaoDaIa?.diagnosticoCancelamento;
  if (
    diagSalvo &&
    typeof diagSalvo.houveIntencaoCancelamento === 'boolean'
  ) {
    return sanearDiagnosticoContraFalsosPositivos(atendimento, diagSalvo);
  }

  const motivo = atendimento.motivo ?? '';
  const transcricao = atendimento.transcricao ?? [];
  const resumo = atendimento.avaliacaoDaIa?.resumo ?? '';
  const falhas = (atendimento.avaliacaoDaIa?.falhasIdentificadas ?? []).join(' ');

  const falas = transcricao.map((t) => t.texto).join(' ');
  const textoCompleto = `${motivo} ${resumo} ${falhas} ${falas}`;

  const concorrente = identificarConcorrenteDeMigracao(transcricao, resumo);
  const temIntencaoTexto = PADRAO_CANCELAMENTO.test(textoCompleto);
  const motivoCancelamento = PADRAO_CANCELAMENTO.test(motivo);
  const vendaMalFeita = identificarVendaMalFeita(textoCompleto);

  const houveIntencaoCancelamento = Boolean(
    motivoCancelamento ||
      temIntencaoTexto ||
      Boolean(concorrente)
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

export function resolverDiagnosticoParaAvaliacao(
  atendimento: Pick<
    RegistroDeAtendimento,
    'motivo' | 'transcricao' | 'avaliacaoDaIa'
  >
): DiagnosticoCancelamento | undefined {
  const diagSalvo = atendimento.avaliacaoDaIa?.diagnosticoCancelamento;
  if (diagSalvo && typeof diagSalvo.houveIntencaoCancelamento === 'boolean') {
    return diagSalvo;
  }

  const diag = extrairDiagnosticoDeCancelamento(atendimento);
  return diag.houveIntencaoCancelamento ? diag : undefined;
}
