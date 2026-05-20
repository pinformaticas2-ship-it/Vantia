FROM node:20-slim

# System packages needed for OCR and document conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    unzip \
    poppler-utils \
    libreoffice \
    tesseract-ocr \
    tesseract-ocr-spa \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and traineddata files
COPY src ./src
COPY tsconfig.json ./
COPY eng.traineddata ./
COPY spa.traineddata ./

# Compile TypeScript
RUN npm install typescript --no-save && npx tsc

EXPOSE 4000

CMD ["node", "dist/server.js"]
