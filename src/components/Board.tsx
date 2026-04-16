import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { GripHorizontal, Trash2, Type, CheckSquare, Image as ImageIcon, Link as LinkIcon, ExternalLink, Edit2, PlaySquare, MoveUpRight } from 'lucide-react';
import { BoardItem, ItemType } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ReactPlayer from 'react-player';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DraggableItemProps {
  key?: React.Key;
  item: BoardItem;
  onUpdate: (updates: Partial<BoardItem>) => void;
  onRemove: () => void;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onImagePreview?: (url: string) => void;
}

export const DraggableItem = ({ item, onUpdate, onRemove, boardRef, onImagePreview }: DraggableItemProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState<{x: number, y: number} | null>(null);
  const [isEditingArrow, setIsEditingArrow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const lastClickRef = useRef<number>(0);
  
  const [size, setSize] = useState({ width: item.width || 0, height: item.height || 0 });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Type something (Markdown supported)...' })
    ],
    content: item.content || '',
    onUpdate: ({ editor }) => {
      onUpdate({ content: editor.getHTML() });
    },
  });

  useEffect(() => {
    if (item.width && item.width !== size.width) {
      setSize(s => ({ ...s, width: item.width! }));
    }
    if (item.height && item.height !== size.height) {
      setSize(s => ({ ...s, height: item.height! }));
    }
  }, [item.width, item.height]);

  const tasks = item.tasks || (item.type === 'task' ? [{ id: 'default', text: item.content || '', checked: item.checked || false }] : []);

  const embedType = useMemo(() => {
    if ((item.type !== 'embed' && item.type !== 'video') || !item.content || item.content === 'editing') return null;
    
    // ReactPlayer has a static canPlay method
    if (ReactPlayer.canPlay(item.content)) {
       return { type: 'player', url: item.content };
    }
    
    // Fallback to link block
    try {
      let url = item.content;
      if (!url.startsWith('http')) url = 'https://' + url;
      const parsed = new URL(url);
      const domain = parsed.hostname.replace('www.', '');
      return { type: 'link', src: url, domain };
    } catch {
      return { type: 'link', src: item.content, domain: item.content };
    }
  }, [item.type, item.content]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    
    const initialWidth = size.width || ref.current?.offsetWidth || 200;
    const initialHeight = size.height || ref.current?.offsetHeight || 100;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const newWidth = Math.max(150, initialWidth + (moveEvent.clientX - startX));
      const newHeight = Math.max(50, initialHeight + (moveEvent.clientY - startY));
      setSize({ width: newWidth, height: newHeight });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      const newWidth = Math.max(150, initialWidth + (upEvent.clientX - startX));
      const newHeight = Math.max(50, initialHeight + (upEvent.clientY - startY));
      onUpdate({ width: newWidth, height: newHeight });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleArrowEndMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialEndX = item.endX ?? 100;
    const initialEndY = item.endY ?? 100;

    const onPointerMove = (moveEvent: PointerEvent) => {
      onUpdate({ 
         endX: initialEndX + (moveEvent.clientX - startX),
         endY: initialEndY + (moveEvent.clientY - startY)
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleArrowStartMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = item.x;
    const initialY = item.y;
    const initialEndX = item.endX ?? 100;
    const initialEndY = item.endY ?? 100;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      onUpdate({ 
         x: initialX + dx,
         y: initialY + dy,
         endX: initialEndX - dx,
         endY: initialEndY - dy
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  useEffect(() => {
    if (!deleteMenu) return;
    const clickHandler = () => setDeleteMenu(null);
    window.addEventListener('pointerdown', clickHandler);
    return () => window.removeEventListener('pointerdown', clickHandler);
  }, [deleteMenu]);

  return (
    <motion.div
      ref={ref}
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={boardRef}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        setDeleteMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(e, info) => {
        setIsDragging(false);
        onUpdate({ x: item.x + info.offset.x, y: item.y + info.offset.y });
      }}
      initial={{ x: item.x, y: item.y, opacity: 0, scale: 0.8 }}
      animate={{ x: item.x, y: item.y, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0,
        width: size.width ? `${size.width}px` : undefined,
        height: size.height ? `${size.height}px` : undefined
      }}
      className={cn(
        "group absolute flex flex-col",
        isDragging ? "z-50" : "z-10"
      )}
    >
      {/* Context Menu for Deletion */}
      <AnimatePresence>
        {deleteMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute z-[100] w-32 bg-white/95 backdrop-blur-md rounded-xl shadow-xl shadow-black/5 border border-zinc-200 overflow-hidden py-1"
            style={{ left: deleteMenu.x, top: deleteMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(); setDeleteMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer relative z-50"
            >
              <Trash2 size={16} className="mr-2" /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        onPointerDown={(e) => {
          if (e.target instanceof Element && (e.target.closest('.no-drag') || item.type === 'arrow')) return;
          controls.start(e);
        }}
        className={cn(
        "bg-white/90 backdrop-blur-md shadow-lg border border-zinc-200 rounded-2xl p-4 transition-shadow relative overflow-hidden h-full flex flex-col",
        isDragging ? "shadow-xl shadow-zinc-900/10 scale-[1.02] cursor-grabbing" : "cursor-grab",
        item.type === 'image' && "p-2",
        item.type === 'arrow' && "bg-transparent backdrop-blur-none border-none shadow-none p-0 overflow-visible"
      )}>
        {item.type === 'arrow' && (
          <div 
            className="w-full h-full relative" 
            onDoubleClick={() => setIsEditingArrow(prev => !prev)}
          >
            <svg
               style={{ minWidth: 200, minHeight: 200, overflow: 'visible' }}
               className="pointer-events-none"
            >
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#3f3f46" />
                </marker>
              </defs>
              <line 
                x1={0} y1={0} 
                x2={item.endX ?? 100} y2={item.endY ?? 100} 
                stroke="#3f3f46" strokeWidth="4" 
                markerEnd="url(#arrowhead)" 
              />
            </svg>
            {isEditingArrow && (
               <>
                 <div
                   className="absolute w-4 h-4 bg-blue-500 rounded-full cursor-move pointer-events-auto shadow-md"
                   style={{ left: -8, top: -8 }}
                   onPointerDown={handleArrowStartMove}
                 />
                 <div
                   className="absolute w-4 h-4 bg-red-500 rounded-full cursor-move pointer-events-auto shadow-md"
                   style={{ left: (item.endX ?? 100) - 8, top: (item.endY ?? 100) - 8 }}
                   onPointerDown={handleArrowEndMove}
                 />
               </>
            )}
          </div>
        )}

        {item.type === 'text' && (
          <div className="w-full h-full relative group/text flex flex-col min-w-[200px] min-h-[40px] no-drag">
             <div className="prose prose-sm prose-zinc w-full max-w-none text-zinc-800 break-words leading-relaxed cursor-text overflow-y-auto no-scrollbar h-full">
               <EditorContent editor={editor} />
             </div>
          </div>
        )}
        
        {item.type === 'task' && (
          <div className="flex flex-col space-y-2 w-full h-full overflow-y-auto no-scrollbar no-drag" onPointerDown={(e) => e.stopPropagation()}>
            {tasks.map((task, index) => (
              <div key={task.id} className="flex items-start space-x-3 w-full">
                <div 
                  className={cn(
                    "mt-0.5 min-w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors shrink-0",
                    task.checked ? "bg-zinc-800 border-zinc-800 text-white" : "border-zinc-300 hover:border-zinc-500 bg-white"
                  )}
                  onClick={() => {
                    const newTasks = [...tasks];
                    newTasks[index] = { ...task, checked: !task.checked };
                    onUpdate({ tasks: newTasks });
                  }}
                >
                  {task.checked && <CheckSquare size={14} className="opacity-100" />}
                </div>
                <textarea
                  value={task.text}
                  onChange={(e) => {
                    const newTasks = [...tasks];
                    newTasks[index] = { ...task, text: e.target.value };
                    onUpdate({ tasks: newTasks });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const newTasks = [...tasks];
                      newTasks.splice(index + 1, 0, { id: crypto.randomUUID(), text: '', checked: false });
                      onUpdate({ tasks: newTasks });
                      setTimeout(() => {
                        const textareas = ref.current?.querySelectorAll('textarea');
                        if (textareas && textareas[index + 1]) {
                          (textareas[index + 1] as HTMLTextAreaElement).focus();
                        }
                      }, 10);
                    } else if (e.key === 'Backspace' && task.text === '' && tasks.length > 1) {
                      e.preventDefault();
                      const newTasks = tasks.filter((_, i) => i !== index);
                      onUpdate({ tasks: newTasks });
                      setTimeout(() => {
                        const textareas = ref.current?.querySelectorAll('textarea');
                        if (textareas && textareas[Math.max(0, index - 1)]) {
                          (textareas[Math.max(0, index - 1)] as HTMLTextAreaElement).focus();
                        }
                      }, 10);
                    }
                  }}
                  placeholder="Task description..."
                  className={cn(
                    "w-full bg-transparent resize-none outline-none placeholder-zinc-400 font-medium transition-colors",
                    task.checked ? "line-through text-zinc-400" : "text-zinc-800"
                  )}
                  autoFocus={task.text === ''}
                  rows={1}
                  style={{ height: 'auto', minHeight: '24px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {item.type === 'image' && (
          <div className="w-full h-full relative flex items-center justify-center pointer-events-none">
             <img 
                src={item.content} 
                alt="board element" 
                className="max-w-full max-h-full w-auto h-auto rounded-lg shadow-sm pointer-events-auto cursor-zoom-in hover:opacity-90 transition-opacity" 
                draggable={false} 
                onPointerDown={(e) => {
                   const now = Date.now();
                   if (now - lastClickRef.current < 300) {
                      onImagePreview?.(item.content);
                   }
                   lastClickRef.current = now;
                }} 
             />
          </div>
        )}
        
        {(item.type === 'embed' || item.type === 'video') && (
          <div className="w-full h-full relative flex flex-col no-drag" onPointerDown={(e) => e.stopPropagation()}>
            {!item.content || item.content === 'editing' ? (
              <div className="flex flex-col space-y-2 w-full h-full justify-center min-w-[200px]" onPointerDown={(e) => e.stopPropagation()}>
                <p className="text-sm font-medium text-zinc-500">Embed / Video URL:</p>
                <input
                  className="w-full p-2.5 border border-zinc-200 rounded-lg text-sm outline-none bg-zinc-50 focus:bg-white"
                  placeholder="https://..."
                  autoFocus
                  onBlur={(e) => {
                     if(e.currentTarget.value) onUpdate({ content: e.currentTarget.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onUpdate({ content: e.currentTarget.value });
                    }
                  }}
                />
                <p className="text-xs text-zinc-400">Press Enter to embed</p>
              </div>
            ) : embedType ? (
              <div className="w-full h-full relative group flex-1 bg-zinc-50 rounded-lg overflow-hidden border border-zinc-200">
                {embedType.type === 'player' ? (
                  <div className="w-full h-full pointer-events-auto relative">
                     {React.createElement(ReactPlayer as any, {
                       url: embedType.url,
                       width: '100%',
                       height: '100%',
                       controls: true
                     })}
                     <a href={embedType.url} target="_blank" rel="noopener noreferrer" className="absolute top-2 left-2 bg-black/60 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-black/80 shadow-sm" title="Open in new tab">
                        <ExternalLink size={14} />
                     </a>
                  </div>
                ) : (
                  <a href={embedType.src} target="_blank" rel="noopener noreferrer" className="w-full h-full flex flex-col items-center justify-center p-4 hover:bg-zinc-100 transition-colors pointer-events-auto cursor-pointer">
                    <LinkIcon size={24} className="text-zinc-400 mb-2" />
                    <span className="text-sm font-medium text-zinc-700 truncate w-full text-center">{embedType.domain}</span>
                    <span className="text-xs text-blue-500 mt-1 flex items-center bg-blue-50 px-2 py-1 rounded-full"><ExternalLink size={10} className="mr-1"/> Open Link</span>
                  </a>
                )}
                <button 
                  onClick={() => onUpdate({ content: 'editing' })} 
                  className="absolute top-2 right-2 bg-zinc-900/80 text-white px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-xs pointer-events-auto shadow-sm z-10"
                >
                  Edit URL
                </button>
              </div>
            ) : null}
          </div>
        )}
        
        <div 
          className={cn(
             "absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-30 touch-none pointer-events-auto",
             item.type === 'arrow' && "hidden"
          )}
          onPointerDown={handleResizePointerDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="absolute bottom-1.5 right-1.5 flex flex-col space-y-0.5 opacity-0 group-hover:opacity-30 transition-opacity">
            <div className="flex space-x-0.5 justify-end"><div className="w-1 h-1 bg-zinc-800 rounded-full" /></div>
            <div className="flex space-x-0.5 justify-end"><div className="w-1 h-1 bg-zinc-800 rounded-full" /><div className="w-1 h-1 bg-zinc-800 rounded-full" /></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface BoardProps {
  key?: React.Key;
  dateKey: string;
  items: BoardItem[];
  onAddItem: (item: BoardItem) => void;
  onUpdateItem: (id: string, updates: Partial<BoardItem>) => void;
  onRemoveItem: (id: string) => void;
  onImagePreview?: (url: string) => void;
}

export const Board = ({ dateKey, items, onAddItem, onUpdateItem, onRemoveItem, onImagePreview }: BoardProps) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    
    // Position relative to board
    const logicalX = e.clientX - rect.left;
    const logicalY = e.clientY - rect.top;
    
    setContextMenu({ x: logicalX, y: logicalY });
    
    // Menu position fixed
    setMenuPos({ 
      x: Math.min(e.clientX, window.innerWidth - 200), 
      y: Math.min(e.clientY, window.innerHeight - 200) 
    });
  };

  const closeMenu = () => setContextMenu(null);

  const createItem = (type: ItemType, content: string = '') => {
    if (!contextMenu) return;
    const itemData: Omit<BoardItem, 'id'> = {
      type,
      x: contextMenu.x,
      y: contextMenu.y,
      content,
    };
    if (type === 'task') {
      onAddItem({ ...itemData, id: crypto.randomUUID(), tasks: [{ id: crypto.randomUUID(), text: '', checked: false }] });
    } else {
      onAddItem({ ...itemData, id: crypto.randomUUID() });
    }
    closeMenu();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Image is too large. Please select an image under 5MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const img = new Image();
          img.onload = () => {
             // scale down large images
             let w = img.width;
             let h = img.height;
             const MAX_DIMENSION = 400; // prevents giant image spawns
             if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
                if (w > h) {
                   h = (MAX_DIMENSION / w) * h;
                   w = MAX_DIMENSION;
                } else {
                   w = (MAX_DIMENSION / h) * w;
                   h = MAX_DIMENSION;
                }
             }

             if (!contextMenu) return;

             onAddItem({ 
                id: crypto.randomUUID(), 
                type: 'image', 
                x: contextMenu.x, 
                y: contextMenu.y, 
                content: img.src,
                width: w,
                height: h
             });
          };
          img.src = event.target.result.toString();
        }
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    closeMenu();
  };

  return (
    <div 
      ref={boardRef}
      className="flex-1 w-full h-full relative cursor-crosshair overflow-hidden"
      onContextMenu={handleContextMenu}
      onPointerDown={closeMenu}
    >
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, black 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <AnimatePresence>
        {items.map(item => (
          <DraggableItem 
            key={item.id} 
            item={item} 
            onUpdate={(updates) => onUpdateItem(item.id, updates)} 
            onRemove={() => onRemoveItem(item.id)}
            boardRef={boardRef}
            onImagePreview={onImagePreview}
          />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {contextMenu && menuPos && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-xl shadow-black/5 border border-zinc-200 overflow-hidden py-1.5"
            style={{ left: menuPos.x, top: menuPos.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button onClick={() => createItem('text', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <Type size={16} className="mr-3 text-zinc-400" /> Add Text
            </button>
            <button onClick={() => createItem('task', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <CheckSquare size={16} className="mr-3 text-zinc-400" /> Add Task
            </button>
            <div className="h-px bg-zinc-200 my-1 mx-2"></div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <ImageIcon size={16} className="mr-3 text-zinc-400" /> Add Image
            </button>
            <button onClick={() => createItem('video', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <PlaySquare size={16} className="mr-3 text-zinc-400" /> Add Video
            </button>
            <button onClick={() => createItem('embed', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <LinkIcon size={16} className="mr-3 text-zinc-400" /> Add Link/Embed
            </button>
            <button onClick={() => createItem('arrow', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <MoveUpRight size={16} className="mr-3 text-zinc-400" /> Add Arrow
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
    </div>
  );
};
