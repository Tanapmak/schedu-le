# Build web + api, then run only the compiled api (which also serves web/dist).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev -w api --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/web/dist web/dist
COPY db db
USER node
EXPOSE 8080
CMD ["node", "api/dist/index.js"]
