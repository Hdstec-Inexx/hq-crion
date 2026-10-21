export function formatarCpf(cpf: string): string {
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
  }
  return cpf.trim();
}

export function normalizarCpf(valor: string | undefined | null): string {
  if (!valor || typeof valor !== 'string') {
    return '';
  }
  return valor.replace(/[.\-\s]/g, '').toLowerCase().trim();
}

function ehChaveDeCpf(chave: string): boolean {
  const normalizada = chave.toLowerCase().replace(/[^a-z]/g, '');
  return normalizada === 'cpf' || normalizada === 'nrcpf';
}

function digitosVerificadoresValidos(digitos: string): boolean {
  if (digitos.length !== 11) {
    return false;
  }
  if (/^(\d)\1{10}$/.test(digitos)) {
    return false;
  }
  let soma1 = 0;
  for (let i = 0; i < 9; i++) {
    soma1 += Number(digitos[i]) * (10 - i);
  }
  const resto1 = soma1 % 11;
  const digito1 = resto1 < 2 ? 0 : 11 - resto1;
  if (Number(digitos[9]) !== digito1) {
    return false;
  }
  let soma2 = 0;
  for (let i = 0; i < 10; i++) {
    soma2 += Number(digitos[i]) * (11 - i);
  }
  const resto2 = soma2 % 11;
  const digito2 = resto2 < 2 ? 0 : 11 - resto2;
  return Number(digitos[10]) === digito2;
}

function extrairCpfDePropriedades(objeto: Record<string, unknown>): string | undefined {
  for (const [chave, valor] of Object.entries(objeto)) {
    if (ehChaveDeCpf(chave)) {
      if (typeof valor === 'string' || typeof valor === 'number') {
        const textoValor = String(valor).trim();
        if (textoValor.length > 0) {
          return formatarCpf(textoValor);
        }
      }
    }
  }

  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      const encontrado = extrairCpfDePropriedades(valor as Record<string, unknown>);
      if (encontrado) {
        return encontrado;
      }
    }
  }

  return undefined;
}

function extrairCpfDePayload(payload: unknown, permitirTextoLivre = true): string | undefined {
  if (payload === null || payload === undefined) {
    return undefined;
  }

  if (typeof payload === 'object') {
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const encontrado = extrairCpfDePayload(item, permitirTextoLivre);
        if (encontrado) {
          return encontrado;
        }
      }
      return undefined;
    }
    return extrairCpfDePropriedades(payload as Record<string, unknown>);
  }

  if (typeof payload === 'string') {
    const textoLimpo = payload.trim();
    if (!textoLimpo) {
      return undefined;
    }

    if (textoLimpo.startsWith('{') || textoLimpo.startsWith('[')) {
      try {
        const json = JSON.parse(textoLimpo) as unknown;
        return extrairCpfDePayload(json, permitirTextoLivre);
      } catch {
        // Se falhar o parse de JSON, segue para validação de texto se permitida
      }
    }

    if (permitirTextoLivre) {
      return extrairCpfDoTexto(textoLimpo);
    }
  }

  return undefined;
}

function ehFerramentaDeCpf(nome: unknown): boolean {
  if (typeof nome !== 'string') {
    return false;
  }
  const nomeMinusculo = nome.toLowerCase();
  return (
    nomeMinusculo.includes('consultar_cpf') ||
    nomeMinusculo.includes('consultarcpf') ||
    nomeMinusculo.includes('cpf')
  );
}

function extrairCpfDoTexto(texto: string): string | undefined {
  if (!texto || typeof texto !== 'string') {
    return undefined;
  }

  // 1. CPF com pontuação no padrão oficial: 000.000.000-00
  const matchPontuado = texto.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
  if (matchPontuado) {
    return formatarCpf(matchPontuado[0]);
  }

  // 2. CPF explicitamente rotulado (ex.: "CPF: 12345678901")
  const matchRotulado = texto.match(/\bcpf[^\d]{0,10}(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})\b/i);
  if (matchRotulado && matchRotulado[1]) {
    return formatarCpf(matchRotulado[1]);
  }

  // 3. Sequência de 11 dígitos com separadores de espaço (ex.: 123 456 789 01)
  const matchEspacos = texto.match(/\b\d{3}\s\d{3}\s\d{3}\s\d{2}\b/);
  if (matchEspacos) {
    const digitos = matchEspacos[0].replace(/\s/g, '');
    if (digitosVerificadoresValidos(digitos)) {
      return formatarCpf(matchEspacos[0]);
    }
  }

  // 4. Sequência isolada de 11 dígitos no texto livre: exige dígitos verificadores válidos
  // para não confundir com números de celular (DDD + 9 dígitos), timestamps ou protocolos.
  const regex11 = /\b\d{11}\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex11.exec(texto)) !== null) {
    const sequencia = match[0];
    if (digitosVerificadoresValidos(sequencia)) {
      return formatarCpf(sequencia);
    }
  }

  return undefined;
}

type ChamadaDeFerramentaUnificada = {
  nome: string;
  parametros?: unknown;
  resposta?: unknown;
};

function extrairChamadasDeFerramenta(atendimento: {
  transcricao?: unknown;
  ferramentas?: unknown;
}): ChamadaDeFerramentaUnificada[] {
  const chamadas: ChamadaDeFerramentaUnificada[] = [];

  if (Array.isArray(atendimento.transcricao)) {
    for (const turno of atendimento.transcricao as Array<{
      detalhes?: Array<Record<string, unknown>>;
    }>) {
      if (Array.isArray(turno.detalhes)) {
        for (const detalhe of turno.detalhes) {
          const nome = String(detalhe.nomeDaFerramenta ?? detalhe.nome ?? '');
          chamadas.push({
            nome,
            parametros: detalhe.parametros,
            resposta: detalhe.resposta
          });
        }
      }
    }
  }

  let listaFerramentas: Array<Record<string, unknown>> = [];
  if (Array.isArray(atendimento.ferramentas)) {
    listaFerramentas = atendimento.ferramentas as Array<Record<string, unknown>>;
  } else if (typeof atendimento.ferramentas === 'string') {
    try {
      const parsed = JSON.parse(atendimento.ferramentas) as unknown;
      if (Array.isArray(parsed)) {
        listaFerramentas = parsed as Array<Record<string, unknown>>;
      }
    } catch {
      // ignora
    }
  }

  for (const item of listaFerramentas) {
    const nome = String(item.tool_name ?? item.nomeDaFerramenta ?? item.nome ?? item.name ?? '');
    chamadas.push({
      nome,
      parametros: item.parameters ?? item.parametros ?? item.params ?? item.params_as_json,
      resposta: item.response ?? item.resposta ?? item.result
    });
  }

  return chamadas;
}

export function extrairCpf(atendimento: {
  transcricao?: unknown;
  ferramentas?: unknown;
  cpf?: string | null;
}): string | undefined {
  if (typeof atendimento.cpf === 'string' && atendimento.cpf.trim()) {
    return formatarCpf(atendimento.cpf);
  }

  const chamadas = extrairChamadasDeFerramenta(atendimento);

  // Prioridade 1: Chamadas de ferramenta específicas de CPF (como consultar_cpf)
  for (const chamada of chamadas) {
    if (ehFerramentaDeCpf(chamada.nome)) {
      const cpfParam = extrairCpfDePayload(chamada.parametros, true);
      if (cpfParam) {
        return cpfParam;
      }
      const cpfResp = extrairCpfDePayload(chamada.resposta, true);
      if (cpfResp) {
        return cpfResp;
      }
    }
  }

  // Prioridade 2: Outras chamadas de ferramenta que possuam campo explícito de CPF (não texto livre)
  for (const chamada of chamadas) {
    const cpfParam = extrairCpfDePayload(chamada.parametros, false);
    if (cpfParam) {
      return cpfParam;
    }
    const cpfResp = extrairCpfDePayload(chamada.resposta, false);
    if (cpfResp) {
      return cpfResp;
    }
  }

  // Prioridade 3: Padrão de CPF no texto da transcrição
  if (Array.isArray(atendimento.transcricao)) {
    for (const turno of atendimento.transcricao as Array<{ texto?: unknown }>) {
      if (typeof turno.texto === 'string') {
        const cpf = extrairCpfDoTexto(turno.texto);
        if (cpf) {
          return cpf;
        }
      }
    }
  }

  return undefined;
}
