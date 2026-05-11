import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import type { User } from '../types';
import {
  localeTagFromUiLanguage,
  formatCurrencyAmount,
  formatDecimalAmount,
  formatIntegerLocale,
  formatDatePreset,
  formatYmdShort,
  formatDateTimeShortMdHm,
  formatDateTimeMedium,
  currencyNarrowSymbol as currencyNarrowSymbolFmt,
  currencySelectLabel as currencySelectLabelFmt,
  type DateFmtPreset,
} from '../utils/localeFormat';

export type { DateFmtPreset };

export function defaultSecondaryForPrimary(primary: string): string {
  return primary.trim().toUpperCase() === 'USD' ? 'DOP' : 'USD';
}

/** Par estable (igual que backend `resolvedCurrencyPairFromRow`). */
export function resolvedCurrencyPairFromUser(user: User | null): { primary: string; secondary: string } {
  const primary = (user?.currencyPreference ?? 'DOP').trim().toUpperCase();
  let secondary = (user?.secondaryCurrencyPreference ?? '').trim().toUpperCase();
  if (!secondary || secondary === primary) {
    secondary = defaultSecondaryForPrimary(primary);
  }
  return { primary, secondary };
}

/** Monedas del libro / cuentas (principal y secundaria del usuario), orden fijo. */
export function ledgerCurrenciesOrdered(primary: string, secondary: string): string[] {
  const p = primary.trim().toUpperCase();
  const s = secondary.trim().toUpperCase();
  if (!p) return [];
  if (!s || s === p) return [p];
  return [p, s];
}

export interface IntlFormattingContextValue {
  localeTag: string;
  defaultCurrency: string;
  primaryCurrency: string;
  secondaryCurrency: string;
  /** Opciones de moneda para gastos, ingresos, préstamos, presupuestos, etc. */
  transactionCurrencyOptions: string[];
  defaultTransactionCurrency: string;
  /** Monedas del libro (mismo par que preferencias). */
  ledgerCurrencyOptions: string[];
  defaultLedgerCurrency: string;
  /** Cuentas/tarjetas nuevas: DUAL si hay dos monedas distintas en el par. */
  defaultBankMoneyCurrencyType: 'DOP' | 'USD' | 'DUAL';
  formatCurrency: (amount: number, currency?: string, options?: Intl.NumberFormatOptions) => string;
  formatDecimal: (amount: number, min?: number, max?: number) => string;
  formatInt: (amount: number) => string;
  currencySymbol: (currencyCode: string) => string;
  currencySelectLabel: (currencyCode: string) => string;
  formatDatePresetLocalized: (value: Date | string | number, preset: DateFmtPreset) => string;
  formatYmdShortLocalized: (ymd: string) => string;
  formatDateTimeShort: (value: Date | string | number) => string;
  formatDateTimeMedium: (value: Date | string | number) => string;
}

const IntlFormattingContext = createContext<IntlFormattingContextValue | undefined>(undefined);

export const IntlFormattingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const localeTag = useMemo(() => localeTagFromUiLanguage(user?.localePreference), [user?.localePreference]);
  const pair = useMemo(() => resolvedCurrencyPairFromUser(user), [user]);
  const primaryCurrency = pair.primary;
  const secondaryCurrency = pair.secondary;
  const defaultCurrency = primaryCurrency;
  const transactionCurrencyOptions = useMemo(() => [pair.primary, pair.secondary], [pair.primary, pair.secondary]);
  const defaultTransactionCurrency = pair.primary;
  const ledgerCurrencyOptions = useMemo(
    () => ledgerCurrenciesOrdered(pair.primary, pair.secondary),
    [pair.primary, pair.secondary]
  );
  const defaultLedgerCurrency = useMemo(
    () => ledgerCurrencyOptions[0] ?? primaryCurrency,
    [ledgerCurrencyOptions, primaryCurrency]
  );
  const defaultBankMoneyCurrencyType = useMemo((): 'DOP' | 'USD' | 'DUAL' => {
    if (ledgerCurrencyOptions.length >= 2) return 'DUAL';
    return 'DOP';
  }, [ledgerCurrencyOptions]);

  const formatCurrency = useCallback(
    (amount: number, currency?: string, options?: Intl.NumberFormatOptions) =>
      formatCurrencyAmount(amount, currency ?? defaultCurrency, localeTag, options),
    [localeTag, defaultCurrency]
  );

  const formatDecimal = useCallback(
    (amount: number, min = 2, max = 2) => formatDecimalAmount(amount, localeTag, min, max),
    [localeTag]
  );

  const formatInt = useCallback((amount: number) => formatIntegerLocale(amount, localeTag), [localeTag]);

  const currencySymbol = useCallback(
    (currencyCode: string) => currencyNarrowSymbolFmt(currencyCode, localeTag),
    [localeTag]
  );

  const currencySelectLabel = useCallback(
    (currencyCode: string) => {
      const c = currencyCode.toUpperCase();
      if (c === 'DUAL') {
        const a = currencyNarrowSymbolFmt(primaryCurrency, localeTag);
        const b = currencyNarrowSymbolFmt(secondaryCurrency, localeTag);
        return `${a} + ${b} (DUAL)`;
      }
      return currencySelectLabelFmt(currencyCode, localeTag);
    },
    [localeTag, primaryCurrency, secondaryCurrency]
  );

  const formatDatePresetLocalized = useCallback(
    (value: Date | string | number, preset: DateFmtPreset) => formatDatePreset(value, localeTag, preset),
    [localeTag]
  );

  const formatYmdShortLocalized = useCallback((ymd: string) => formatYmdShort(ymd, localeTag), [localeTag]);

  const formatDateTimeShort = useCallback(
    (value: Date | string | number) => formatDateTimeShortMdHm(value, localeTag),
    [localeTag]
  );

  const formatDateTimeMediumCb = useCallback(
    (value: Date | string | number) => formatDateTimeMedium(value, localeTag),
    [localeTag]
  );

  const value = useMemo(
    () => ({
      localeTag,
      defaultCurrency,
      primaryCurrency,
      secondaryCurrency,
      transactionCurrencyOptions,
      defaultTransactionCurrency,
      ledgerCurrencyOptions,
      defaultLedgerCurrency,
      defaultBankMoneyCurrencyType,
      formatCurrency,
      formatDecimal,
      formatInt,
      currencySymbol,
      currencySelectLabel,
      formatDatePresetLocalized,
      formatYmdShortLocalized,
      formatDateTimeShort,
      formatDateTimeMedium: formatDateTimeMediumCb,
    }),
    [
      localeTag,
      defaultCurrency,
      primaryCurrency,
      secondaryCurrency,
      transactionCurrencyOptions,
      defaultTransactionCurrency,
      ledgerCurrencyOptions,
      defaultLedgerCurrency,
      defaultBankMoneyCurrencyType,
      formatCurrency,
      formatDecimal,
      formatInt,
      currencySymbol,
      currencySelectLabel,
      formatDatePresetLocalized,
      formatYmdShortLocalized,
      formatDateTimeShort,
      formatDateTimeMediumCb,
    ]
  );

  return <IntlFormattingContext.Provider value={value}>{children}</IntlFormattingContext.Provider>;
};

export const useIntlFormatting = (): IntlFormattingContextValue => {
  const ctx = useContext(IntlFormattingContext);
  if (!ctx) {
    throw new Error('useIntlFormatting must be used within IntlFormattingProvider');
  }
  return ctx;
};
