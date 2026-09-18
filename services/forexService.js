const logger = require('../utils/logger');

const CACHE_TTL_MS = 20 * 60 * 1000;
const currencies = ['USD', 'EUR', 'GBP', 'AED', 'SAR'];
const providerUrl = process.env.FOREX_API_URL || 'https://open.er-api.com/v6/latest/ETB';
let cache = null;

const fetchProviderRates = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(providerUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Forex provider returned ${response.status}`);
    const payload = await response.json();
    if (payload.result && payload.result !== 'success') throw new Error('Forex provider returned an unsuccessful result');

    const rates = Object.fromEntries(currencies.map((currency) => {
      const quotedRate = Number(payload.rates?.[currency]);
      return [currency, quotedRate > 0 ? Number((1 / quotedRate).toFixed(4)) : null];
    }));

    if (Object.values(rates).some((rate) => rate === null)) {
      throw new Error('Forex provider response was missing a required currency');
    }

    return {
      base: 'ETB',
      rates,
      updatedAt: new Date().toISOString(),
      stale: false,
      source: 'open.er-api.com'
    };
  } finally {
    clearTimeout(timeout);
  }
};

const getForexRates = async () => {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }

  try {
    const data = await fetchProviderRates();
    cache = { data, fetchedAt: now };
    return { ...data, cached: false };
  } catch (error) {
    logger.warn('Forex provider request failed; using cached rates: %s', error.message);
    if (cache) return { ...cache.data, cached: true, stale: true };
    throw error;
  }
};

const resetForexCache = () => {
  cache = null;
};

module.exports = { getForexRates, resetForexCache, currencies };
