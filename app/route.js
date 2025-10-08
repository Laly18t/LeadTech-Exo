const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const { publishZipRequest } = require('./pubsub_service.js');
const pubsubClient = require('./pubsub_client.js');
const moment = require('moment');
const { rateLimitMiddleware } = require('./rateLimiter.js');
require('dotenv').config();

function route(app) {
  app.get('/', (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    // get photos from flickr public feed api
    return photoModel
      .getFlickrPhotos(tags, tagmode)
      .then(photos => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;
        return res.render('index', ejsLocalVariables);
      })
      .catch(error => {
        console.log('aspdfonaposd', error)
        return res.status(500).send({ error });
      });
  });

  // Recup des tags depuis les query params
  app.post('/zip', rateLimitMiddleware, async (req, res) => {
    
    try {
      const tags = req.query.tags; // tag recup depuis le query

      const ejsLocalVariables = {
      zipReady: false,
      zipUrl: null
    };

      if (!tags) {
        return res.status(400).json({
          success: false,
          error: 'Les tags sont requis'
        });
      }

      // publication dans la queue
      const messageId = await publishZipRequest(tags);

      return res.json({
        success: true,
        message: 'Demande de zip envoyée',
        tags: tags,
        messageId: messageId,
        queueTopic: `dmii-${process.env.PUBSUB_TOPIC_NUMBER}`
      });
      // return res.render('index', ejsLocalVariables);

    } catch (error) {
      console.error('Erreur dans l\'endpoint /zip:', error);

      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi de la demande de zip',
        details: error.message
      });
    }
  });

  // Endpoint pour vérifier l'état d'un job
  app.get('/job-status/:tags', (req, res) => {
    const tags = req.params.tags;
    const jobStatus = pubsubClient.getJobStatus(tags);

    if (jobStatus) {
      res.json(jobStatus);
    } else {
      res.status(404).json({
        error: 'Job not found',
        tags: tags
      });
    }
  });

  // Endpoint pour lister tous les jobs
  app.get('/jobs', (req, res) => {
    const allJobs = getAllJobs();
    res.json(allJobs);
  });
}

module.exports = route;
