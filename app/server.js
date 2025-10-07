require('dotenv').config();
const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');
const app = express();
const {pubSubClient} = require('./pubsub_client.js');

// public assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')));
app.use('/coverage', express.static(path.join(__dirname, '..', 'coverage')));

// ejs for view templates
app.engine('.html', require('ejs').__express);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// Middleware pour parser le body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// load route
require('./route')(app);

// server
const port = process.env.PORT || 3000;
app.server = app.listen(port, () => {
    console.log(`listening on port ${port}`);

    // Démarrage du consumer Pub/Sub après le démarrage du serveur
    if(pubSubClient) {
        const subscription = pubSubClient.startListening();

        // Sauvegarde de la subscription pour un arrêt propre
        app.pubsubSubscription = subscription;
    }
});

module.exports = app;
