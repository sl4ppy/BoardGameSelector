const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database/boardgames.db');
const db = new sqlite3.Database(dbPath);

const initialize = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_full_sync DATETIME
            )`, (err) => {
                if (err) reject(err);
            });

            // Add last_full_sync column if it doesn't exist (migration)
            db.run(`ALTER TABLE users ADD COLUMN last_full_sync DATETIME`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.warn('Migration warning:', err.message);
                }
            });

            // Collections table
            db.run(`CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                data TEXT NOT NULL,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) reject(err);
            });

            // Games cache table (for enriched game data)
            db.run(`CREATE TABLE IF NOT EXISTS games_cache (
                game_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) reject(err);
            });

            // Play data cache
            db.run(`CREATE TABLE IF NOT EXISTS play_data_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                game_id TEXT NOT NULL,
                last_played DATE,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username, game_id)
            )`, (err) => {
                if (err) reject(err);
            });

            // Create indexes
            db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`, (err) => {
                if (err) reject(err);
            });

            db.run(`CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id)`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
};

const getUser = (username) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const createUser = (username) => {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO users (username) VALUES (?)', [username], function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, username });
        });
    });
};

const updateUserAccess = (userId) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE users SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?', [userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const updateUserFullSync = (userId) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE users SET last_full_sync = CURRENT_TIMESTAMP WHERE id = ?', [userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const getCollection = (userId) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM collections WHERE user_id = ? ORDER BY fetched_at DESC LIMIT 1',
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
};

const saveCollection = (userId, data) => {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO collections (user_id, data) VALUES (?, ?)',
            [userId, JSON.stringify(data)],
            function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            }
        );
    });
};

const getGameCache = (gameIds) => {
    return new Promise((resolve, reject) => {
        const placeholders = gameIds.map(() => '?').join(',');
        db.all(
            `SELECT * FROM games_cache WHERE game_id IN (${placeholders})`,
            gameIds,
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
};

const saveGameCache = (gameId, data) => {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO games_cache (game_id, data) VALUES (?, ?)',
            [gameId, JSON.stringify(data)],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

const getPlayData = (username, gameId) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM play_data_cache WHERE username = ? AND game_id = ?',
            [username, gameId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
};

const savePlayData = (username, gameId, lastPlayed) => {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO play_data_cache (username, game_id, last_played) VALUES (?, ?, ?)',
            [username, gameId, lastPlayed],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

module.exports = {
    initialize,
    getUser,
    createUser,
    updateUserAccess,
    updateUserFullSync,
    getCollection,
    saveCollection,
    getGameCache,
    saveGameCache,
    getPlayData,
    savePlayData
};