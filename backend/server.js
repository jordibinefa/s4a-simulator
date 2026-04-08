const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;

// --- Configuració ---
const MAX_CONCURRENT = 4;       // Compilacions simultànies
const MAX_QUEUE = 20;           // Màxim a la cua
const RATE_LIMIT_MS = 5000;     // 5 segons entre compilacions per sessió
const COMPILE_TIMEOUT = 15000;  // 15 segons màxim per compilació
const MAX_CODE_SIZE = 50 * 1024; // 50KB màxim de codi font
const CACHE_MAX_SIZE = 200;     // Màxim entrades al cache

// --- Middleware ---
app.use(express.json({ limit: '64kb' }));
app.use(express.text({ limit: '64kb' }));
app.use(cookieParser());

// Servir frontend estàtic
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// --- Estat ---
let currentCompilations = 0;
const compilationQueue = [];
const compilationCache = new Map(); // SHA256 -> { hex, timestamp }
const sessionLastCompile = new Map(); // sessionId -> timestamp

// --- Sessió anònima ---
function ensureSession(req, res) {
  let sid = req.cookies?.s4a_session;
  if (!sid) {
    sid = uuidv4();
    res.cookie('s4a_session', sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dies
    });
  }
  return sid;
}

// --- Cache ---
function getCacheKey(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function getCached(key) {
  const entry = compilationCache.get(key);
  if (entry) {
    entry.lastAccess = Date.now();
    return entry;
  }
  return null;
}

function setCache(key, hex) {
  // Netejar cache si és massa gran (LRU simple)
  if (compilationCache.size >= CACHE_MAX_SIZE) {
    let oldest = null;
    let oldestKey = null;
    for (const [k, v] of compilationCache) {
      if (!oldest || v.lastAccess < oldest.lastAccess) {
        oldest = v;
        oldestKey = k;
      }
    }
    if (oldestKey) compilationCache.delete(oldestKey);
  }
  compilationCache.set(key, { hex, timestamp: Date.now(), lastAccess: Date.now() });
}

// --- Cua de compilació ---
function processQueue() {
  while (currentCompilations < MAX_CONCURRENT && compilationQueue.length > 0) {
    const job = compilationQueue.shift();
    // Actualitzar posicions per als que queden
    compilationQueue.forEach((j, i) => j.onPosition?.(i + 1));
    runCompilation(job);
  }
}

function runCompilation(job) {
  currentCompilations++;
  const { code, resolve, reject } = job;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's4a-'));
  const sketchDir = path.join(tmpDir, 'sketch');
  const sketchFile = path.join(sketchDir, 'sketch.ino');
  const outputDir = path.join(tmpDir, 'output');

  fs.mkdirSync(sketchDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(sketchFile, code);

  const args = [
    'compile',
    '--fqbn', 'arduino:avr:nano:cpu=atmega328old',
    '--output-dir', outputDir,
    sketchDir
  ];

  const child = execFile('arduino-cli', args, {
    timeout: COMPILE_TIMEOUT,
    maxBuffer: 1024 * 1024
  }, (error, stdout, stderr) => {
    currentCompilations--;

    let result;
    if (error) {
      // Extreure missatges d'error útils
      const errorMsg = stderr || stdout || error.message;
      result = { success: false, error: errorMsg };
    } else {
      // Llegir el .hex generat
      try {
        const hexFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.hex'));
        if (hexFiles.length > 0) {
          const hex = fs.readFileSync(path.join(outputDir, hexFiles[0]), 'utf-8');
          result = { success: true, hex };
        } else {
          result = { success: false, error: 'No s\'ha generat cap fitxer .hex' };
        }
      } catch (e) {
        result = { success: false, error: 'Error llegint el fitxer .hex: ' + e.message };
      }
    }

    // Netejar directori temporal
    fs.rmSync(tmpDir, { recursive: true, force: true });

    resolve(result);
    processQueue();
  });
}

// --- Endpoint de compilació ---
app.post('/compile', (req, res) => {
  const sessionId = ensureSession(req, res);

  // Obtenir el codi
  let code = '';
  if (typeof req.body === 'string') {
    code = req.body;
  } else if (req.body?.code) {
    code = req.body.code;
  } else {
    return res.status(400).json({ success: false, error: 'No s\'ha rebut codi font' });
  }

  // Validar mida
  if (Buffer.byteLength(code) > MAX_CODE_SIZE) {
    return res.status(400).json({
      success: false,
      error: `El codi és massa gran (màxim ${MAX_CODE_SIZE / 1024}KB)`
    });
  }

  // Rate limit per sessió
  const lastCompile = sessionLastCompile.get(sessionId);
  const now = Date.now();
  if (lastCompile && (now - lastCompile) < RATE_LIMIT_MS) {
    const waitMs = RATE_LIMIT_MS - (now - lastCompile);
    return res.status(429).json({
      success: false,
      error: `Espera ${Math.ceil(waitMs / 1000)} segons abans de compilar de nou`,
      retryAfter: waitMs
    });
  }

  // Comprovar cache
  const cacheKey = getCacheKey(code);
  const cached = getCached(cacheKey);
  if (cached) {
    sessionLastCompile.set(sessionId, now);
    return res.json({ success: true, hex: cached.hex, cached: true });
  }

  // Comprovar si la cua està plena
  if (compilationQueue.length >= MAX_QUEUE) {
    return res.status(503).json({
      success: false,
      error: 'El servidor està molt ocupat. Torna-ho a intentar d\'aquí uns segons.'
    });
  }

  sessionLastCompile.set(sessionId, now);

  // Afegir a la cua
  const queuePosition = compilationQueue.length + 1;

  const promise = new Promise((resolve, reject) => {
    compilationQueue.push({
      code,
      resolve,
      reject,
      onPosition: null // Podríem usar SSE per actualitzar posició
    });
  });

  // Respondre amb la posició a la cua si no s'executa immediatament
  if (currentCompilations >= MAX_CONCURRENT) {
    // Enviar la posició però esperar el resultat
    // Usem un timeout llarg per la resposta HTTP
  }

  promise.then(result => {
    if (result.success) {
      setCache(cacheKey, result.hex);
    }
    res.json(result);
  }).catch(err => {
    res.status(500).json({ success: false, error: 'Error intern: ' + err.message });
  });

  processQueue();
});

// --- Endpoint d'estat ---
app.get('/status', (req, res) => {
  res.json({
    compilations: currentCompilations,
    queue: compilationQueue.length,
    cacheSize: compilationCache.size,
    maxConcurrent: MAX_CONCURRENT,
    maxQueue: MAX_QUEUE
  });
});

// --- SPA fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`S4A Simulator backend running on port ${PORT}`);
  console.log(`Max concurrent compilations: ${MAX_CONCURRENT}`);
  console.log(`Max queue size: ${MAX_QUEUE}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms per session`);
});
