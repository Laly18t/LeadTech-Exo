const { createClient } = require('redis');

let isRedisConnected = false;

// Configuration Redis depuis les variables d'environnement
const redisClient = createClient({
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    }

});

console.log('Redis client :', redisClient);

// Gestion des erreurs et connexion
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
    console.log('Redis client Error -->', redisClient);
    isRedisConnected = false;
});

console.log('Tentative de connexion à Redis...', redisClient);

redisClient.on('connect', () => {
    console.log('Connected to Redis successfully');
    isRedisConnected = true;
});

redisClient.on('reconnecting', () => {
    console.log('Redis reconnecting...');
    isRedisConnected = false;
});

redisClient.on('end', () => {
    console.log('Redis connection closed');
    isRedisConnected = false;
});

// S'assurer que Redis est connecté avant d'utiliser le rate limiter
const redisConnectionPromise = redisClient.connect()
    .then(() => {
        isRedisConnected = true;
        console.log('Redis ready for rate limiting');
    })
    .catch((err) => {
        console.error('Failed to connect to Redis:', err);
    });

// Configuration du rate limiter
const RATE_LIMIT_CONFIG = {
    tokensPerSecond: 1,
    bucketSize: 15,
    costPerRequest: 3,
    ttl: 3600 // TTL en secondes (1 heure)
};

/**
 * Extrait l'IP du client de manière robuste
 */
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

/**
 * Vérifie le rate limit pour une requête
 * @param {Object} req - Objet request Express
 * @returns {Object} - { allowed, remaining, resetIn }
 */
async function checkRateLimit(req) {
    const ip = getClientIp(req);
    const now = Date.now();
    const key = `ratelimit:${ip}`;

    try {
        // Récupérer les données de l'utilisateur depuis Redis
        const userData = await redisClient.get(key);

        let tokens, lastRefill;

        if (!userData) {
            // Première requête de cet IP
            tokens = RATE_LIMIT_CONFIG.bucketSize;
            lastRefill = now;
        } else {
            // Parse les données existantes
            const parsed = JSON.parse(userData);
            tokens = parsed.tokens;
            lastRefill = parsed.lastRefill;

            // Calcul du rechargement des tokens
            const timeElapsed = (now - lastRefill) / 1000;
            const tokensToAdd = timeElapsed * RATE_LIMIT_CONFIG.tokensPerSecond;

            tokens = Math.min(
                RATE_LIMIT_CONFIG.bucketSize,
                tokens + tokensToAdd
            );
        }

        // Vérifier si la requête peut être autorisée
        const allowed = tokens >= RATE_LIMIT_CONFIG.costPerRequest;

        if (allowed) {
            tokens -= RATE_LIMIT_CONFIG.costPerRequest;
        }

        // Sauvegarder l'état mis à jour dans Redis
        await redisClient.setEx(
            key,
            RATE_LIMIT_CONFIG.ttl,
            JSON.stringify({
                tokens: tokens,
                lastRefill: now
            })
        );

        console.log(`Rate limit check for IP: ${ip} - Tokens available: ${tokens.toFixed(2)} - Allowed: ${allowed}`);

        // Retourner les informations pour les headers HTTP
        return {
            allowed,
            remaining: Math.floor(tokens / RATE_LIMIT_CONFIG.costPerRequest),
            resetIn: allowed ? null : Math.ceil(
                (RATE_LIMIT_CONFIG.costPerRequest - tokens) /
                RATE_LIMIT_CONFIG.tokensPerSecond
            )
        };
    } catch (error) {
        console.error('Redis error during rate limit check:', error);
        // En cas d'erreur Redis, on autorise la requête pour ne pas bloquer le service
        return {
            allowed: true,
            remaining: -1,
            resetIn: null
        };
    }
}

/**
 * Middleware Express pour le rate limiting
 */
/**
 * Middleware Express pour le rate limiting
 */
function rateLimitMiddleware(req, res, next) {

    checkRateLimit(req)
        .then(result => {
            // Ajouter les headers de rate limit
            res.setHeader('X-RateLimit-Limit', Math.floor(RATE_LIMIT_CONFIG.bucketSize / RATE_LIMIT_CONFIG.costPerRequest));
            res.setHeader('X-RateLimit-Remaining', result.remaining);

            if (!result.allowed) {
                res.setHeader('Retry-After', result.resetIn);
                return res.status(429).json({
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded. Retry after ${result.resetIn} seconds.`,
                    retryAfter: result.resetIn
                });
            }

            next();
        })
        .catch(error => {
            console.error('Rate limit middleware error:', error);
            // En cas d'erreur, on laisse passer la requête
            next();
        });
}


/**
 * Fermeture propre de la connexion Redis
 */
async function closeRedisConnection() {
    await redisClient.quit();
    console.log('Redis connection closed');
}

// Gestion de l'arrêt propre de l'application
process.on('SIGINT', async () => {
    await closeRedisConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeRedisConnection();
    process.exit(0);
});

module.exports = {
    checkRateLimit,
    rateLimitMiddleware,
    redisClient,
    closeRedisConnection
};