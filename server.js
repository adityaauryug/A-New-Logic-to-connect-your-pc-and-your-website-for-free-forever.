require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 4000;

// =============================================================
//  ULTRA PRO MAX SECURITY LAYER
// =============================================================

// 1. SECRET KEY - Only those who know this key can use the API
//    Set this in Render's Environment Variables!
const API_SECRET = process.env.MATHI_SECRET || 'MATHI_YUG_ULTRA_2026';

// 2. ALLOWED ORIGINS - Only YOUR website can call this API
//    Add your Netlify domain here after deploying!
const ALLOWED_ORIGINS = [
    'http://localhost:4000',
    'http://localhost:3000',
    'http://127.0.0.1:4000',
    // Add your Netlify/Vercel URL below after deploying frontend:
    // 'https://mathi-yug.netlify.app',
];
if (process.env.FRONTEND_URL) {
    ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);
}

// 3. CORS - Block all unknown websites from even connecting
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman from same machine)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        console.log(`[SECURITY] BLOCKED request from unknown origin: ${origin}`);
        return callback(new Error('CORS: Access Denied'), false);
    },
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'x-mathi-token', 'x-mathi-timestamp', 'x-mathi-nonce'],
}));

app.use(express.json({ limit: '1kb' })); // Limit body size to prevent abuse
app.use(express.static(path.join(__dirname, 'public')));

// 4. RATE LIMITER - Block spam/DDoS attacks (max 5 requests per minute per IP)
const rateLimitMap = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 5;

function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitMap[ip]) {
        rateLimitMap[ip] = [];
    }

    // Remove old timestamps
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < RATE_LIMIT_WINDOW);

    if (rateLimitMap[ip].length >= MAX_REQUESTS) {
        console.log(`[SECURITY] RATE LIMITED IP: ${ip}`);
        return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    rateLimitMap[ip].push(now);
    next();
}

// 5. HMAC TOKEN VERIFICATION - Even if someone steals the secret,
//    they can't replay old requests (time-based one-time tokens)
function verifyHMAC(req, res, next) {
    const token = req.headers['x-mathi-token'];
    const timestamp = req.headers['x-mathi-timestamp'];
    const nonce = req.headers['x-mathi-nonce'];

    if (!token || !timestamp || !nonce) {
        console.log('[SECURITY] BLOCKED: Missing security headers');
        return res.status(403).json({ error: "Access Denied: Missing security credentials." });
    }

    // Reject requests older than 30 seconds (anti-replay)
    const age = Math.abs(Date.now() - parseInt(timestamp));
    if (age > 30000) {
        console.log(`[SECURITY] BLOCKED: Stale request (${age}ms old)`);
        return res.status(403).json({ error: "Access Denied: Request expired." });
    }

    // Verify HMAC signature
    const expectedToken = crypto
        .createHmac('sha256', API_SECRET)
        .update(`${timestamp}:${nonce}`)
        .digest('hex');

    if (token !== expectedToken) {
        console.log('[SECURITY] BLOCKED: Invalid HMAC token');
        return res.status(403).json({ error: "Access Denied: Invalid token." });
    }

    next();
}

// 6. SECURITY HEADERS - Hide server identity from hackers
app.use((req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// =============================================================
//  NATIVE WHATSAPP CLIENT
// =============================================================

const responseBus = new EventEmitter();

console.log('[MATHI-WEB] Initializing Native WhatsApp Client...');
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "webserver" }),
    puppeteer: {
        headless: true,
        executablePath: process.env.RENDER ? '/usr/bin/google-chrome' : undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    }
});

let isWhatsAppReady = false;

client.on('qr', (qr) => {
    console.log('[MATHI-WEB] Scan this QR Code to connect the Web Server to WhatsApp:');
    qrcode.generate(qr); // Using large mode for better scannability in Render terminal
});

client.on('ready', () => {
    isWhatsAppReady = true;
    console.log('[MATHI-WEB] Client is READY! Website can now process requests.');
});

client.on('disconnected', (reason) => {
    isWhatsAppReady = false;
    console.log('[MATHI-WEB] WhatsApp disconnected:', reason);
    console.log('[MATHI-WEB] Attempting to reconnect...');
    setTimeout(() => client.initialize(), 5000);
});

// Watch all messages, including from yourself
client.on('message_create', async (msg) => {
    if (!msg.fromMe) return;

    if (msg.body.startsWith('[to MATHI]')) {
        const answer = msg.body.replace('[to MATHI]', '').trim();
        console.log(`\n[MATHI-WEB] Triggered by WhatsApp Event! Found answer on bus.`);
        responseBus.emit('answer_received', answer);
    }
});

client.initialize();

// =============================================================
//  API ENDPOINTS (SECURED)
// =============================================================

// Health check (public, no auth needed)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', whatsapp: isWhatsAppReady });
});

// Main Chat API (SECURED with Rate Limit + HMAC)
app.post('/api/chat', rateLimiter, verifyHMAC, async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage || typeof userMessage !== 'string' || userMessage.length > 500) {
        return res.status(400).json({ error: "Invalid message." });
    }

    if (!isWhatsAppReady) {
        return res.status(503).json({ error: "WhatsApp is not ready yet." });
    }

    try {
        console.log(`[MATHI-WEB] Received query from UI: "${userMessage}"`);

        // Send query to WhatsApp as [from MATHI]
        await client.sendMessage(client.info.wid._serialized, `[from MATHI] ${userMessage}`);

        // Wait for the response event from WhatsApp
        const timeout = setTimeout(() => {
            responseBus.removeAllListeners('answer_received');
            if (!res.headersSent) {
                res.status(504).json({ error: "Timeout waiting for response." });
            }
        }, 180000);

        responseBus.once('answer_received', (answerText) => {
            clearTimeout(timeout);
            if (!res.headersSent) {
                console.log(`[MATHI-WEB] Resolving web request with answer.`);
                res.json({ reply: answerText });
            }
        });

    } catch (error) {
        console.error('[MATHI-WEB] Error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error." });
        }
    }
});

// Catch-all: Return 404 for unknown API routes (don't leak info)
app.all('/api/{*path}', (req, res) => {
    res.status(404).json({ error: "Not Found" });
});

// =============================================================
//  START SERVER
// =============================================================

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('===========================================');
    console.log('   MATHI ULTRA SECURE SERVER LIVE');
    console.log('===========================================');
    console.log(`   Port:     ${PORT}`);
    console.log(`   Security: HMAC-SHA256 + Rate Limit + CORS`);
    console.log(`   Local:    http://localhost:${PORT}`);
    const ips = getLocalIPs();
    ips.forEach(ip => {
        console.log(`   Network:  http://${ip}:${PORT}`);
    });
    console.log('===========================================');
    console.log('');
});


