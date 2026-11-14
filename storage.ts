import { DataSource, ProductCostConfig, GlobalProfitConfig } from './types';

const DB_NAME = 'blinkit_analytics_db';
const DB_VERSION = 1;
const STORE_NAME = 'data_sources';
const FALLBACK_KEY = 'blinkit_saved_sources_v1';
const COSTS_KEY = 'blinkit_sku_costs_v1';
const GLOBAL_PROFIT_KEY = 'blinkit_global_profit_config_v1';

export const DEFAULT_GLOBAL_PROFIT_CONFIG: GlobalProfitConfig = {
  defaultCogsPct: 55,
  defaultCommissionPct: 15,
  defaultShippingPerUnit: 25,
  gstOnFeesPct: 18,
  activeCostTier: 'T1',
  t2DiscountPct: 10,
  t3DiscountPct: 5,
  t4DiscountPct: 5,
  tcsPct: 0,
  tdsPct: 0,
};

export const loadProductCosts = (): Record<string, ProductCostConfig> => {
  try {
    const raw = window.localStorage.getItem(COSTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const saveProductCosts = (costs: Record<string, ProductCostConfig>): void => {
  try {
    window.localStorage.setItem(COSTS_KEY, JSON.stringify(costs));
  } catch (err) {
    console.error('Failed to save SKU costs locally:', err);
  }
};

export const loadGlobalProfitConfig = (): GlobalProfitConfig => {
  try {
    const raw = window.localStorage.getItem(GLOBAL_PROFIT_KEY);
    if (!raw) return DEFAULT_GLOBAL_PROFIT_CONFIG;
    return { ...DEFAULT_GLOBAL_PROFIT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GLOBAL_PROFIT_CONFIG;
  }
};

export const saveGlobalProfitConfig = (config: GlobalProfitConfig): void => {
  try {
    window.localStorage.setItem(GLOBAL_PROFIT_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save global profit config locally:', err);
  }
};

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
};

export const loadSourcesFromStorage = async (): Promise<DataSource[]> => {
  try {
    const db = await openDatabase();
    return await new Promise<DataSource[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = (request.result as DataSource[]) || [];
        items.sort((a, b) => (a.uploadDate || 0) - (b.uploadDate || 0));
        resolve(items);
      };
      request.onerror = () => reject(request.error || new Error('Failed to read sources'));
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('IndexedDB load failed, attempting localStorage fallback:', err);
    try {
      const raw = window.localStorage.getItem(FALLBACK_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

export const saveSourcesToStorage = async (sources: DataSource[]): Promise<void> => {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.clear();
      for (const source of sources) {
        store.put(source);
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to save sources to IndexedDB'));
      };
    });
  } catch (err) {
    console.warn('IndexedDB save failed, attempting localStorage fallback:', err);
    try {
      window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(sources));
    } catch (storageErr) {
      console.error('Failed to persist sources locally:', storageErr);
    }
  }
};

export const clearSourcesStorage = async (): Promise<void> => {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to clear IndexedDB'));
      };
    });
  } catch (err) {
    console.warn('IndexedDB clear failed:', err);
  }

  try {
    window.localStorage.removeItem(FALLBACK_KEY);
  } catch {
    // ignore
  }
};
