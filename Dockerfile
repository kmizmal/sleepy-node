FROM node:20-alpine
ENV PORT=7860
EXPOSE 7860
WORKDIR /app

RUN npm install -g pnpm

# COPY . .
RUN git clone https://github.com/kmizmal/sleepy-node
WORKDIR  /app/sleepy-node

RUN mkdir -p /app/sleepy-node/logs && chown -R node:node /app
USER node

RUN pnpm install
CMD ["pnpm", "dev"]
