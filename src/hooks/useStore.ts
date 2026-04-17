import { useState, useEffect, useRef, useCallback } from 'react';
import { DayData, BoardItem } from '../types';

const STORE_KEY = 'bullitin_store_v1';

const openDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('bulletin_db', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('store');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const setDB = async (key: string, val: any) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    tx.objectStore('store').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getDB = async (key: string) => {
  const db = await openDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction('store', 'readonly');
    const req = tx.objectStore('store').get(key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
};

export function useStore() {
  const [data, setData] = useState<DayData>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  const hasUnsavedChanges = useRef(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const load = async () => {
      if (initialLoadDone.current) return;
      initialLoadDone.current = true;
      try {
        let parsed: DayData = {};
        
        // Migrate from old localStorage if exists
        const oldLocal = localStorage.getItem(STORE_KEY);
        if (oldLocal) {
          try {
            parsed = JSON.parse(oldLocal);
            await setDB(STORE_KEY, parsed);
            localStorage.removeItem(STORE_KEY);
          } catch (e) {
            console.error("Migration failed", e);
          }
        } else {
          const dbData = await getDB(STORE_KEY);
          if (dbData) parsed = dbData;
        }

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        let changed = false;

        for (const key of Object.keys(parsed)) {
          const [y, m, d] = key.split('-').map(Number);
          if (!isNaN(y) && !isNaN(m)) {
            if (y < currentYear || (y === currentYear && (m - 1) < currentMonth)) {
               delete parsed[key];
               changed = true;
            }
          }
        }
        
        if (changed) {
           await setDB(STORE_KEY, parsed);
        }
        
        setData(parsed);
      } catch (e) {
        console.error("Failed to load store", e);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    
    hasUnsavedChanges.current = true;
    setIsSaving(true);
    setSaveError(null);

    const timeout = setTimeout(async () => {
      try {
        await setDB(STORE_KEY, data);
        hasUnsavedChanges.current = false;
      } catch (e: any) {
        console.error("Failed to save to database", e);
        setSaveError(e.message || "Failed to save: Database limit exceeded or inaccessible.");
      } finally {
        setIsSaving(false);
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [data, isLoaded]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges.current || isSaving || saveError) {
        const msg = "You have unsaved changes. If you leave, your data may be lost.";
        e.returnValue = msg;
        return msg;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaving, saveError]);

  const getDayItems = useCallback((dateKey: string): BoardItem[] => {
    return data[dateKey] || [];
  }, [data]);

  const addItem = useCallback((dateKey: string, item: BoardItem) => {
    setData((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), item],
    }));
  }, []);

  const updateItem = useCallback((dateKey: string, id: string, updates: Partial<BoardItem>) => {
    setData((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  }, []);

  const removeItem = useCallback((dateKey: string, id: string) => {
    setData((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).filter((item) => item.id !== id),
    }));
  }, []);

  const replaceData = useCallback((newData: DayData) => {
    setData(newData);
  }, []);

  return { data, getDayItems, addItem, updateItem, removeItem, replaceData, isLoaded, isSaving, saveError };
}
