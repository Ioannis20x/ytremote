FROM node:22-alpine AS web-build

WORKDIR /build
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm install --omit=dev

COPY server/src ./src
COPY --from=web-build /build/dist ./public

EXPOSE 3456

CMD ["node", "src/index.js"]
