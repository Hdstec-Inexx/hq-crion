FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

RUN pnpm --filter @hq-crion/contracts build \
  && pnpm --filter @hq-crion/api build \
  && pnpm --filter @hq-crion/api deploy --prod /out

FROM node:22-bookworm-slim

WORKDIR /app
RUN groupadd --gid 10001 hq \
  && useradd --uid 10001 --gid hq --create-home --home-dir /home/hq hq

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=10001:10001 /out /app
COPY --chown=10001:10001 apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 755 /app/docker-entrypoint.sh

USER 10001:10001
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
