const { PubSub } = require('@google-cloud/pubsub');
const { Storage } = require('@google-cloud/storage');
const Zip = require('zip-stream').default;
const got = require('got').default;
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const flickrService = require('./photo_model');
const db = require('./firebase');
const { ref, set } = require('firebase-admin/database');


// Initialisation des clients
const pubSubClient = new PubSub({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

const bucketName = 'dmii2025bucket';
const subscriptionNumber = process.env.PUBSUB_TOPIC_NUMBER;
const subscriptionName = `dmii-${subscriptionNumber}`;

let messageCount = 0;

// Variable globale pour stocker l'état des jobs
global.completedJobs = {};

/**
 * Récupère les 10 premières photos depuis Flickr
 * @param {string} tags - Les tags à rechercher
 * @returns {Promise<Array>} - Liste des photos
 */
async function get10FlickrPhotos(tags) {
    try {
        console.log(`Recherche de photos pour les tags: ${tags}`);

        const photos = await flickrService.getFlickrPhotos(tags, 'any');

        // Prendre seulement les 10 premières
        const limitedPhotos = photos.slice(0, 10);

        console.log(`${limitedPhotos.length} photos trouvées`);

        return limitedPhotos;

    } catch (error) {
        console.error('Erreur lors de la récupération des photos Flickr:', error);
        throw error;
    }
}

/**
 * Crée un zip avec les images et l'upload sur Google Cloud Storage
 * @param {Array} photos - Liste des photos Flickr
 * @param {string} tags - Les tags (pour le nom du fichier)
 * @returns {Promise<string>} - URL publique du fichier zip
 */

async function createAndUploadZip(photos, tags) {
    return new Promise(async (resolve, reject) => {
        try {
            const filename = `${tags.replace(/,/g, '_')}_${uuidv4()}`;
            const filePath = `zips/${filename}.zip`;
            const file = storage.bucket(bucketName).file(filePath);
            let zipUrl = null;

            const gcsStream = file.createWriteStream({
                metadata: {
                    contentType: 'application/zip',
                    cacheControl: 'public, max-age=3600'
                },
                resumable: false
            });

            gcsStream.on('error', reject);
            gcsStream.on('finish', async () => {
                const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
                const options = {
                    action: 'read',
                    expires: moment().add(2, 'days').unix() * 1000
                };
                const signedUrls = await storage
                    .bucket(bucketName)
                    .file(filePath)
                    .getSignedUrl(options);
                zipUrl = signedUrls[0];
                resolve(signedUrls[0]);

                saveZipData(filename, zipUrl, file)
                    .catch(console.error); 
            });

            // Création du flux ZIP
            console.log(`Création du flux ZIP pour ${photos.length} images...`, Zip);
            const zip = new Zip();
            zip.pipe(gcsStream);

            console.log(`Téléchargement et compression de ${photos.length} images...`);

            for (const [i, photo] of photos.entries()) {
                const name = `photo_${i + 1}_${photo.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.jpg`;
                console.log(`[${i + 1}/${photos.length}] Ajout de ${name}`);

                try {
                    const imageStream = got(photo.media.b, { isStream: true });
                    await new Promise((res, rej) => {
                        zip.entry(imageStream, { name }, (err) => (err ? rej(err) : res()));
                    });
                } catch (err) {
                    console.error(`Erreur lors de l’ajout de ${name} :`, err.message);
                }
            }

            // TODO : ajouter le zip au firebase database 

            

            zip.finalize();
        } catch (err) {
            reject(err);
        }
    });
}

async function saveZipData(filename, storagePath, publicUrl) {
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `laly/${now}/${filename}`;

    const data = {
        filename,
        storagePath,
        publicUrl: '/test',
        createdAt: now,
    };

    const dataRef = db.ref('zips');
    dataRef.set({
        [filename]: data
    });
    console.log(`✅ Données enregistrées dans Firebase : ${path}`);
}

/**
 * Traite une demande de zip
 * @param {string} tags - Les tags des photos à zipper
 * @returns {Promise<void>}
 */
async function processZipRequest(tags) {
    console.log(`\n Début du traitement pour les tags: ${tags}`);

    try {
        // 1. Récupérer les photos depuis Flickr
        const photos = await get10FlickrPhotos(tags);

        if (photos.length === 0) {
            console.warn('Aucune photo trouvée pour ces tags');
            // Stocker l'échec dans la variable globale
            global.completedJobs[tags] = {
                status: 'failed',
                error: 'No photos found',
                timestamp: new Date().toISOString()
            };
            return;
        }

        // 2. Créer le zip et l'uploader sur GCS
        const zipUrl = await createAndUploadZip(photos, tags);

        // 3. Stocker le succès dans la variable globale
        global.completedJobs[tags] = {
            status: 'success',
            url: zipUrl,
            photoCount: photos.length,
            timestamp: new Date().toISOString()
        };

        console.log(`Traitement terminé avec succès pour: ${tags}`);
        console.log(`URL du zip: ${zipUrl}`);
        console.log(`Photos: ${photos.length}`);

    } catch (error) {
        console.error(`Erreur lors du traitement pour ${tags}:`, error);

        // Stocker l'échec dans la variable globale
        global.completedJobs[tags] = {
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
        };

        throw error;
    }
}

/**
 * Handler pour traiter les messages reçus
 */
function messageHandler(message) {
    messageCount += 1;

    console.log('\n========================================');
    console.log(`Message reçu #${messageCount}`);
    console.log(`ID: ${message.id}`);
    console.log(`Publié le: ${message.publishTime}`);

    try {
        const data = message.data.toString();
        const messageData = JSON.parse(data);

        console.log('Données:', messageData, 'Tags à zipper:', messageData.tags);

        console.log("ici ---->", messageData);
        // Traitement de la demande de zip
        processZipRequest(messageData.tags)
            .then(() => {
                console.log('Traitement du zip terminé avec succès');
                message.ack();
            })
            .catch(error => {
                console.error('Erreur lors du traitement du zip:', error);
                // Nack pour réessayer plus tard
                message.nack();
            });

    } catch (error) {
        console.error('Erreur lors du parsing du message:', error);
        message.ack();
    }

    console.log('========================================\n');
}

/**
 *  Handler pour les erreurs de subscription
 *  @param {Error} error - L'erreur survenue
 */
function errorHandler(error) {
    console.error('Erreur sur la subscription :', error);
}

/**
 *  Démarre l'écoute des messages sur la subscription
 */
function startListening() {
    try {
        console.log('\nDémarrage du client Pub/Sub');
        console.log(`Subscription: ${subscriptionName}`);
        console.log('En attente de messages...\n');

        const subscription = pubSubClient.subscription(subscriptionName);

        // Écoute des messages
        subscription.on('message', messageHandler);

        // Écoute des erreurs
        subscription.on('error', errorHandler);

        console.log('Client démarré');

        return subscription;

    } catch (error) {
        console.error('Erreur lors du démarrage du client:', error);
        throw error;
    }
}

/**
 *  Arrête proprement l'écoute des messages
 *  @param {Object} subscription - La subscription à arrêter
 */
function stopListening(subscription) {
    if (subscription) {
        subscription.removeAllListeners();
        console.log('\n Client Pub/Sub arrêté');
        console.log(`Total de messages traités: ${messageCount}`);
    }
}

/**
 * Récupère l'état d'un job
 */
function getJobStatus(tags) {
    return global.completedJobs[tags] || null;
}

/**
 * Récupère tous les jobs
 */
function getAllJobs() {
    return global.completedJobs;
}

module.exports = {
    startListening,
    stopListening,
    getJobStatus,
    getAllJobs,
    processZipRequest
};