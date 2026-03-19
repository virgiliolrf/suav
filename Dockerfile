FROM node:20-slim

# Prisma needs openssl
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client + build TypeScript
RUN npx prisma generate && npm run build

# Data volume (SQLite + WhatsApp auth)
ENV DATA_DIR=/data
VOLUME /data

EXPOSE 3000

CMD ["node", "dist/src/scripts/start.js"]
