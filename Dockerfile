# Stage 1: Build
ARG NODE_VERSION=22.14.0
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-fund --no-audit

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
ARG NODE_VERSION=22.14.0
FROM node:${NODE_VERSION}-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit

COPY --from=builder /app/dist ./dist
COPY public/ ./public/

RUN apk add --no-cache tini

RUN mkdir -p data

EXPOSE 6800

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
