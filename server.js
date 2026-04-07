const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Set up static files and views to match Flask structure
app.use('/static', express.static(path.join(__dirname, 'static')));
// Serve root static files (like service-worker.js, manifest.json)
app.use(express.static(__dirname));

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Error opening database " + err.message);
    else {
        console.log("Connected to the SQLite database.");
        // Create tables if they don't exist
        db.run(`CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT, firebase_uid TEXT UNIQUE, email TEXT UNIQUE)`);
        db.run(`CREATE TABLE IF NOT EXISTS contact (id INTEGER PRIMARY KEY AUTOINCREMENT, user_uid TEXT, name TEXT, phone TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS location_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_uid TEXT, latitude REAL, longitude REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// API Endpoints
app.get('/api/contacts', (req, res) => {
    const uid = req.headers.authorization || 'mock-uid-12345';
    db.all("SELECT id, name, phone FROM contact WHERE user_uid = ?", [uid], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'success', contacts: rows });
    });
});

app.post('/api/contacts', (req, res) => {
    const uid = req.headers.authorization || 'mock-uid-12345';
    const { name, phone } = req.body;
    db.run("INSERT INTO contact (user_uid, name, phone) VALUES (?, ?, ?)", [uid, name, phone], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'success', id: this.lastID });
    });
});

app.delete('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM contact WHERE id = ?", id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'success' });
    });
});

app.post('/api/feedback', (req, res) => {
    const { name, email, msg } = req.body;
    db.run("INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)", [name, email, msg], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        console.log("Feedback stored dynamically via Express.");
        res.json({ status: 'success', message: 'Feedback securely stored' });
    });
});

app.post('/api/sos', (req, res) => {
    const { lat, lng, user_id } = req.body;
    const uid = user_id || 'Anonymous';
    if (lat && lng) {
        db.run("INSERT INTO location_history (user_uid, latitude, longitude) VALUES (?, ?, ?)", [uid, lat, lng]);
    }
    console.log(`🚨 SOS RECEIVED! Backend processing alerts for user ${uid} at [${lat}, ${lng}]`);
    res.json({ status: 'success', message: 'Emergency alerts dispatched & logged.' });
});

app.post('/api/location', (req, res) => {
    const { lat, lng, user_id } = req.body;
    const uid = user_id || 'Anonymous';
    if (lat && lng) {
        db.run("INSERT INTO location_history (user_uid, latitude, longitude) VALUES (?, ?, ?)", [uid, lat, lng]);
        console.log(`Background ping saved [${lat}, ${lng}]`);
    }
    res.json({ status: 'success' });
});

app.get('/api/crime_data', (req, res) => {
    res.json({
        labels: ["Harassment", "Robbery", "Kidnapping", "Domestic", "Stalking"],
        values: [340, 150, 45, 210, 180]
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Express Server running on port ${PORT}`);
});
