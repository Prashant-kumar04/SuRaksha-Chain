FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV ENABLE_TC1_DATASET=true
EXPOSE 10000
CMD ["npm", "start"]