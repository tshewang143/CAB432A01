# worker.Dockerfile
FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y curl ca-certificates ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Install Node 22 (official binaries)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get update && apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Worker listens to nothing; no EXPOSE needed

CMD ["node", "worker/worker.js"]
