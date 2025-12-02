const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const dbDir = path.dirname(dbPath);

// Ensure the directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

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
                // Migration: Check for phone_number column and add if it doesn't exist
                newDb.all("PRAGMA table_info(sessions)", (pragmaErr, columns) => {
                    // If pragma fails, table likely doesn't exist, let CREATE handle it.
                    if (pragmaErr) {
                        console.log('Could not get table info, probably because table does not exist yet. It will be created.');
                    } else if (columns.length > 0) { // Check if table exists and has columns
                        const hasPhoneNumber = columns.some(col => col.name === 'phone_number');
                        if (!hasPhoneNumber) {
                            console.log('Migrating database: Adding phone_number column to sessions table...');
                            newDb.run("ALTER TABLE sessions ADD COLUMN phone_number TEXT", (alterErr) => {
                                if (alterErr) {
                                    console.error('FATAL: Failed to migrate sessions table:', alterErr.message);
                                    return reject(alterErr);
                                }
                                console.log('Database migration successful.');
                            });
                        }
                    }

                    // Create tables (IF NOT EXISTS is safe)
                    newDb.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`, (err) => { if (err) { console.error('Error creating settings table:', err.message); return reject(err); } });
                    newDb.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, message TEXT NOT NULL, session_id TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`, (err) => { if (err) { console.error('Error creating logs table:', err.message); return reject(err); } });
                    newDb.run(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, session_name TEXT NOT NULL UNIQUE, phone_number TEXT, status TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`, (err) => {
                        if (err) { console.error('Error creating sessions table:', err.message); return reject(err); }
                        
                        console.log('Database tables are ready.');
                        db = newDb;
                        resolve(db);
                    });
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

function insertSessionStatus(sessionName, status) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const timestamp = new Date().toISOString();
        
        // Safer approach: Check if exists, then INSERT or UPDATE.
        // This works even without the UNIQUE constraint on the column itself.
        db.get("SELECT 1 FROM sessions WHERE session_name = ?", [sessionName], (err, row) => {
            if (err) {
                console.error('Error checking session existence:', err.message);
                return reject(err);
            }

            if (row) {
                // Row exists, so UPDATE
                const updateQuery = `UPDATE sessions SET status = ?, timestamp = ? WHERE session_name = ?`;
                db.run(updateQuery, [status, timestamp, sessionName], function(updateErr) {
                    if (updateErr) {
                        console.error('Error updating session status:', updateErr.message);
                        reject(updateErr);
                    } else {
                        console.log(`Session status updated for: ${sessionName} - ${status}`);
                        resolve({ changes: this.changes });
                    }
                });
            } else {
                // Row does not exist, so INSERT
                const insertQuery = `INSERT INTO sessions (session_name, status, timestamp) VALUES (?, ?, ?)`;
                db.run(insertQuery, [sessionName, status, timestamp], function(insertErr) {
                    if (insertErr) {
                        console.error('Error inserting session status:', insertErr.message);
                        reject(insertErr);
                    } else {
                        console.log(`Session status inserted for: ${sessionName} - ${status}`);
                        resolve({ lastID: this.lastID });
                    }
                });
            }
        });
    });
}

// Function to update just the phone number for a session
function updateSessionPhoneNumber(sessionName, phoneNumber) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `UPDATE sessions SET phone_number = ? WHERE session_name = ?`;
        db.run(query, [phoneNumber, sessionName], function(err) {
            if (err) {
                console.error('Error updating phone number:', err.message);
                reject(err);
            } else {
                console.log(`Phone number updated for: ${sessionName}`);
                resolve({ changes: this.changes });
            }
        });
    });
}

// Function to get all sessions from the database
function getAllSessions() {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM sessions`;
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error fetching all sessions:', err.message);
                reject(err);
            } else {
                resolve(rows);
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

// Function to get session history with pagination and optional search
function getSessionHistory(limit = 10, offset = 0, search = null) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        let query = `SELECT * FROM sessions`;
        const params = [];

        if (search && search.trim() !== '') {
            query += ` WHERE session_name LIKE ? OR status LIKE ?`;
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error('Error fetching session history:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get total count of session history with optional search
function getSessionHistoryCount(search = null) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        let query = `SELECT COUNT(*) as count FROM sessions`;
        const params = [];

        if (search && search.trim() !== '') {
            query += ` WHERE session_name LIKE ? OR status LIKE ?`;
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        db.get(query, params, (err, row) => {
            if (err) {
                console.error('Error counting session history:', err.message);
                reject(err);
            } else {
                resolve(row.count);
            }
        });
    });
}

// Function to get system logs with pagination and optional search
function getSystemLogs(limit = 10, offset = 0, search = null) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        let query = `SELECT * FROM logs`;
        const params = [];

        if (search && search.trim() !== '') {
            query += ` WHERE message LIKE ? OR type LIKE ? OR session_id LIKE ?`;
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error('Error fetching system logs:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get total count of system logs with optional search
function getSystemLogsCount(search = null) {
    if (!db) {
        throw new Error("Database not initialized. Call initDb first.");
    }

    return new Promise((resolve, reject) => {
        let query = `SELECT COUNT(*) as count FROM logs`;
        const params = [];

        if (search && search.trim() !== '') {
            query += ` WHERE message LIKE ? OR type LIKE ? OR session_id LIKE ?`;
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        db.get(query, params, (err, row) => {
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
    updateSessionPhoneNumber,
    getAllSessions,
    getSessionHistory,
    deleteAllSessionHistory,
    deleteSessionHistory,
    getSessionHistoryCount,
    getSystemLogs,
    getSystemLogsCount,
    deleteAllSystemLogs,
    deleteSystemLogsBySession
};
