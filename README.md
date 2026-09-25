# HQ Crion

Sistema de qualidade das Claras (Affix, Alter e Conectaplan). Família HQ do GEAP; um único HQ, domínio próprio.

## Desenvolvimento

```bash
corepack pnpm install
corepack pnpm dev
```

Sobe a API (`http://127.0.0.1:3000`) e o app web (`http://localhost:5173`) juntos. `GET /health` na API e a página pública `/health` confirmam que o serviço está no ar, fora da Casca autenticada. Login em `/login` (fora da casca). Perfis de desenvolvimento: `ana.souza@crion` (Gestão), `carla.mendes@crion` (Curador), `bruno.alves@crion` (Admin); senha `crion-hq`.

O protótipo throwaway da face travada (Variant A) continua em:

```bash
corepack pnpm prototype
```

## EasyPanel

Compose de referência em `deploy/easypanel/compose.yaml`: serviços `api` e `web`, Postgres **externo** via `DATABASE_URL` (banco Crion, nunca o do HQ GEAP), só `expose`. Variáveis em `.env.example` (`DATABASE_URL`, `CORS_ORIGIN`, `VITE_API_URL`, `SESSION_SECRET`, `SKIP_SEED`, ElevenLabs e armazenamento).

Com `DATABASE_URL`, a migration e a semente estrutural terminam antes do listen. Perfil, Agente de Voz, Régua e a configuração da IA Avaliadora são semeados sempre; `SKIP_SEED=true` pula só os Atendimentos de demonstração. A sessão vale só enquanto o processo está no ar. Listagens e Dashboard seguem o catálogo atual. A ingestão mínima ElevenLabs, se houver chave, não segura o listen.

Healthcheck da API: `GET /health` sem sessão. A web só sobe com a API saudável e expõe `/healthz`.

## Testes

```bash
corepack pnpm test
corepack pnpm typecheck
```
