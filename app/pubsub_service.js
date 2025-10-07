require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');

// init
const pubsub = new PubSub({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

const topicNumber = process.env.PUBSUB_TOPIC_NUMBER;
const topicName = `dmii-${topicNumber}`;

/**
 *  publie un message dans la queue pub/sub
 *  @param {string} tags = les tags a zipper
 *  @returns {Promise<string>} = l'ID du message publie
 */
async function publishZipRequest(tags) {
    try {
        const topic = pubsub.topic(topicName);

        // creation message
        const messageData = {
            tags: tags,
            timestamp: new Date().toISOString(),
            action: 'zip'
        };

        const dataBuffer = Buffer.from(JSON.stringify(messageData));

        // publication message
        const messageId = await topic.publishMessage({
            data: dataBuffer,
            attributes: {
                origin: 'web-app',
                type: 'zip-request'
            }
        });

        console.log(`Message publié avec succès --- ID : ${messageId}`);
        console.log(`Topic : ${topicName}`);
        console.log(`Données :`, messageData);

        return messageId;

    } catch (error) {
        console.error('Erreur lors de la publication du message :', error);
        throw error;
    }
}

/**
 *  verifie que le topic existe
 *  @returns {Promise<boolean>}
 */
async function checkTopicExists() {
    try {
        const topic = pubsub.topic(topicName);
        const [exists] = await topic.exists();

        if (!exists) {
            console.warn(`Le topic ${topicName} n'existe pas dans le projet ${process.env.GOOGLE_CLOUD_PROJECT_ID}`);
        } else {
            console.log(`Topic ${topicName} trouvé`);
        }

        return exists;
    } catch (error) {
        console.error('Erreur lors de la vérification du topic :', error);
        return false;
    }
}

module.exports = {
    publishZipRequest,
    checkTopicExists
};