FROM node:20-slim

# Instal·lar dependències del sistema
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instal·lar arduino-cli (descàrrega directa del binari)
RUN curl -fsSL https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz -o /tmp/arduino-cli.tar.gz && \
    tar -xzf /tmp/arduino-cli.tar.gz -C /usr/local/bin && \
    rm /tmp/arduino-cli.tar.gz && \
    arduino-cli version

# Instal·lar el core Arduino AVR i biblioteques
RUN arduino-cli core update-index && \
    arduino-cli core install arduino:avr && \
    arduino-cli lib install "ArduinoThread"

# Crear directori de treball
WORKDIR /app

# Fer bundle del frontend (CodeMirror + avr8js)
COPY frontend/package.json frontend/deps.js frontend/build.js ./frontend-build/
RUN cd frontend-build && npm install && node build.js

# Instal·lar backend
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --production

COPY backend/ ./backend/
COPY frontend/index.html ./frontend/index.html

# Copiar el bundle generat al frontend
RUN cp frontend-build/deps.bundle.js frontend/deps.bundle.js && \
    rm -rf frontend-build

EXPOSE 3000

CMD ["node", "backend/server.js"]
