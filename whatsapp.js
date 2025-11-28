const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode_terminal = require('qrcode-terminal');
const logger = require('./logger');
const { EventEmitter } = require('events');

class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.isClientReady = false;
        this.reconnectTimeout = null;
    }

    initialize() {
        // If client exists and is connected, don't initialize again
        if (this.client && this.isClientReady) {
            logger.warn('Client already initialized and ready.');
            return;
        }

        clearTimeout(this.reconnectTimeout); // Clear any pending reconnect attempts

        console.log("Initializing WhatsApp client...");
        logger.info('Initializing WhatsApp client...');

        // Destroy existing client if it exists to avoid memory leaks
        if (this.client) {
            try {
                this.client.destroy();
            } catch (e) {
                logger.error('Error destroying existing client:', e.message);
            }
            this.client = null;
        }

        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: 'data' }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ],
            },
        });

        this.isClientReady = false; // Reset ready state
        this.attachListeners();

        this.client.initialize().catch(err => {
            logger.error(`Failed to initialize WhatsApp client: ${err.message}`);
            this.emit('init_failure', err);
        });
    }

    attachListeners() {
        this.client.on('qr', (qr) => {
            this.isClientReady = false;
            console.log('QR RECEIVED. Printing to terminal...');
            qrcode_terminal.generate(qr, { small: true });
            this.emit('qr', qr);
        });

        this.client.on('ready', () => {
            this.isClientReady = true;
            console.log('WhatsApp client is ready!');
            logger.info('WhatsApp client is ready!');
            this.emit('ready');
        });

        this.client.on('authenticated', () => {
            this.isClientReady = true;
            logger.info('WhatsApp client authenticated.');
            this.emit('authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            this.isClientReady = false;
            logger.error(`WhatsApp authentication failure: ${msg}`);
            this.emit('auth_failure', msg);
        });

        this.client.on('disconnected', (reason) => {
            this.isClientReady = false;
            logger.info(`WhatsApp client disconnected: ${reason}`);
            this.emit('disconnected', reason);

            // Don't destroy the client instance on automatic disconnection
            // This allows manual restart via the start button
        });
    }

    async stop() {
        if (!this.client) {
            logger.warn('Client is not running, nothing to stop.');
            return;
        }
        logger.info('Stopping WhatsApp client manually...');
        clearTimeout(this.reconnectTimeout); // Stop any auto-reconnect attempts

        try {
            await this.client.destroy();
        } catch (e) {
            logger.error('Error during client destruction:', e.message);
        } finally {
            this.client = null;
            this.isClientReady = false;
            this.emit('disconnected', 'Manually stopped');
        }
    }

    async sendMessage(number, message) {
        if (!this.isClientReady || !this.client) {
            throw new Error('WhatsApp client is not ready.');
        }

        const sanitized_number = number.toString().replace(/[-+ ]/g, '');
        const final_number = `${sanitized_number.startsWith('62') ? '' : '62'}${sanitized_number.replace(/^0/, '')}@c.us`;

        try {
            await this.client.sendMessage(final_number, message);
            logger.info(`Message sent to ${number}`);
            return { success: true, message: `Message sent to ${number}` };
        } catch (err) {
            logger.error(`Failed to send message to ${number}: ${err.message}`);
            throw new Error(`Failed to send message: ${err.message}`);
        }
    }

    isReady() {
        return this.isClientReady;
    }
}

// Export a single instance
module.exports = new WhatsAppClient();

