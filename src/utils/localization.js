/**
 * Localization & Multi-Currency Service
 * Requirement 43-45
 */
const CURRENCY_RATES = {
  INR: 1.0,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0094,
  AED: 0.044,
};

const convertCurrency = (amount, from, to) => {
  const baseAmount = amount / (CURRENCY_RATES[from] || 1.0);
  return baseAmount * (CURRENCY_RATES[to] || 1.0);
};

const formatCurrency = (amount, currency, locale = 'en-IN') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

module.exports = {
  CURRENCY_RATES,
  convertCurrency,
  formatCurrency,
};
