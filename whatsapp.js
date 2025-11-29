const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode_terminal = require('qrcode-terminal');
const logger = require('./logger');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class WhatsAppSession extends EventEmitter {
    constructor(sessionId) {
        super();
        this.sessionId = sessionId;
        this.client = null;
        this.isClientReady = false;
        this.reconnectTimeout = null;
        this.dataPath = path.join(__dirname, 'data', sessionId);

        // Ensure data directory exists
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
    }

    initialize() {
        // If client exists and is connected, don't initialize again
        if (this.client && this.isClientReady) {
            logger.warn(`Session ${this.sessionId} already initialized and ready.`);
            return;
        }

        clearTimeout(this.reconnectTimeout); // Clear any pending reconnect attempts

        console.log(`Initializing WhatsApp client for session: ${this.sessionId}`);
        logger.info(`Initializing WhatsApp client for session: ${this.sessionId}`, this.sessionId);

        // Destroy existing client if it exists to avoid memory leaks
        if (this.client) {
            try {
                this.client.destroy();
            } catch (e) {
                logger.error(`Error destroying existing client for session ${this.sessionId}:`, e.message);
            }
            this.client = null;
        }

        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: this.sessionId, dataPath: this.dataPath }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-accelerated-2d-canvas',
                    '--disable-use-fallback-compositor'
                ],
            },
        });

        this.isClientReady = false; // Reset ready state
        this.attachListeners();

        this.client.initialize().catch(err => {
            logger.error(`Failed to initialize WhatsApp client for session ${this.sessionId}: ${err.message}`);
            this.emit('init_failure', err);
        });
    }

    attachListeners() {
        this.client.on('qr', (qr) => {
            this.isClientReady = false;
            console.log(`QR RECEIVED for session ${this.sessionId}. Printing to terminal...`);
            qrcode_terminal.generate(qr, { small: true });
            this.emit('qr', { sessionId: this.sessionId, qr });
        });

        this.client.on('ready', () => {
            this.isClientReady = true;
            console.log(`WhatsApp client ready for session: ${this.sessionId}`);
            logger.info('WhatsApp client is ready!', this.sessionId);
            this.emit('ready', { sessionId: this.sessionId });
        });

        this.client.on('authenticated', () => {
            this.isClientReady = true;
            logger.info('WhatsApp client authenticated.', this.sessionId);
            this.emit('authenticated', { sessionId: this.sessionId });
        });

        this.client.on('auth_failure', (msg) => {
            this.isClientReady = false;
            logger.error(`WhatsApp authentication failure: ${msg}`, this.sessionId);
            this.emit('auth_failure', { sessionId: this.sessionId, message: msg });
        });

        this.client.on('disconnected', (reason) => {
            this.isClientReady = false;
            logger.info(`WhatsApp client disconnected: ${reason}`, this.sessionId);
            this.emit('disconnected', { sessionId: this.sessionId, reason });
        });
    }

    async stop() {
        if (!this.client) {
            logger.warn(`Client for session ${this.sessionId} is not running, nothing to stop.`);
            return;
        }
        logger.info('Stopping WhatsApp client.', this.sessionId);
        clearTimeout(this.reconnectTimeout); // Stop any auto-reconnect attempts

        try {
            await this.client.destroy();
        } catch (e) {
            logger.error(`Error during client destruction: ${e.message}`, this.sessionId);
        } finally {
            this.client = null;
            this.isClientReady = false;
            this.emit('disconnected', { sessionId: this.sessionId, reason: 'Manually stopped' });
        }
    }

    async sendMessage(number, message) {
        if (!this.isClientReady || !this.client) {
            throw new Error(`WhatsApp client for session ${this.sessionId} is not ready.`);
        }

        const sanitized_number = number.toString().replace(/[-+ ]/g, '');
        const final_number = `${sanitized_number.startsWith('62') ? '' : '62'}${sanitized_number.replace(/^0/, '')}@c.us`;

        try {
            await this.client.sendMessage(final_number, message);
            logger.info(`Message sent to ${number}`, this.sessionId);
            return { success: true, message: `Message sent to ${number}`, sessionId: this.sessionId };
        } catch (err) {
            logger.error(`Failed to send message to ${number}: ${err.message}`, this.sessionId);
            throw new Error(`Failed to send message: ${err.message}`);
        }
    }

    isReady() {
        return this.isClientReady;
    }

    getSessionId() {
        return this.sessionId;
    }
}

class WhatsAppMultiSession extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map(); // Store all active sessions
    }

    createSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            logger.warn(`Session ${sessionId} already exists`, sessionId);
            return this.sessions.get(sessionId);
        }

        const session = new WhatsAppSession(sessionId);

        // Forward events from the session to the main emitter
        session.on('qr', (data) => this.emit('qr', data));
        session.on('ready', (data) => this.emit('ready', data));
        session.on('authenticated', (data) => this.emit('authenticated', data));
        session.on('auth_failure', (data) => this.emit('auth_failure', data));
        session.on('disconnected', (data) => this.emit('disconnected', data));
        session.on('init_failure', (err) => this.emit('init_failure', { sessionId: session.sessionId, error: err }));

        this.sessions.set(sessionId, session);
        logger.info(`Session ${sessionId} created`, sessionId);
        return session;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    removeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.stop(); // Stop the session if it's running
            this.sessions.delete(sessionId);

            // Remove the data directory for this session
            const fs = require('fs');
            const path = require('path');
            const dataPath = path.join(__dirname, 'data', sessionId);

            if (fs.existsSync(dataPath)) {
                try {
                    fs.rmSync(dataPath, { recursive: true, force: true });
                    logger.info(`Session data folder deleted: ${sessionId}`, sessionId);
                } catch (err) {
                    logger.error(`Failed to delete session data folder: ${err.message}`, sessionId);
                }
            }
        }
    }

    initialize(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            logger.error(`Session ${sessionId} does not exist`, sessionId);
            return null;
        }
        session.initialize();
        return session;
    }

    async stop(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            logger.warn(`Session ${sessionId} does not exist`, sessionId);
            return;
        }
        await session.stop();
    }

    async sendMessage(sessionId, number, message) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} does not exist`);
        }
        return await session.sendMessage(number, message);
    }

    isReady(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            logger.warn(`Session ${sessionId} does not exist`, sessionId);
            return false;
        }
        return session.isReady();
    }

    getSessionInfo() {
        const info = [];
        for (const [sessionId, session] of this.sessions) {
            info.push({
                sessionId,
                isReady: session.isReady(),
                clientExists: !!session.client
            });
        }
        return info;
    }
}

// Export a single instance of the multi-session manager
module.exports = new WhatsAppMultiSession();

