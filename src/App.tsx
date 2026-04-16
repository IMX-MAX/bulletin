/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { format, addDays, isSameDay, isToday } from 'date-fns';
import { useStore } from './hooks/useStore';
import { Board } from './components/Board';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings, Download, Upload } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const handleGoToToday = () => setCurrentDate(new Date());

  const [days] = useState(() => {
    const today = new Date();
    return Array.from({ length: 31 }).map((_, i) => addDays(today, i - 15));
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasDragged = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data, getDayItems, addItem, updateItem, removeItem, replaceData } = useStore();

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulletin_export_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        replaceData(parsed);
        setIsSettingsOpen(false);
      } catch (err) {
        alert("Invalid file format");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (scrollRef.current) {
      const selected = scrollRef.current.querySelector('[data-selected="true"]');
      if (selected && !isDragging) {
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentDate]);

  const onPointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    hasDragged.current = false;
    setStartX(e.pageX - (scrollRef.current?.offsetLeft || 0));
    setScrollLeft(scrollRef.current?.scrollLeft || 0);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current.offsetLeft || 0);
    const walk = (x - startX) * 1.5;
    if (Math.abs(x - startX) > 5) {
      hasDragged.current = true;
    }
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const items = getDayItems(dateKey);

  return (
    <div className="min-h-screen w-full bg-[#f0f0f2] text-zinc-900 overflow-hidden flex flex-col font-sans relative">
      
      {/* Settings Menu Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsSettingsOpen(false)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings size={18} className="text-zinc-500" />
                  <h2 className="font-semibold text-zinc-800">Manage Space</h2>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-700 mb-2">Groq API Key</h3>
                  <input 
                    type="password"
                    placeholder="gsk_..."
                    className="w-full text-sm p-2 bg-zinc-50 border border-zinc-200 rounded-md outline-none focus:border-purple-400 focus:bg-white"
                    defaultValue={localStorage.getItem('groq_api_key') || ''}
                    onChange={(e) => {
                      if (e.target.value.trim()) localStorage.setItem('groq_api_key', e.target.value.trim());
                      else localStorage.removeItem('groq_api_key');
                    }}
                  />
                  <p className="text-xs text-zinc-400 mt-1">Used for 'Enhance with AI'. Stored locally.</p>
                </div>

                <div className="pt-4 border-t border-zinc-100">
                  <h3 className="text-sm font-medium text-zinc-700 mb-2">Data Management</h3>
                  <div className="flex space-x-3">
                    <button 
                      onClick={handleExport}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-white border border-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                    >
                      <Download size={14} className="mr-2 text-zinc-500" /> Export JSON
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      <Upload size={14} className="mr-2 text-zinc-400" /> Import JSON
                    </button>
                    <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">Export your entire bulletin history as a single file.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dock-style Expandable Header */}
      <div className="absolute top-0 left-0 right-0 h-48 z-50 flex flex-col items-center group pointer-events-none">
        
        {/* The hover area itself (invisible, but triggers the hover) */}
        <div className="absolute top-0 w-48 h-8 cursor-pointer pointer-events-auto z-40 transition-all duration-300 group-hover:w-full group-hover:h-32" />
        
        {/* The subtle dock line, visible when NOT hovered */}
        <div className="w-32 h-1.5 bg-zinc-300/80 rounded-full mt-2 shadow-sm transition-all duration-300 group-hover:opacity-0 group-hover:scale-x-0 pointer-events-auto cursor-pointer z-40" />
        
        {/* The Fade-in / Slide-down Dock UI */}
        <div className="absolute top-0 opacity-0 -translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] w-full pointer-events-none pt-4 z-50">
          {/* Top Header / Nav */}
          <header className="absolute top-0 left-0 right-0 p-6 flex justify-end items-start z-40 pointer-events-none pt-4">
            <div className="pointer-events-auto">
              <button 
                onClick={handleGoToToday}
                className="px-4 py-2 bg-white/80 hover:bg-white backdrop-blur-md text-sm font-medium rounded-xl border border-zinc-200/50 shadow-sm transition-all"
              >
                Today
              </button>
            </div>
          </header>

          {/* Draggable Week / Date Bar */}
          <div className="w-full flex justify-center pt-2 z-40 absolute pointer-events-none px-4">
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 pointer-events-auto bg-white/70 px-3 py-1 rounded-lg backdrop-blur-md shadow-sm border border-zinc-200/60">
                {format(currentDate, 'MMMM yyyy')}
              </div>
              <div className="bg-white/70 backdrop-blur-xl p-2 rounded-2xl shadow-sm border border-zinc-200/60 pointer-events-auto max-w-full lg:max-w-4xl overflow-hidden">
                <div 
                  ref={scrollRef}
                onPointerDown={onPointerDown}
                onPointerLeave={() => setIsDragging(false)}
                onPointerUp={() => setIsDragging(false)}
                onPointerMove={onPointerMove}
                className={cn(
                  "flex items-center space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar",
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
              >
                {days.map((day) => {
                  const isSelected = isSameDay(day, currentDate);
                  const isCurrentDay = isToday(day);
                  
                  return (
                    <div
                      key={day.toISOString()}
                      data-selected={isSelected}
                      onPointerUp={(e) => {
                        if (!hasDragged.current) {
                          setCurrentDate(day);
                        }
                      }}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center justify-center w-12 h-14 sm:w-14 sm:h-16 rounded-xl transition-all relative select-none",
                        isSelected 
                          ? "bg-zinc-900 text-white shadow-md shadow-zinc-900/10 scale-105" 
                          : "hover:bg-zinc-100 text-zinc-600",
                        isCurrentDay && !isSelected && "bg-zinc-200/50"
                      )}
                    >
                      <span className={cn("text-[9px] sm:text-[10px] uppercase font-bold tracking-wider pointer-events-none", isSelected ? "text-zinc-400" : "text-zinc-500")}>
                        {format(day, 'EEE')}
                      </span>
                      <span className={cn("text-base sm:text-lg font-black leading-none mt-1 pointer-events-none", isSelected ? "text-white" : "text-zinc-800")}>
                        {format(day, 'd')}
                      </span>
                      {isCurrentDay && (
                        <div className={cn("absolute -bottom-1 w-1 h-1 rounded-full pointer-events-none", isSelected ? "bg-white" : "bg-zinc-900")}></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Board */}
      <Board 
        key={dateKey} // re-mounts board cleanly when date changes
        dateKey={dateKey} 
        items={items} 
        onAddItem={(item) => addItem(dateKey, item)}
        onUpdateItem={(id, updates) => updateItem(dateKey, id, updates)}
        onRemoveItem={(id) => removeItem(dateKey, id)}
        onImagePreview={setPreviewImage}
      />
      
      {/* Helper Toast */}
      {items.length === 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-0 pointer-events-none opacity-40">
          <p className="text-zinc-500 font-medium text-sm">Right-click anywhere to add items</p>
        </div>
      )}

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto"
            onClick={() => setPreviewImage(null)}
          >
            <button 
              className="absolute top-6 right-6 text-white/70 hover:text-white p-2"
              onClick={() => setPreviewImage(null)}
            >
              <X size={32} />
            </button>
            <motion.img 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={previewImage} 
              alt="Preview Fullscreen" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
