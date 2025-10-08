const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');
const key = require('./../../dmii-2025-d3c4bf954d39.json');

// Chargement de la clé du compte de service
console.log('Chargement de la clé du compte de service Firebase...');

let serviceAccount;
try {
    serviceAccount = key;
    console.log('Clé Firebase chargée avec succès');
} catch (error) {
    console.error('Impossible de charger la clé du compte de service :', error);
    process.exit(1);
}

// Initialisation du SDK Firebase
console.log('Initialisation de Firebase Admin SDK...');
const app = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: 'https://dmii-2025-default-rtdb.firebaseio.com',
});

// Connexion à la Realtime Database
const db = getDatabase(app);

// Test de connexion (écriture simple)
(async () => {
    try {
        const ref = db.ref('debug/connectionTest');
        await ref.set({
            status: 'connected',
            timestamp: new Date().toISOString(),
        });
        console.log('Connexion à Firebase Realtime Database réussie !');
    } catch (error) {
        console.error('Erreur lors de la connexion à Firebase Realtime Database :', error);
    }
})();

module.exports = db;
