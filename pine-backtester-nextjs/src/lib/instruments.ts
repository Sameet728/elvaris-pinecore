export interface InstrumentMeta {
  symbol: string;
  name: string;
  multiplier: number;
  tickSize: number;
  priceDecimals: number;
  marketType: 'forex' | 'crypto' | 'index' | 'commodity';
  annualizationFactor: number; // 252 for forex/indices/commodities, 365 for crypto
  defaultCommissionPerLot: number;
  defaultSlippagePoints: number;
}

export const INSTRUMENTS: Record<string, InstrumentMeta> = {
  'FOREXCOM:XAUUSD': {
    symbol: 'FOREXCOM:XAUUSD',
    name: 'Gold / US Dollar',
    multiplier: 100, // 1 standard lot = 100 oz ($1 move = $100)
    tickSize: 0.01,
    priceDecimals: 2,
    marketType: 'commodity',
    annualizationFactor: 252,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'xauusd_15m': {
    symbol: 'FOREXCOM:XAUUSD',
    name: 'Gold / US Dollar',
    multiplier: 100,
    tickSize: 0.01,
    priceDecimals: 2,
    marketType: 'commodity',
    annualizationFactor: 252,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'FX:EURUSD': {
    symbol: 'FX:EURUSD',
    name: 'Euro / US Dollar',
    multiplier: 100000, // 1 standard lot = 100,000 EUR
    tickSize: 0.00001,
    priceDecimals: 5,
    marketType: 'forex',
    annualizationFactor: 252,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'eurusd_15m': {
    symbol: 'FX:EURUSD',
    name: 'Euro / US Dollar',
    multiplier: 100000,
    tickSize: 0.00001,
    priceDecimals: 5,
    marketType: 'forex',
    annualizationFactor: 252,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'NASDAQ:NAS100': {
    symbol: 'NASDAQ:NAS100',
    name: 'Nasdaq 100 Index',
    multiplier: 20, // 1 point = $20
    tickSize: 0.25,
    priceDecimals: 2,
    marketType: 'index',
    annualizationFactor: 252,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'nas100_15m': {
    symbol: 'NASDAQ:NAS100',
    name: 'Nasdaq 100 Index',
    multiplier: 20,
    tickSize: 0.25,
    priceDecimals: 2,
    marketType: 'index',
    annualizationFactor: 252,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'BINANCE:BTCUSDT': {
    symbol: 'BINANCE:BTCUSDT',
    name: 'Bitcoin / Tether',
    multiplier: 1, // 1 BTC
    tickSize: 0.01,
    priceDecimals: 2,
    marketType: 'crypto',
    annualizationFactor: 365,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
  'btcusdt_15m': {
    symbol: 'BINANCE:BTCUSDT',
    name: 'Bitcoin / Tether',
    multiplier: 1,
    tickSize: 0.01,
    priceDecimals: 2,
    marketType: 'crypto',
    annualizationFactor: 365,
    defaultCommissionPerLot: 0,
    defaultSlippagePoints: 0,
  },
};

export function getInstrumentMeta(symbolOrDataset: string): InstrumentMeta {
  const clean = symbolOrDataset.trim();
  if (INSTRUMENTS[clean]) return INSTRUMENTS[clean];
  for (const [key, meta] of Object.entries(INSTRUMENTS)) {
    if (clean.toLowerCase().includes(key.toLowerCase()) || clean.toLowerCase().includes(meta.name.toLowerCase())) {
      return meta;
    }
  }
  // Default to Gold/Forex standard
  return INSTRUMENTS['FOREXCOM:XAUUSD'];
}

