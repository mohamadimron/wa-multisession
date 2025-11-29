const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const qrcode = require('qrcode');
const logger = require('./logger');
const { initDb, getDb } = require('./database');
const whatsappClient = require('./whatsapp'); // Now a multi-session manager

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Globals for SSE ---
const sseClients = new Set();
const qrCodeData = {}; // Changed to object to store multiple QR codes by session

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

    // Load existing sessions from data directory
    await loadExistingSessions();

    // --- Attach WhatsApp Event Listeners ---
    whatsappClient.on('qr', (data) => {
        const { sessionId, qr } = data;
        qrCodeData[sessionId] = qr;
        qrcode.toDataURL(qr).then(url => {
            sendSseEvent('qr', { sessionId, dataUrl: url });
        }).catch(err => logger.error(`Failed to generate QR data URL for SSE for session ${sessionId}.`, err));
    });

    whatsappClient.on('ready', (data) => {
        const { sessionId } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('ready', { sessionId, message: `WhatsApp client is ready for session ${sessionId}.` });
    });

    whatsappClient.on('authenticated', (data) => {
        const { sessionId } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('status', { sessionId, message: 'AUTHENTICATING' });
    });

    whatsappClient.on('auth_failure', (data) => {
        const { sessionId, message } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('status', { sessionId, message: 'AUTH_FAILURE', details: message });
    });

    whatsappClient.on('disconnected', (data) => {
        const { sessionId, reason } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('disconnected', { sessionId, message: `Disconnected: ${reason}` });
    });

    // Function to load existing sessions from the data directory
    async function loadExistingSessions() {
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(__dirname, 'data');

        try {
            if (fs.existsSync(dataDir)) {
                const files = fs.readdirSync(dataDir);
                for (const file of files) {
                    const filePath = path.join(dataDir, file);
                    if (fs.statSync(filePath).isDirectory()) {
                        // Create session for each directory found
                        const session = whatsappClient.createSession(file);
                        logger.info(`Session loaded from storage: ${file}`, file);
                    }
                }
            }
        } catch (error) {
            logger.error(`Error loading existing sessions: ${error.message}`);
        }
    }

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

        // Send initial status for all sessions
        const sessions = whatsappClient.getSessionInfo();
        for (const session of sessions) {
            if (whatsappClient.isReady(session.sessionId)) {
                sendSseEvent('ready', { sessionId: session.sessionId, message: `WhatsApp client is ready for session ${session.sessionId}.` });
            } else {
                sendSseEvent('disconnected', { sessionId: session.sessionId, message: `Client for session ${session.sessionId} is stopped.` });
            }

            // If there's a QR code for this session, send it
            if (qrCodeData[session.sessionId]) {
                qrcode.toDataURL(qrCodeData[session.sessionId]).then(url => {
                    sendSseEvent('qr', { sessionId: session.sessionId, dataUrl: url });
                }).catch(err => logger.error(`Failed to generate QR data URL for SSE for session ${session.sessionId}.`, err));
            }
        }

        req.on('close', () => {
            sseClients.delete(res);
            logger.info(`SSE client disconnected. Total: ${sseClients.size}`);
        });
    });

    // --- Control API Routes ---
    app.post('/api/whatsapp/create-session', (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID is required.' });
        }

        logger.info(`Received request to create session: ${sessionId}`);
        const session = whatsappClient.createSession(sessionId);
        res.json({ status: 'success', message: `Session ${sessionId} created.`, sessionId });
    });

    app.post('/api/whatsapp/start', (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID is required.' });
        }

        logger.info(`Received request to start session: ${sessionId}`);
        const session = whatsappClient.initialize(sessionId);
        if (session) {
            res.json({ status: 'success', message: `Session ${sessionId} initialization started.`, sessionId });
        } else {
            res.status(404).json({ status: 'error', message: `Session ${sessionId} does not exist.` });
        }
    });

    app.post('/api/whatsapp/stop', async (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID is required.' });
        }

        logger.info(`Received request to stop session: ${sessionId}`);
        await whatsappClient.stop(sessionId);
        res.json({ status: 'success', message: `Session ${sessionId} stopped.`, sessionId });
    });

    app.get('/api/whatsapp/sessions', (req, res) => {
        // Get all sessions from the session manager
        const allSessions = whatsappClient.getSessionInfo();

        // Also get all directories in the data folder
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(__dirname, 'data');
        let dataFolders = [];

        if (fs.existsSync(dataDir)) {
            dataFolders = fs.readdirSync(dataDir).filter(file => {
                return fs.statSync(path.join(dataDir, file)).isDirectory();
            });
        }

        // Filter sessions to include only those that have corresponding data folders
        // or those that are currently in the session manager
        const sessions = allSessions.filter(session => {
            // Always include sessions that are currently in the manager
            // and also check if there's a physical folder for them
            return dataFolders.includes(session.sessionId);
        });

        // Add any data folders that may not be in the session manager yet
        dataFolders.forEach(folder => {
            const exists = sessions.some(s => s.sessionId === folder);
            if (!exists) {
                sessions.push({
                    sessionId: folder,
                    isReady: false,
                    clientExists: false
                });
            }
        });

        res.json({ status: 'success', sessions });
    });

    app.delete('/api/whatsapp/session/:sessionId', async (req, res) => {
        const { sessionId } = req.params;
        logger.info(`Received request to delete session: ${sessionId}`);

        await whatsappClient.stop(sessionId);
        whatsappClient.removeSession(sessionId);
        res.json({ status: 'success', message: `Session ${sessionId} deleted.`, sessionId });
    });

    // API endpoint to get chat history
    app.get('/api/whatsapp/chat-history/:sessionId', async (req, res) => {
        const { sessionId } = req.params;
        const { chatId, limit = 50 } = req.query;

        if (!sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'Session ID is required.'
            });
        }

        try {
            // Check if session is ready before attempting to fetch history
            if (!whatsappClient.isReady(sessionId)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'WhatsApp client for this session is not ready.'
                });
            }

            const options = { limit: parseInt(limit) };
            const messages = await whatsappClient.getChatHistory(sessionId, chatId, options);

            // Format messages for the frontend
            const formattedMessages = messages.map(msg => ({
                id: msg.id._serialized,
                body: msg.body,
                timestamp: msg.timestamp,
                from: msg.from,
                to: msg.to,
                fromMe: msg.fromMe,
                author: msg.author,
                type: msg.type,
                hasMedia: msg.hasMedia,
                isForwarded: msg.isForwarded,
                chatInfo: msg.chatInfo
            }));

            res.json({
                status: 'success',
                messages: formattedMessages,
                count: formattedMessages.length
            });
        } catch (error) {
            logger.error(`API chat history error for session ${sessionId}: ${error.message}`);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });

    // --- Standard API Routes ---
    app.post('/api/whatsapp/send', async (req, res) => {
        const { sessionId, number, message } = req.body;
        if (!sessionId || !number || !message) {
            return res.status(400).json({
                status: 'error',
                message: 'Session ID, number, and message are required.'
            });
        }
        try {
            const result = await whatsappClient.sendMessage(sessionId, number, message);
            res.json({ status: 'success', ...result });
        } catch (error) {
            logger.error(`API send error for session ${sessionId}: ${error.message}`);
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
