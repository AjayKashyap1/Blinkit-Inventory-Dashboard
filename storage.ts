import { DataSource } from './types';

const DB_NAME = 'blinkit_analytics_db';
const DB_VERSION = 1;
const STORE_NAME = 'data_sources';
const FALLBACK_KEY = 'blinkit_saved_sources_v1';

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
