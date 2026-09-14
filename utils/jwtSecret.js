const { environment } = require('../config');

const jwtSecret = process.env.JWT_SECRET || (environment === 'development' ? 'dev-secret-key' : null);

if (!jwtSecret && environment === 'production') {
  throw new Error('JWT_SECRET must be set when NODE_ENV is production.');
}

module.exports = jwtSecret;