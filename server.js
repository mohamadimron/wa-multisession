const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const logger = require('./logger');
const { initDb, getDb, insertSessionStatus, updateSessionPhoneNumber, getAllSessions, getSessionHistory, deleteAllSessionHistory, deleteSessionHistory, getSessionHistoryCount, getSystemLogs, getSystemLogsCount, deleteAllSystemLogs, deleteSystemLogsBySession } = require('./database');
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

        // Log session status change to database
        insertSessionStatus(sessionId, 'qr').catch(err => logger.error(`Failed to insert QR status for session ${sessionId}:`, err));
    });

    whatsappClient.on('ready', (data) => {
        const { sessionId, phoneNumber } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('ready', { sessionId, phoneNumber, message: `WhatsApp client is ready for session ${sessionId}.` });

        // Log session status change to database
        insertSessionStatus(sessionId, 'ready').catch(err => logger.error(`Failed to insert ready status for session ${sessionId}:`, err));
    });

    whatsappClient.on('authenticated', (data) => {
        const { sessionId } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('status', { sessionId, message: 'AUTHENTICATING' });

        // Log session status change to database
        insertSessionStatus(sessionId, 'authenticated').catch(err => logger.error(`Failed to insert authenticated status for session ${sessionId}:`, err));
    });

    whatsappClient.on('auth_failure', (data) => {
        const { sessionId, message } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('status', { sessionId, message: 'AUTH_FAILURE', details: message });

        // Log session status change to database
        insertSessionStatus(sessionId, 'auth_failure').catch(err => logger.error(`Failed to insert auth_failure status for session ${sessionId}:`, err));
    });

    whatsappClient.on('disconnected', (data) => {
        const { sessionId, reason } = data;
        delete qrCodeData[sessionId]; // Clear QR code for this session
        sendSseEvent('disconnected', { sessionId, message: `Disconnected: ${reason}` });

        // Log session status change to database
        insertSessionStatus(sessionId, 'disconnected').catch(err => logger.error(`Failed to insert disconnected status for session ${sessionId}:`, err));
    });

    // Add comprehensive WhatsApp event listeners
    whatsappClient.on('message', (data) => {
        const { sessionId, message } = data;
        sendSseEvent('message', { sessionId, message });

        // Log message to system logs
        const logType = message.fromMe ? 'info' : 'message';
        const logMessage = `${message.fromMe ? 'Sent' : 'Received'} - ${message.body || `[${message.type} message]`}`;
        logger.log(logType, logMessage, sessionId);
    });

    whatsappClient.on('message_create', (data) => {
        const { sessionId, message } = data;
        sendSseEvent('message_create', { sessionId, message });

        // Log message creation
        logger.log('info', `Message created - ${message.body || `[${message.type} message]`}`, sessionId);
    });

    whatsappClient.on('message_ack', (data) => {
        const { sessionId, messageId, status, timestamp } = data;
        sendSseEvent('message_ack', { sessionId, messageId, status, timestamp });

        // Log message acknowledgment
        logger.log('info', `Message ack: ${status}`, sessionId);
    });

    whatsappClient.on('message_revoke_everyone', (data) => {
        const { sessionId, message, revokedMessage } = data;
        sendSseEvent('message_revoke_everyone', { sessionId, message, revokedMessage });

        // Log message revocation
        logger.log('info', `Message revoked by everyone`, sessionId);
    });

    whatsappClient.on('message_revoke_me', (data) => {
        const { sessionId, message } = data;
        sendSseEvent('message_revoke_me', { sessionId, message });

        // Log message revocation by me
        logger.log('info', `Message revoked by me`, sessionId);
    });

    whatsappClient.on('media_uploaded', (data) => {
        const { sessionId, messageId } = data;
        sendSseEvent('media_uploaded', { sessionId, messageId });

        // Log media upload
        logger.log('info', `Media uploaded - ID: ${messageId}`, sessionId);
    });

    // Group events
    whatsappClient.on('group_join', (data) => {
        const { sessionId, notification } = data;
        sendSseEvent('group_join', { sessionId, notification });

        // Log group join
        logger.log('info', `Contact joined group: ${notification.body}`, sessionId);
    });

    whatsappClient.on('group_leave', (data) => {
        const { sessionId, notification } = data;
        sendSseEvent('group_leave', { sessionId, notification });

        // Log group leave
        logger.log('info', `Contact left group: ${notification.body}`, sessionId);
    });

    whatsappClient.on('group_update', (data) => {
        const { sessionId, notification } = data;
        sendSseEvent('group_update', { sessionId, notification });

        // Log group update
        logger.log('info', `Group updated: ${notification.body}`, sessionId);
    });

    // Contact and chat events
    whatsappClient.on('contact_changed', (data) => {
        const { sessionId, oldId, newId, isContact } = data;
        sendSseEvent('contact_changed', { sessionId, oldId, newId, isContact });

        // Log contact change
        logger.log('info', `Contact changed: ${oldId} to ${newId}`, sessionId);
    });

    whatsappClient.on('group_admin_changed', (data) => {
        const { sessionId, notification } = data;
        sendSseEvent('group_admin_changed', { sessionId, notification });

        // Log group admin change
        logger.log('info', `Group admin changed: ${notification.body}`, sessionId);
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
                    if (fs.statSync(filePath).isDirectory() && file !== 'database.sqlite') { // Exclude database file
                        // Create session for each directory found
                        const session = whatsappClient.createSession(file);
                        logger.info(`Session loaded from storage: ${file}`, file);

                        // Log session loaded status to database
                        try {
                            await insertSessionStatus(file, 'loaded');
                        } catch (err) {
                            logger.error(`Failed to insert loaded status for session ${file}:`, err);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error(`Error loading existing sessions: ${error.message}`);
        }
    }

    // Middleware
    app.use(express.json());

    // --- API Routes (These must be defined BEFORE static middleware) ---
    // --- Control API Routes ---
    app.post('/api/whatsapp/create-session', async (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID is required.' });
        }

        logger.info(`Received request to create session: ${sessionId}`);
        const session = whatsappClient.createSession(sessionId);

        // Log session creation to database with initial status
        try {
            await insertSessionStatus(sessionId, 'created');
        } catch (err) {
            logger.error(`Failed to insert created status for session ${sessionId}:`, err);
        }

        res.json({ status: 'success', message: `Session ${sessionId} created.`, sessionId });
    });

    app.post('/api/whatsapp/start', async (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID is required.' });
        }

        logger.info(`Received request to start session: ${sessionId}`);

        // Log session start attempt to database
        try {
            await insertSessionStatus(sessionId, 'starting');
        } catch (err) {
            logger.error(`Failed to insert starting status for session ${sessionId}:`, err);
        }

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

        // Log session stop attempt to database
        try {
            await insertSessionStatus(sessionId, 'stopping');
        } catch (err) {
            logger.error(`Failed to insert stopping status for session ${sessionId}:`, err);
        }

        await whatsappClient.stop(sessionId);
        res.json({ status: 'success', message: `Session ${sessionId} stopped.`, sessionId });
    });

    app.get('/api/whatsapp/sessions', async (req, res) => {
        try {
            const sessionsFromDb = await getAllSessions();
            // Also get live status from the client manager
            const liveSessions = whatsappClient.getSessionInfo();

            const sessions = sessionsFromDb.map(s => {
                const liveInfo = liveSessions.find(ls => ls.sessionId === s.session_name);
                return {
                    sessionId: s.session_name,
                    phoneNumber: s.phone_number,
                    // Use live status if available, otherwise use DB status
                    status: liveInfo ? (liveInfo.isReady ? 'ready' : s.status) : s.status,
                    isReady: liveInfo ? liveInfo.isReady : s.status === 'ready'
                };
            });

            res.json({ status: 'success', sessions });
        } catch (err) {
            logger.error('Failed to get sessions from database:', err);
            res.status(500).json({ status: 'error', message: 'Could not retrieve sessions.' });
        }
    });

    app.delete('/api/whatsapp/session/:sessionId', async (req, res) => {
        const { sessionId } = req.params;
        logger.info(`Received request to delete session: ${sessionId}`);

        await whatsappClient.stop(sessionId);

        // Delete session from the database
        try {
            await deleteSessionHistory(sessionId);
            logger.info(`Session ${sessionId} deleted from database.`);
        } catch (err) {
            logger.error(`Failed to delete session ${sessionId} from database:`, err);
        }

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

    // API endpoint to get session history from database with pagination
    app.get('/api/sessions/history', async (req, res) => {
        try {
            const { limit = 10, offset = 0, search } = req.query;
            const sessions = await getSessionHistory(parseInt(limit), parseInt(offset), search || null);
            const totalCount = await getSessionHistoryCount(search || null);

            res.json({
                status: 'success',
                sessions: sessions,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total: totalCount,
                    pages: Math.ceil(totalCount / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error(`API session history error: ${error.message}`);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });

    // API endpoint to delete session history for a specific session (define this BEFORE the static route)
    app.delete('/api/sessions/history/:sessionName', async (req, res) => {
        const { sessionName } = req.params;
        try {
            const deletedCount = await deleteSessionHistory(sessionName);
            res.json({
                status: 'success',
                message: `Deleted session history for ${sessionName}. Removed ${deletedCount} records.`,
                deletedCount: deletedCount,
                sessionName: sessionName
            });
        } catch (error) {
            logger.error(`API delete session history error: ${error.message}`);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });

    // API endpoint to delete all session history (this should come after the parameterized route)
    app.delete('/api/sessions/history', async (req, res) => {
        try {
            const deletedCount = await deleteAllSessionHistory();
            res.json({
                status: 'success',
                message: `Deleted all session history. Removed ${deletedCount} records.`,
                deletedCount: deletedCount
            });
        } catch (error) {
            logger.error(`API delete all session history error: ${error.message}`);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });

    // API endpoint to get system logs from database
    app.get('/api/system/logs', async (req, res) => {
        try {
            const { limit = 10, offset = 0, search } = req.query;
            const logs = await getSystemLogs(parseInt(limit), parseInt(offset), search || null);
            const totalCount = await getSystemLogsCount(search || null);

            res.json({
                status: 'success',
                logs: logs,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total: totalCount,
                    pages: Math.ceil(totalCount / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error(`API system logs error: ${error.message}`);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });

    // API endpoint to delete all system logs
    app.delete('/api/system/logs', async (req, res) => {
        try {
            const deletedCount = await deleteAllSystemLogs();
            res.json({
                status: 'success',
                message: `Deleted all system logs. Removed ${deletedCount} records.`,
                deletedCount: deletedCount
            });
        } catch (error) {
            logger.error(`API delete all system logs error: ${error.message}`);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });

    // API endpoint to delete system logs for a specific session
    app.delete('/api/system/logs/session/:sessionId', async (req, res) => {
        const { sessionId } = req.params;
        try {
            const deletedCount = await deleteSystemLogsBySession(sessionId);
            res.json({
                status: 'success',
                message: `Deleted system logs for session ${sessionId}. Removed ${deletedCount} records.`,
                deletedCount: deletedCount,
                sessionId: sessionId
            });
        } catch (error) {
            logger.error(`API delete system logs for session error: ${error.message}`);
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

    // SSE endpoint for QR codes and status updates
    app.get('/qr-stream', (req, res) => {
        // Set headers for SSE
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Connection', 'keep-alive');

        // Send a welcome message to confirm connection
        res.write(`data: {"event":"connected","message":"SSE connection established"}\n\n`);

        // Add the response object to the set of SSE clients
        sseClients.add(res);

        // Remove client when connection closes
        req.on('close', () => {
            sseClients.delete(res);
        });

        req.on('error', (err) => {
            logger.error(`SSE error for client: ${err.message}`);
            sseClients.delete(res);
        });
    });

    // API endpoint to get QR code image for a session
    app.get('/api/whatsapp/session/:sessionId/qr', (req, res) => {
        const { sessionId } = req.params;
        const qrImagePath = path.join(__dirname, 'data', sessionId, `${sessionId}_qr.png`);

        // Check if QR code image exists
        if (fs.existsSync(qrImagePath)) {
            res.sendFile(qrImagePath);
        } else {
            // Return 404 if QR code image doesn't exist
            res.status(404).json({
                status: 'error',
                message: `QR code image not found for session ${sessionId}`
            });
        }
    });

    // Static file serving (MUST be after all API routes)
    app.use(express.static(path.join(__dirname, 'public')));

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
