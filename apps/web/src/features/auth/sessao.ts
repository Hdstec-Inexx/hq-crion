const SESSAO_KEY = 'hq-crion-sessao';

export function lerSessao() {
  return sessionStorage.getItem(SESSAO_KEY);
}

export function gravarSessao(sessao: string) {
  sessionStorage.setItem(SESSAO_KEY, sessao);
}

export function limparSessao() {
  sessionStorage.removeItem(SESSAO_KEY);
}
