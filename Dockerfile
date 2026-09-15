# Fuse Drivers party server (ADR 008, M4): one Node process serves the built client and the /ws party socket.
# docker build -t fuse-drivers . && docker run -p 8790:8790 fuse-drivers
# Put it behind an HTTPS reverse proxy online; phones then use wss:// automatically.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8790
COPY package.json package-lock.json ./
# tsx runs the TypeScript server directly, so it stays with the runtime dependencies.
RUN npm ci --omit=dev && npm install --no-save tsx@4.23.13
COPY --from=build /app/dist ./dist
COPY src ./src
COPY tracks ./tracks
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${PORT}/healthz || exit 1
CMD ["npx", "tsx", "src/server/main.ts"]
