const { chatWithConcierge } = require('../services/conciergeService');
const logger = require('../utils/logger');

const chat = async (req, res) => {
  const { message, history, bookingContext } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required', requestId: req.id });
  }

  try {
    const result = await chatWithConcierge({ message: message.trim(), history, bookingContext });
    return res.json({ success: true, ...result, requestId: req.id });
  } catch (error) {
    logger.error('Concierge chat failed: %o requestId=%s', error, req.id);
    return res.status(error.status || 502).json({
      success: false,
      error: error.status === 503 ? error.message : 'The concierge is temporarily unavailable. Please contact the hotel directly.',
      requestId: req.id
    });
  }
};

module.exports = { chat };