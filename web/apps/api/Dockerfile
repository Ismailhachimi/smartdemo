# SmartDemo API (NestJS). Build from the web/ folder:
#   docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
RUN npm install -g pnpm@11.6.0
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/emails/package.json packages/emails/
RUN pnpm install --frozen-lockfile --filter "@smartdemo/api..."
COPY packages/db packages/db
COPY packages/emails packages/emails
COPY apps/api apps/api
RUN pnpm --filter "@smartdemo/api..." run build
# Keep production dependencies only.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --filter "@smartdemo/api..."

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
