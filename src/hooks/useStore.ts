import { useState, useEffect } from 'react';
import { DayData, BoardItem } from '../types';

const STORE_KEY = 'bullitin_store_v1';

export function useStore() {
  const [data, setData] = useState<DayData>(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
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
           localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save to localStorage. It might be full because of large images.");
    }
  }, [data]);

  const getDayItems = (dateKey: string): BoardItem[] => {
    return data[dateKey] || [];
  };

  const addItem = (dateKey: string, item: BoardItem) => {
    setData((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), item],
    }));
  };

  const updateItem = (dateKey: string, id: string, updates: Partial<BoardItem>) => {
    setData((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  };

  const removeItem = (dateKey: string, id: string) => {
    setData((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || []).filter((item) => item.id !== id),
    }));
  };

  const replaceData = (newData: DayData) => {
    setData(newData);
  };

  return { data, getDayItems, addItem, updateItem, removeItem, replaceData };
}
