const { getForexRates } = require('../services/forexService');
const logger = require('../utils/logger');

const rates = async (req, res) => {
  try {
    const result = await getForexRates();
    res.json({ success: true, ...result, requestId: req.id });
  } catch (error) {
    logger.error('Forex rates request failed: %o requestId=%s', error, req.id);
    res.status(503).json({
      success: false,
      error: 'Live exchange rates are temporarily unavailable. Please ask at the front desk.',
      requestId: req.id
    });
  }
};

module.exports = { rates };
