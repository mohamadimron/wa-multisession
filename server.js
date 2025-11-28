const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const logger = require('./logger');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Routes
app.get('/api/settings', (req, res) => {
    db.all("SELECT key, value FROM settings", [], (err, rows) => {
        if (err) {
            logger.error(`Failed to fetch settings: ${err.message}`);
            res.status(500).json({ error: err.message });
            return;
        }
        const settings = rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    });
});

app.post('/api/settings', (req, res) => {
    const settings = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    
    Object.entries(settings).forEach(([key, value]) => {
        stmt.run(key, value, (err) => {
            if (err) {
                logger.error(`Failed to save setting ${key}: ${err.message}`);
            }
        });
    });
    
    stmt.finalize((err) => {
        if (err) {
            logger.error(`Failed to finalize settings update: ${err.message}`);
            return res.status(500).json({ status: 'error' });
        }
        logger.info('Settings updated successfully.');
        res.json({ status: 'success' });
    });
});

app.get('/api/logs', (req, res) => {
    const limit = req.query.limit || 50;
    db.all("SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?", [limit], (err, rows) => {
        if (err) {
            logger.error(`Failed to fetch recent logs: ${err.message}`);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows.reverse());
    });
});


// Socket.IO Connection
io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

// Bridge logger to Socket.IO
logger.on('log', (logData) => {
    io.emit('new_log', logData);
});

// Start Server
server.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});
