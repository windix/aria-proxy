# Stage 1: Build
FROM node:22.14.0-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-fund --no-audit

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production
FROM node:22.14.0-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-fund --no-audit

COPY --from=builder /app/dist ./dist

RUN mkdir -p data

EXPOSE 6800

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
