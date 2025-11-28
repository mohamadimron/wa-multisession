const EventEmitter = require('events');
const db = require('./database');

class Logger extends EventEmitter {
    log(type, message) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        
        if (type === 'error') {
            console.error(formattedMessage);
        } else {
            console.log(formattedMessage);
        }

        // Emit the log event
        const logData = { type, message, timestamp };
        this.emit('log', logData);

        // Save to database
        const stmt = db.prepare("INSERT INTO logs (type, message) VALUES (?, ?)");
        stmt.run(type, message, (err) => {
            if (err) {
                console.error('Failed to save log to database:', err.message);
            }
        });
        stmt.finalize();
    }

    info(message) {
        this.log('info', message);
    }

    error(message) {
        this.log('error', message);
    }
}

const logger = new Logger();
module.exports = logger;
