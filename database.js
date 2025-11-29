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
                    // Only after the last table is created, we assign and resolve.
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

module.exports = { initDb, getDb };
