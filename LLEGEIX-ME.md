# S4A Simulator — Simulador Arduino Nano (ATmega328P)

> **[Read in English](README.md)**

Simulador web per a formació i cicles formatius. Permet escriure, compilar i executar programes d'Arduino Nano directament al navegador, sense necessitat de tenir cap placa física.

Desenvolupat en un centre de Formació Professional de Catalunya com a part d'un conjunt d'eines educatives obertes.

## Com funciona

```
Navegador (alumne)                    Servidor
───────────────────                   ─────────────────────
CodeMirror 6 (editor)                 POST /compile
avr8js (simulació CPU)     ──────►    arduino-cli (arduino:avr)
LEDs / Switches (DOM)                 Retorna fitxer .hex
Serial Monitor (DOM)
```

El servidor **només compila**. Tota la simulació s'executa al navegador.

---

## Instal·lació

Tria el teu cas:

- [Màquina virtual Linux (Debian / Ubuntu)](#opció-a--màquina-virtual-linux-debian--ubuntu)
- [Windows amb WSL2](#opció-b--windows-amb-wsl2)
- [VPS amb Traefik i HTTPS](#opció-c--vps-amb-traefik-i-https)

---

## Opció A — Màquina virtual Linux (Debian / Ubuntu)

### Requisits previs

- Debian 13 / Ubuntu 22.04 o superior
- Connexió a Internet (la primera construcció descarrega ~200 MB)

### 1. Instal·lar Docker Engine

```bash
# Dependències prèvies
sudo apt update
sudo apt install -y ca-certificates curl gnupg

# Clau GPG oficial de Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Repositori (per a Ubuntu substitueix "debian" per "ubuntu")
echo \
  "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instal·lar Docker + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli \
  containerd.io docker-buildx-plugin docker-compose-plugin

# Opcional: evitar escriure sudo a cada comanda
sudo usermod -aG docker $USER && newgrp docker
```

### 2. Obtenir el projecte

```bash
git clone https://github.com/jordibinefa/s4a-simulator.git
cd s4a-simulator
```

### 3. Construir i arrencar

```bash
docker compose build
docker compose up -d
```

La primera vegada triga uns minuts (descarrega el core `arduino:avr`).

### 4. Verificar

```bash
# Ha de retornar {"success":true,"hex":"..."}
curl -X POST http://localhost:4444/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}"}'
```

Obre `http://localhost:4444` al navegador.

---

## Opció B — Windows amb WSL2

### Requisits previs

- Windows 10 (21H2 o superior) o Windows 11
- WSL2 habilitat amb una distribució Ubuntu instal·lada

### 1. Habilitar WSL2 (si no està fet)

Obre PowerShell **com a administrador**:

```powershell
wsl --install
# Reinicia l'ordinador si te ho demana
```

Si ja tens WSL instal·lat però en versió 1:

```powershell
wsl --set-default-version 2
```

### 2. Instal·lar Docker Desktop

Descarrega i instal·la [Docker Desktop per a Windows](https://www.docker.com/products/docker-desktop/).

Durant la instal·lació, assegura't que l'opció **"Use the WSL 2 based engine"** està marcada.

Un cop instal·lat, obre Docker Desktop i a **Settings → Resources → WSL Integration** activa la integració amb la teva distribució Ubuntu.

### 3. Clonar i arrencar

Obre el terminal d'Ubuntu (WSL):

```bash
git clone https://github.com/jordibinefa/s4a-simulator.git
cd s4a-simulator
docker compose build
docker compose up -d
```

### 4. Verificar

```bash
curl -X POST http://localhost:4444/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}"}'
```

Obre `http://localhost:4444` al navegador de Windows (Chrome, Edge...).

> **Nota:** WSL2 reenvía automàticament els ports al sistema Windows. No cal configurar res addicional.

---

## Opció C — VPS amb Traefik i HTTPS

### Requisits previs

- VPS amb Debian/Ubuntu i Docker instal·lat
- Traefik funcionant amb la xarxa externa `proxy` i el certresolver `letsencrypt`
- Registre DNS apuntant al VPS

### 1. Apuntar el DNS

Al teu proveïdor DNS, afegeix un registre A:

```
s4a.exemple.cat  →  IP_DEL_VPS
```

### 2. Configurar el domini

```bash
git clone https://github.com/jordibinefa/s4a-simulator.git
cd s4a-simulator

# Substitueix el domini d'exemple
sed -i 's/s4a.exemple.cat/s4a.EL-TEU-DOMINI.cat/g' docker-compose.vps.yml
```

### 3. Construir i arrencar

```bash
docker compose -f docker-compose.vps.yml build
docker compose -f docker-compose.vps.yml up -d
```

### 4. Verificar

```bash
curl -X POST https://s4a.EL-TEU-DOMINI.cat/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){} void loop(){}"}'
```

> **Nota:** El certificat HTTPS pot trigar uns minuts a emetre's la primera vegada.

---

## Gestió del contenidor

```bash
# Aturar
docker compose down

# Reiniciar
docker compose restart

# Veure logs en temps real
docker compose logs -f

# Reconstruir després de canvis al codi
docker compose build && docker compose up -d

# Estat del servidor (compilacions actives, cua, caché)
curl http://localhost:4444/status
```

---

## Protecció del servidor

| Mesura | Valor local | Valor VPS | Descripció |
|--------|:-----------:|:---------:|------------|
| Compilacions simultànies | 2 CPU | 4 CPU | Protegeix la CPU |
| Memòria màxima | 1 GB | 4 GB | Límit Docker |
| Cua màxima | 20 | 20 | Evita acumulació |
| Rate limit per sessió | 5 s | 5 s | Cookie anònima (funciona amb NAT) |
| Timeout compilació | 15 s | 15 s | Mata compilacions penjades |
| Mida màxima codi | 50 KB | 50 KB | Evita abusos |
| Caché SHA256 | 200 entrades | 200 entrades | Mateix codi = no recompila |

---

## Estructura de fitxers

```
s4a-simulator/
├── frontend/
│   ├── index.html          ← Frontend complet (editor + simulació)
│   ├── build.js            ← Genera deps.bundle.js durant el build
│   ├── deps.js             ← Llista de dependències (avr8js, CodeMirror)
│   └── package.json
├── backend/
│   ├── server.js           ← Express + cua + caché + compilació
│   └── package.json
├── docker-compose.yml      ← Ús local (VM / WSL), port 4444
├── docker-compose.vps.yml  ← Ús VPS amb Traefik + HTTPS
├── Dockerfile
├── README.md               ← English
└── LLEGEIX-ME.md           ← Aquest fitxer (català)
```

---

## Resolució de problemes

**El certificat HTTPS no apareix** (VPS)
Espera uns minuts. Comprova que el DNS ja apunta al VPS: `dig s4a.exemple.cat`

**Error "arduino-cli not found"**
Reconstrueix la imatge des de zero: `docker compose build --no-cache`

**El navegador no carrega els mòduls**
Cal connexió a Internet durant el build (les dependències vénen de `esm.sh`).

**"El servidor està molt ocupat"**
La cua té 20 peticions pendents. Espera uns segons i torna-ho a intentar.

**Debian 13 — el repositori Docker falla**
Si `VERSION_CODENAME` retorna `trixie` i Docker no té encara el paquet, substitueix-lo per `bookworm` a la comanda del repositori. Els paquets són compatibles.

---

## Llicència

MIT — lliure per usar, adaptar i compartir amb finalitats educatives.
