# HQ Crion

Sistema de qualidade das Claras (Affix, Alter e Conectaplan). Família HQ do GEAP; um único HQ, domínio próprio.

## Desenvolvimento

```bash
corepack pnpm install
corepack pnpm dev
```

Sobe a API (`http://127.0.0.1:3000`) e o app web (`http://localhost:5173`) juntos. `GET /health` na API e a página pública `/health` confirmam que o serviço está no ar, fora da Casca autenticada.

O protótipo throwaway da face travada (Variant A) continua em:

```bash
corepack pnpm prototype
```

## Testes

```bash
corepack pnpm test
corepack pnpm typecheck
```
