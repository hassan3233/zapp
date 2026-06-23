# Container image for the Zapp backend (works on Cloud Run, Fly, Railway, etc.)
# Node 24 is required for the built-in `node:sqlite` module.
FROM node:24-slim

WORKDIR /app

# Install production deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
# Cloud Run injects PORT (usually 8080); src/config.js reads process.env.PORT.
EXPOSE 8080
CMD ["node", "src/index.js"]
