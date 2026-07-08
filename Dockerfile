FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/src ./src

EXPOSE 3456

CMD ["node", "src/index.js"]
