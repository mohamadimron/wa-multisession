const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const qrcode = require('qrcode');
const logger = require('./logger');
const { initDb, getDb } = require('./database');
const whatsappClient = require('./whatsapp');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Globals for SSE ---
const sseClients = new Set();
let qrCodeData = null;

// --- SSE Helper ---
function sendSseEvent(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        client.write(payload);
    }
}

async function main() {
    // Initialize database first
    await initDb();
    const db = getDb();

    // --- Attach WhatsApp Event Listeners ---
    whatsappClient.on('qr', (qr) => {
        qrCodeData = qr;
        qrcode.toDataURL(qr).then(url => {
            sendSseEvent('qr', { dataUrl: url });
        }).catch(err => logger.error('Failed to generate QR data URL for SSE.', err));
    });

    whatsappClient.on('ready', () => {
        qrCodeData = null;
        sendSseEvent('ready', { message: 'WhatsApp client is ready.' });
    });

    whatsappClient.on('authenticated', () => {
        qrCodeData = null;
        sendSseEvent('status', { message: 'AUTHENTICATING' });
    });
    
    whatsappClient.on('auth_failure', (msg) => {
        sendSseEvent('status', { message: 'AUTH_FAILURE', details: msg });
    });

    whatsappClient.on('disconnected', (reason) => {
        qrCodeData = null;
        sendSseEvent('disconnected', { message: `Disconnected: ${reason}` });
    });

    // Middleware
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());

    // --- SSE Endpoint ---
    app.get('/qr-stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        sseClients.add(res);
        logger.info(`SSE client connected. Total: ${sseClients.size}`);
        
        // Send initial status
        if (whatsappClient.isReady()) {
            sendSseEvent('ready', { message: 'WhatsApp client is ready.' });
        } else {
            sendSseEvent('disconnected', { message: 'Client is stopped.' });
        }

        req.on('close', () => {
            sseClients.delete(res);
            logger.info(`SSE client disconnected. Total: ${sseClients.size}`);
        });
    });

    // --- Control API Routes ---
    app.post('/api/whatsapp/start', (req, res) => {
        logger.info('Received request to start client...');
        whatsappClient.initialize();
        res.json({ status: 'success', message: 'Client initialization started.' });
    });

    app.post('/api/whatsapp/stop', async (req, res) => {
        logger.info('Received request to stop client...');
        await whatsappClient.stop();
        res.json({ status: 'success', message: 'Client stopped.' });
    });

    // --- Standard API Routes ---
    app.post('/api/whatsapp/send', async (req, res) => {
        const { number, message } = req.body;
        if (!number || !message) {
            return res.status(400).json({ status: 'error', message: 'Number and message are required.' });
        }
        try {
            const result = await whatsappClient.sendMessage(number, message);
            res.json({ status: 'success', ...result });
        } catch (error) {
            logger.error(`API send error: ${error.message}`);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Socket.IO for logs
    io.on('connection', (socket) => {
        logger.info(`Client connected for logs: ${socket.id}`);
        socket.on('disconnect', () => {
            logger.info(`Client disconnected from logs: ${socket.id}`);
        });
    });

    logger.on('log', (logData) => {
        io.emit('new_log', logData);
    });

    // Start Server
    server.listen(PORT, () => {
        logger.info(`Server is running on http://localhost:${PORT}`);
        logger.info('WhatsApp client is stopped. Press the "Start" button on the dashboard to begin.');
    });
}

main().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
