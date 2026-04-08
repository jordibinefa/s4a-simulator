# S4A Simulator — Arduino Nano Simulator (ATmega328P)

> **[Llegeix-me en català](LLEGEIX-ME.md)**

A browser-based Arduino Nano simulator for professional and vocational training. Write, compile and run Arduino sketches directly in the browser — no physical board required.

Developed at an FP (Formació Professional / Vocational Training) centre in Catalonia as part of an open educational toolset.

## How it works

```
Browser (student)                     Server
─────────────────────                 ──────────────────────
CodeMirror 6 (editor)                 POST /compile
avr8js (CPU simulation)   ──────►     arduino-cli (arduino:avr)
LEDs / Switches (DOM)                 Returns .hex file
Serial Monitor (DOM)
```

The server **only compiles**. All simulation runs in the browser.

---

## Installation

Choose your setup:

- [Linux virtual machine (Debian / Ubuntu)](#option-a--linux-virtual-machine-debian--ubuntu)
- [Windows with WSL2](#option-b--windows-with-wsl2)
- [VPS with Traefik and HTTPS](#option-c--vps-with-traefik-and-https)

---

## Option A — Linux virtual machine (Debian / Ubuntu)

### Prerequisites

- Debian 13 / Ubuntu 22.04 or later
- Internet connection (first build downloads ~200 MB)

### 1. Install Docker Engine

```bash
# Prerequisites
sudo apt update
sudo apt install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository (replace "debian" with "ubuntu" if needed)
echo \
  "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli \
  containerd.io docker-buildx-plugin docker-compose-plugin

# Optional: run Docker without sudo
sudo usermod -aG docker $USER && newgrp docker
```

### 2. Get the project

```bash
git clone https://github.com/jordibinefa/s4a-simulator.git
cd s4a-simulator
```

### 3. Build and start

```bash
docker compose build
docker compose up -d
```

The first build takes a few minutes (downloads the `arduino:avr` core).

### 4. Verify

```bash
# Should return {"success":true,"hex":"..."}
curl -X POST http://localhost:4444/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}"}'
```

Open `http://localhost:4444` in your browser.

---

## Option B — Windows with WSL2

### Prerequisites

- Windows 10 (21H2 or later) or Windows 11
- WSL2 enabled with an Ubuntu distribution installed

### 1. Enable WSL2 (if not already done)

Open PowerShell **as administrator**:

```powershell
wsl --install
# Restart if prompted
```

If WSL is already installed but running version 1:

```powershell
wsl --set-default-version 2
```

### 2. Install Docker Desktop

Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).

During installation, make sure **"Use the WSL 2 based engine"** is checked.

Once installed, open Docker Desktop and go to **Settings → Resources → WSL Integration** and enable integration with your Ubuntu distribution.

### 3. Clone and start

Open the Ubuntu (WSL) terminal:

```bash
git clone https://github.com/jordibinefa/s4a-simulator.git
cd s4a-simulator
docker compose build
docker compose up -d
```

### 4. Verify

```bash
curl -X POST http://localhost:4444/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}"}'
```

Open `http://localhost:4444` in your Windows browser (Chrome, Edge...).

> **Note:** WSL2 automatically forwards ports to the Windows host. No extra configuration needed.

---

## Option C — VPS with Traefik and HTTPS

### Prerequisites

- VPS running Debian/Ubuntu with Docker installed
- Traefik running with the external network `proxy` and a `letsencrypt` certresolver
- A DNS record pointing to the VPS

### 1. Point your DNS

At your DNS provider, add an A record:

```
s4a.yourdomain.com  →  YOUR_VPS_IP
```

### 2. Configure the domain

```bash
git clone https://github.com/jordibinefa/s4a-simulator.git
cd s4a-simulator

# Replace the placeholder domain
sed -i 's/s4a.exemple.cat/s4a.yourdomain.com/g' docker-compose.vps.yml
```

### 3. Build and start

```bash
docker compose -f docker-compose.vps.yml build
docker compose -f docker-compose.vps.yml up -d
```

### 4. Verify

```bash
curl -X POST https://s4a.yourdomain.com/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}"}'
```

> **Note:** The HTTPS certificate may take a few minutes to issue on first run.

---

## Container management

```bash
# Stop
docker compose down

# Restart
docker compose restart

# Follow logs
docker compose logs -f

# Rebuild after code changes
docker compose build && docker compose up -d

# Server status (active compilations, queue, cache)
curl http://localhost:4444/status
```

---

## Server protection

| Measure | Local value | VPS value | Description |
|---------|:-----------:|:---------:|-------------|
| Concurrent compilations | 2 CPU | 4 CPU | Protects CPU |
| Max memory | 1 GB | 4 GB | Docker limit |
| Max queue | 20 | 20 | Prevents backlog |
| Rate limit per session | 5 s | 5 s | Anonymous cookie (works behind NAT) |
| Compilation timeout | 15 s | 15 s | Kills stalled compilations |
| Max source code size | 50 KB | 50 KB | Prevents abuse |
| SHA256 cache | 200 entries | 200 entries | Same code → no recompilation |

---

## File structure

```
s4a-simulator/
├── frontend/
│   ├── index.html          ← Full frontend (editor + simulation)
│   ├── build.js            ← Generates deps.bundle.js at build time
│   ├── deps.js             ← Dependency list (avr8js, CodeMirror)
│   └── package.json
├── backend/
│   ├── server.js           ← Express + queue + cache + compilation
│   └── package.json
├── docker-compose.yml      ← Local use (VM / WSL), port 4444
├── docker-compose.vps.yml  ← VPS with Traefik + HTTPS
├── Dockerfile
├── README.md               ← This file (English)
└── LLEGEIX-ME.md           ← Català
```

---

## Troubleshooting

**HTTPS certificate not appearing** (VPS)
Wait a few minutes. Check that DNS is already resolving: `dig s4a.yourdomain.com`

**Error "arduino-cli not found"**
Rebuild the image from scratch: `docker compose build --no-cache`

**Browser fails to load modules**
An Internet connection is required during the build (dependencies come from `esm.sh`).

**"Server is busy"**
The queue has 20 pending requests. Wait a few seconds and try again.

**Debian 13 — Docker repository fails**
If `VERSION_CODENAME` returns `trixie` and Docker does not yet have a package for it, replace it with `bookworm` in the repository command. The packages are compatible.

---

## Licence

MIT — feel free to use, adapt and share for educational purposes.
