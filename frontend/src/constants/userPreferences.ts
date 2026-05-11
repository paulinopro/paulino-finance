/**
 * Mantén alineado con `backend/src/constants/userPreferences.ts` (ALLOWED_*).
 */

export const SETTINGS_CURRENCY_OPTIONS = [
  { code: 'DOP' as const, label: 'Peso dominicano', symbol: 'RD$', hint: 'RD$1, RD$5, RD$10, RD$25' },
  { code: 'USD' as const, label: 'Dólar estadounidense', symbol: '$', hint: '$1, $5, $10, $20' },
  { code: 'EUR' as const, label: 'Euro', symbol: '€', hint: '€5, €10, €20, €50' },
  { code: 'GBP' as const, label: 'Libra esterlina', symbol: '£', hint: '£5, £10, £20' },
  { code: 'JPY' as const, label: 'Yen japonés', symbol: '¥', hint: '¥100, ¥500, ¥1000' },
  { code: 'CNY' as const, label: 'Yuan chino', symbol: '¥', hint: '¥1, ¥5, ¥10, ¥100' },
  { code: 'MXN' as const, label: 'Peso mexicano', symbol: '$', hint: '$20, $50, $100' },
  { code: 'CAD' as const, label: 'Dólar canadiense', symbol: 'CA$', hint: 'CA$5, CA$10, CA$20' },
  { code: 'AUD' as const, label: 'Dólar australiano', symbol: 'A$', hint: 'A$5, A$10, A$20' },
  { code: 'CHF' as const, label: 'Franco suizo', symbol: 'CHF', hint: 'CHF 10, 20, 50' },
  { code: 'BRL' as const, label: 'Real brasileño', symbol: 'R$', hint: 'R$2, R$5, R$10, R$20' },
  { code: 'ARS' as const, label: 'Peso argentino', symbol: '$', hint: '$100, $200, $500' },
  { code: 'COP' as const, label: 'Peso colombiano', symbol: '$', hint: '$1000, $2000, $5000, $10000' },
];

export const SETTINGS_LOCALE_OPTIONS = [
  { code: 'es' as const, label: 'Español' },
  { code: 'en' as const, label: 'English' },
  { code: 'de' as const, label: 'Deutsch' },
];
