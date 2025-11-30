const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

let db;

function initDb() {
    return new Promise((resolve, reject) => {
        const newDb = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                return reject(err);
            }

            console.log('Connected to the SQLite database.');
            newDb.serialize(() => {
                // Create settings table
                newDb.run(`CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )`, (err) => {
                    if (err) {
                        console.error('Error creating settings table:', err.message);
                        return reject(err);
                    }
                });

                // Create logs table - added sessionId column for multisession support
                newDb.run(`CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    session_id TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) {
                        console.error('Error creating logs table:', err.message);
                        return reject(err);
                    }
                });

                // Create sessions table for tracking latest session status
                newDb.run(`CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_name TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT NOT NULL
                )`, (err) => {
                    if (err) {
                        console.error('Error creating sessions table:', err.message);
                        return reject(err);
                    }
                });

                // Create index on session_name for faster updates
                newDb.run(`CREATE INDEX IF NOT EXISTS idx_session_name ON sessions(session_name)`, (err) => {
                    if (err) {
                        console.error('Error creating index on sessions table:', err.message);
                    }
                });

                // Create unique index to ensure only latest status for each session
                newDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_session ON sessions(session_name)`, (err) => {
                    if (err) {
                        console.error('Error creating unique index on sessions table:', err.message);
                    }
                    // Only after all tables/indexes are created, we assign and resolve.
                    console.log('Database tables are ready.');
                    db = newDb;
                    resolve(db);
                });
            });
        });
    });
}

function getDb() {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }
    return db;
}

// Function to insert or update session status in the database (UPSERT - update if exists, insert if not)
function insertSessionStatus(sessionName, status) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        // Use the same timestamp format as system logs: ISO 8601 format with milliseconds
        const timestamp = new Date().toISOString();
        const query = `INSERT OR REPLACE INTO sessions (session_name, status, timestamp) VALUES (?, ?, ?)`;
        db.run(query, [sessionName, status, timestamp], function(err) {
            if (err) {
                console.error('Error inserting/updating session status:', err.message);
                reject(err);
            } else {
                console.log(`Session status updated for: ${sessionName} - ${status}`);
                resolve(this.lastID);
            }
        });
    });
}

// Function to delete all session history from the database
function deleteAllSessionHistory() {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `DELETE FROM sessions`;
        db.run(query, function(err) {
            if (err) {
                console.error('Error deleting session history:', err.message);
                reject(err);
            } else {
                console.log(`Deleted all session history. Removed ${this.changes} records.`);
                resolve(this.changes);
            }
        });
    });
}

// Function to delete session history for a specific session
function deleteSessionHistory(sessionName) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `DELETE FROM sessions WHERE session_name = ?`;
        db.run(query, [sessionName], function(err) {
            if (err) {
                console.error('Error deleting session history:', err.message);
                reject(err);
            } else {
                console.log(`Deleted session history for: ${sessionName}. Removed ${this.changes} records.`);
                resolve(this.changes);
            }
        });
    });
}

// Function to get session history with pagination
function getSessionHistory(limit = 10, offset = 0) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM sessions ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        db.all(query, [limit, offset], (err, rows) => {
            if (err) {
                console.error('Error fetching session history:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get total count of session history
function getSessionHistoryCount() {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `SELECT COUNT(*) as count FROM sessions`;
        db.get(query, (err, row) => {
            if (err) {
                console.error('Error counting session history:', err.message);
                reject(err);
            } else {
                resolve(row.count);
            }
        });
    });
}

// Function to get system logs with pagination
function getSystemLogs(limit = 10, offset = 0) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        db.all(query, [limit, offset], (err, rows) => {
            if (err) {
                console.error('Error fetching system logs:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get total count of system logs
function getSystemLogsCount() {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `SELECT COUNT(*) as count FROM logs`;
        db.get(query, (err, row) => {
            if (err) {
                console.error('Error counting system logs:', err.message);
                reject(err);
            } else {
                resolve(row.count);
            }
        });
    });
}

// Function to delete all system logs from the database
function deleteAllSystemLogs() {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `DELETE FROM logs`;
        db.run(query, function(err) {
            if (err) {
                console.error('Error deleting system logs:', err.message);
                reject(err);
            } else {
                console.log(`Deleted all system logs. Removed ${this.changes} records.`);
                resolve(this.changes);
            }
        });
    });
}

// Function to delete system logs for a specific session
function deleteSystemLogsBySession(sessionId) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `DELETE FROM logs WHERE session_id = ?`;
        db.run(query, [sessionId], function(err) {
            if (err) {
                console.error('Error deleting system logs for session:', err.message);
                reject(err);
            } else {
                console.log(`Deleted system logs for session: ${sessionId}. Removed ${this.changes} records.`);
                resolve(this.changes);
            }
        });
    });
}

module.exports = {
    initDb,
    getDb,
    insertSessionStatus,
    getSessionHistory,
    deleteAllSessionHistory,
    deleteSessionHistory,
    getSessionHistoryCount,
    getSystemLogs,
    getSystemLogsCount,
    deleteAllSystemLogs,
    deleteSystemLogsBySession
};
