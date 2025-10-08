import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import serviceAccount from process.env.FIREBASE_KEY_URL assert { type: 'json' };

// Initialisation avec la clé du compte de service
const app = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_URL
});

const db = getDatabase(app);
console.log('Firebase initialized', db);
export default db;