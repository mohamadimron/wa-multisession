const EventEmitter = require('events');
const { getDb } = require('./database');

class Logger extends EventEmitter {
    log(type, message, sessionId = null) {
        const timestamp = new Date().toISOString();
        const prefix = sessionId ? `[${sessionId}]` : '';
        const formattedMessage = `[${timestamp}] ${prefix}[${type.toUpperCase()}] ${message}`;

        if (type === 'error') {
            console.error(formattedMessage);
        } else {
            console.log(formattedMessage);
        }

        // Emit the log event
        const logData = { type, message, sessionId, timestamp };
        this.emit('log', logData);

        // Save to database
        try {
            const db = getDb();
            const stmt = db.prepare("INSERT INTO logs (type, message, session_id) VALUES (?, ?, ?)");
            stmt.run(type, message, sessionId, (err) => {
                if (err) {
                    console.error('Failed to save log to database:', err.message);
                }
            });
            stmt.finalize();
        } catch (error) {
            console.error("Database not ready, log not saved:", message);
        }
    }

    info(message, sessionId = null) {
        this.log('info', message, sessionId);
    }

    error(message, sessionId = null) {
        this.log('error', message, sessionId);
    }

    warn(message, sessionId = null) {
        this.log('warn', message, sessionId);
    }
}

const logger = new Logger();
module.exports = logger;
