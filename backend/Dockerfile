FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY src ./src

EXPOSE 4000
CMD ["node", "src/index.js"]
