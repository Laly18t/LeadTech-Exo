require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');

// Initialisation du client PubSub
const pubSubClient = new PubSub({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

const subscriptionNumber = process.env.PUBSUB_TOPIC_NUMBER;
const subscriptionName = `dmii-${subscriptionNumber}`;

let messageCount = 0;

/**
 *  Handler pour traiter les messages reçus
 *  @param {Object} message - Le message Pub/Sub reçu
 */
function messageHandler(message) {
    messageCount += 1;

    console.log('\n========================================');
    console.log(`Message reçu #${messageCount}`);
    console.log(`ID: ${message.id}`);
    console.log(`Publié le: ${message.publishTime}`);

    try {
        // Décodage des données du message
        const data = message.data.toString();
        const messageData = JSON.parse(data);

        console.log('Données:', messageData);
        console.log('Tags à zipper:', messageData.tags);

        // Affichage des attributs
        if (message.attributes) {
            console.log('Attributs:', message.attributes);
        }

        // TODO: Implémenter la logique de création du zip ici
        // 1. Récupérer les photos avec getFlickrPhotos(messageData.tags, tagmode)
        // 2. Télécharger les images
        // 3. Créer un fichier zip
        // 4. Sauvegarder ou envoyer le zip

        processZipRequest(messageData.tags)
            .then(() => {
                console.log('Traitement du zip terminé avec succès');
                // Acknowledge (acquitter) le message pour le retirer de la queue
                message.ack();
            })
            .catch(error => {
                console.error('Erreur lors du traitement du zip:', error);
                message.nack();
            });

    } catch (error) {
        console.error('Erreur lors du parsing du message:', error);
        // Acquitter le message malformé pour ne pas le retraiter indéfiniment
        message.ack();
    }

    console.log('========================================\n');
}

/**
 *  Fonction pour traiter la demande de zip
 *  @param {string} tags - Les tags des photos à zipper
 *  @returns {Promise<void>}
 */
async function processZipRequest(tags) {
    // TODO: Implémenter la logique de création du zip
    console.log(`Début du traitement des tags : ${tags}`);

    // Simulation d'un traitement
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`Traitement simulé terminé pour : ${tags}`);
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
        console.log('\n Consumer Pub/Sub arrêté');
        console.log(`Total de messages traités: ${messageCount}`);
    }
}

module.exports = {
    startListening,
    stopListening,
    messageHandler,
    processZipRequest
};