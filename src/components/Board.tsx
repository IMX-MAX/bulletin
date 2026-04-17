import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { GripHorizontal, Trash2, Type, CheckSquare, Image as ImageIcon, Link as LinkIcon, ExternalLink, Edit2, PlaySquare, MoveUpRight, Sparkles, File, Music, Download } from 'lucide-react';
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
  allItems: BoardItem[];
  onAddItem: (item: BoardItem) => void;
  onUpdateAllItem?: (id: string, updates: Partial<BoardItem>) => void;
}

export const DraggableItem = ({ item, onUpdate, onRemove, boardRef, onImagePreview, allItems, onAddItem, onUpdateAllItem }: DraggableItemProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState<{x: number, y: number} | null>(null);
  const [isEditingArrow, setIsEditingArrow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const lastClickRef = useRef<number>(0);
  
  const [size, setSize] = useState({ width: item.width || 0, height: item.height || 0 });

  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [tempKey, setTempKey] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item.type === 'ai') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [item.content, item.type]);

  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleEnhance = async () => {
     let key = groqKey;
     if (!key) {
        key = window.prompt("Enter your Groq API key to enhance with Llama 3.1:") || '';
        if (!key.trim()) return;
        localStorage.setItem('groq_api_key', key.trim());
        setGroqKey(key.trim());
     }

     setIsEnhancing(true);

     try {
       const isTask = item.type === 'task';
       let contentToEnhance = '';
       let systemPrompt = '';

       if (isTask) {
          const tasksText = (item.tasks || []).map(t => `${t.checked ? '[x]' : '[ ]'} ${t.text}`).join('\n');
          contentToEnhance = tasksText;
          systemPrompt = "You are an AI assistant. Enhance, organize, and expand the following task list. Fix typos and logically group if necessary. YOU MUST OUTPUT A VALID JSON ARRAY OF STRINGS ONLY representing the new tasks (e.g. [\"Task 1\", \"Task 2\"]). Output NO other text.";
       } else {
          contentToEnhance = item.content; 
          systemPrompt = "You are an AI assistant. Enhance, rewrite, and improve the clarity of the following text. You MUST reply using basic HTML formatting (e.g. <p>, <ul><li>, <strong>) because it will be inserted into a rich text editor. Do not use Markdown backticks. Do not wrap in JSON. Output NO conversational fluff.";
       }

       const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${key}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           model: 'llama-3.1-8b-instant',
           messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: contentToEnhance }
           ]
         })
       });

       if (!res.ok) throw new Error("Failed to connect to Groq");
       const data = await res.json();
       const reply = data.choices[0].message.content;

       if (isTask) {
          try {
             const cleanReply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
             const parsed = JSON.parse(cleanReply);
             if (Array.isArray(parsed) && parsed.every(i => typeof i === 'string')) {
                onUpdate({
                   tasks: parsed.map((t: string) => ({ id: crypto.randomUUID(), text: t, checked: false }))
                });
             } else {
                throw new Error("Invalid format");
             }
          } catch(e) {
             console.error("AI did not return valid JSON array", reply);
             alert("AI failed to return valid tasks. Wait and try again.");
          }
       } else {
          if (editor) editor.commands.setContent(reply);
       }
     } catch(e: any) {
        alert(e.message);
     } finally {
        setIsEnhancing(false);
     }
  };

  const handleAiSubmit = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    try {
      const contextText = allItems.map((i, index) => {
        let text = '';
        if (i.type === 'text' || i.type === 'text-clear') text = i.content.replace(/<[^>]*>?/gm, '');
        else if (i.type === 'task') text = (i.tasks || []).map(t => `${t.checked ? '[x]' : '[ ]'} ${t.id} : ${t.text}`).join('\n');
        return text ? `Item ID: ${i.id} (${i.type}):\n${text}` : `Item ID: ${i.id} (${i.type})`;
      }).join('\n\n---\n\n');

      const systemMessage = {
        role: 'system',
        content: `You are an AI assistant for a bulletin board. Current board state:
${contextText}

IMPORTANT: You MUST respond ONLY with a valid JSON object matching this structure:
{
  "action": "reply_text" | "create_tasks" | "mark_complete" | "create_clear_text" | "create_embed",
  "payload": { }
}

Examples of payloads depending on action:
- "reply_text": { "body": "<p>Formatted HTML...</p>" }
- "create_tasks": { "tasks": ["Task 1", "Task 2"] }
- "mark_complete": { "updates": [ { "itemId": "uuid", "taskIds": ["task-id-1", "task-id-2"] } ] }
- "create_clear_text": { "body": "plain text" }
- "create_embed": { "url": "https://soundcloud.com/..." }

Do NOT wrap in markdown backticks. Return strictly JSON. Be concise.`
      };

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [systemMessage, { role: 'user', content: aiInput }]
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Error from Groq');
      }

      const data = await res.json();
      const reply = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsed: any = null;
      try {
         parsed = JSON.parse(reply);
      } catch (e) {
         // Fallback if AI didn't return valid JSON
         parsed = { action: 'reply_text', payload: { body: reply } };
      }

      switch (parsed?.action) {
         case "create_tasks":
            onAddItem({
               id: crypto.randomUUID(),
               type: 'task',
               x: item.x,
               y: item.y,
               content: '',
               tasks: parsed.payload?.tasks ? parsed.payload.tasks.map((t: string) => ({ id: crypto.randomUUID(), text: t, checked: false })) : [{ id: crypto.randomUUID(), text: 'Empty', checked: false }]
            });
            break;
         case "mark_complete":
            if (onUpdateAllItem && parsed.payload?.updates) {
               for (const update of parsed.payload.updates) {
                  const targetItem = allItems.find(i => i.id === update.itemId);
                  if (targetItem && targetItem.tasks) {
                     const newTasks = targetItem.tasks.map(t => 
                        update.taskIds.includes(t.id) ? { ...t, checked: true } : t
                     );
                     onUpdateAllItem(update.itemId, { tasks: newTasks });
                  }
               }
            }
            break;
         case "create_clear_text":
            onAddItem({ id: crypto.randomUUID(), type: 'text-clear', x: item.x, y: item.y, width: 300, content: parsed.payload?.body || '' });
            break;
         case "create_embed":
            onAddItem({ id: crypto.randomUUID(), type: 'embed', x: item.x, y: item.y, width: 300, height: 160, content: parsed.payload?.url || '' });
            break;
         case "reply_text":
         default:
            onAddItem({ id: crypto.randomUUID(), type: 'text', x: item.x, y: item.y, width: 300, content: parsed.payload?.body || parsed.payload || '' });
            break;
      }

      onRemove();
    } catch (err: any) {
      console.error(err);
      alert(err.message);
      if (err.message.includes('auth') || err.message.includes('key')) {
        localStorage.removeItem('groq_api_key');
        setGroqKey('');
      }
      setIsAiLoading(false);
    }
  };

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
    
    if (item.type === 'video') {
       return { type: 'player', url: item.content };
    }
    
    // Fallback to link block for 'embed'
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
      onDragStart={() => {
        setIsDragging(true);
        document.body.classList.add('select-none');
      }}
      onDragEnd={(e, info) => {
        setIsDragging(false);
        document.body.classList.remove('select-none');
        if (ref.current && boardRef.current) {
          const rect = ref.current.getBoundingClientRect();
          const boardRect = boardRef.current.getBoundingClientRect();
          onUpdate({ x: rect.left - boardRect.left, y: rect.top - boardRect.top });
        } else {
          onUpdate({ x: item.x + info.offset.x, y: item.y + info.offset.y });
        }
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
      {/* Context Menu for Deletion and AI Enhance */}
      <AnimatePresence>
        {deleteMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute z-[100] w-40 bg-white/95 backdrop-blur-md rounded-xl shadow-xl shadow-black/5 border border-zinc-200 overflow-hidden py-1"
            style={{ left: deleteMenu.x, top: deleteMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {(item.type === 'text' || item.type === 'text-clear' || item.type === 'task') && (
              <button 
                onClick={(e) => { e.stopPropagation(); setDeleteMenu(null); handleEnhance(); }}
                className="w-full flex items-center px-3 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer relative z-50 text-left"
              >
                <Sparkles size={16} className="mr-2" /> Enhance (AI)
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(); setDeleteMenu(null); }}
              className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer relative z-50 text-left"
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
        item.type === 'arrow' && "bg-transparent backdrop-blur-none border-none shadow-none p-0 overflow-visible",
        item.type === 'text-clear' && "bg-transparent backdrop-blur-none border-transparent shadow-none p-4 overflow-visible hover:border-zinc-200/50"
      )}>
        {isEnhancing && (
          <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm rounded-2xl flex items-center justify-center pointer-events-none">
             <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
               <Sparkles className="text-purple-500" size={24} />
             </motion.div>
          </div>
        )}

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

        {(item.type === 'text' || item.type === 'text-clear') && (
          <div className="w-full h-full relative group/text flex flex-col min-w-[200px] min-h-[40px] no-drag">
             <div className="prose prose-sm prose-zinc w-full max-w-none text-zinc-800 break-words leading-relaxed cursor-text overflow-y-auto no-scrollbar h-full">
               <EditorContent editor={editor} />
             </div>
          </div>
        )}

        {item.type === 'ai' && (
          <div className="w-full h-full relative flex flex-col min-w-[250px] min-h-[50px] no-drag" onPointerDown={(e) => e.stopPropagation()}>
             {!groqKey ? (
                <div className="flex flex-col h-full items-center justify-center space-y-4 p-4 text-center">
                   <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-2"><Sparkles size={24} /></div>
                   <h3 className="text-sm font-semibold text-zinc-800">Setup AI Block</h3>
                   <p className="text-xs text-zinc-500 max-w-[200px]">Enter your Groq API key to use Llama 3.1. It is stored securely in your browser.</p>
                   <input 
                     value={tempKey} 
                     onChange={(e) => setTempKey(e.target.value)}
                     placeholder="gsk_..." 
                     className="w-full text-sm p-2 border border-zinc-200 rounded-md focus:border-purple-400 focus:ring focus:ring-purple-200/50 outline-none"
                     type="password"
                   />
                   <button 
                     onClick={() => {
                        if(tempKey.trim()) {
                           localStorage.setItem('groq_api_key', tempKey.trim());
                           setGroqKey(tempKey.trim());
                        }
                     }}
                     className="w-full bg-purple-600 text-white text-sm font-medium py-2 rounded-md hover:bg-purple-700 transition"
                   >Save Key</button>
                </div>
             ) : (
                <div className="flex flex-col h-full items-center justify-center">
                   <div className="flex items-center space-x-2 pb-2 mb-2 border-b border-zinc-100 shrink-0 w-full">
                     <Sparkles size={14} className="text-purple-500" />
                     <span className="text-xs font-medium text-zinc-600">Llama 3.1 (Groq)</span>
                   </div>
                   {isAiLoading ? (
                      <div className="flex flex-col items-center justify-center py-4 w-full">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="mb-2">
                           <Sparkles size={16} className="text-purple-400" />
                        </motion.div>
                        <div className="text-xs text-zinc-400 text-center">Thinking...</div>
                      </div>
                   ) : (
                       <div className="flex flex-col gap-2 w-full">
                         <input 
                           value={aiInput} 
                           onChange={(e) => setAiInput(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Enter') handleAiSubmit(); }}
                           placeholder="Ask or command AI..." 
                           className="w-full text-sm p-2 bg-zinc-50 border border-zinc-200 rounded-md focus:bg-white focus:border-purple-400 outline-none"
                           autoFocus
                         />
                         <button 
                           onClick={handleAiSubmit} 
                           disabled={isAiLoading || !aiInput.trim()}
                           className="w-full bg-purple-600 text-white py-1.5 text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 transition"
                         >Submit</button>
                       </div>
                   )}
                </div>
             )}
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
                  <div className="w-full h-full pointer-events-auto relative bg-black/5 rounded-lg overflow-hidden flex items-center justify-center">
                     {!/(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|soundcloud\.com)/i.test(embedType.url) ? (
                        <video 
                          src={embedType.url} 
                          controls 
                          className="w-full h-full object-contain pointer-events-auto" 
                          onPointerDown={e => e.stopPropagation()} 
                        />
                     ) : (
                        <div className="w-full h-full absolute inset-0">
                          {React.createElement(ReactPlayer as any, {
                            url: embedType.url,
                            width: '100%',
                            height: '100%',
                            controls: true,
                            config: { file: { forceVideo: true } }
                          })}
                        </div>
                     )}
                     {!embedType.url.startsWith('data:') && (
                        <a href={embedType.url} target="_blank" rel="noopener noreferrer" className="absolute top-2 left-2 bg-black/60 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-black/80 shadow-sm" title="Open in new tab">
                           <ExternalLink size={14} />
                        </a>
                     )}
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

        {item.type === 'audio' && (
          <div className="w-full h-full relative flex items-center justify-center p-4 bg-zinc-50 border border-zinc-200 rounded-lg pointer-events-none">
             <audio src={item.content} controls className="w-full pointer-events-auto shadow-sm" onPointerDown={e => e.stopPropagation()} />
          </div>
        )}

        {item.type === 'file' && (
          <div className="w-full h-full relative flex flex-col items-center justify-center p-4 bg-zinc-50 border border-zinc-200 rounded-lg pointer-events-none group-hover/file:bg-zinc-100 transition-colors">
             <File size={32} className="text-zinc-400 mb-2 pointer-events-auto cursor-pointer hover:text-zinc-600 transition-colors" onClick={() => {
                const a = document.createElement('a'); 
                a.href = item.content; 
                a.download = item.fileName || 'file'; 
                a.click();
             }} />
             <span className="text-sm font-medium text-zinc-600 truncate w-full text-center px-4 pointer-events-none">{item.fileName || 'Attached File'}</span>
             <button onClick={() => {
                const a = document.createElement('a'); 
                a.href = item.content; 
                a.download = item.fileName || 'file'; 
                a.click();
             }} className="mt-3 text-xs text-zinc-600 hover:text-zinc-900 pointer-events-auto bg-white border border-zinc-200 px-3 py-1.5 rounded-md shadow-sm flex items-center transition-colors">
                <Download size={14} className="mr-1.5"/> Download
             </button>
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const rect = boardRef.current?.getBoundingClientRect();
        if (!rect) return;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        setContextMenu({
          x: centerX - rect.left,
          y: centerY - rect.top
        });
        setMenuPos({
          x: Math.min(centerX, window.innerWidth - 200),
          y: Math.min(centerY, window.innerHeight - 200)
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert("File is too large. Please select a file under 15MB to prevent storage limits.");
        return;
      }
      
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64 = event.target.result.toString();
          
          if (!contextMenu) return;

          if (isImage) {
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

               onAddItem({ 
                  id: crypto.randomUUID(), 
                  type: 'image', 
                  x: contextMenu.x, 
                  y: contextMenu.y, 
                  content: base64,
                  width: w,
                  height: h
               });
            };
            img.src = base64;
          } else {
            let itemType: ItemType = 'file';
            let w = 300;
            let h = undefined;
            if (isVideo) {
               itemType = 'video';
               w = 400;
               h = 250;
            } else if (isAudio) {
               itemType = 'audio';
               w = 320;
               h = 100;
            }
            onAddItem({ 
               id: crypto.randomUUID(), 
               type: itemType, 
               x: contextMenu.x, 
               y: contextMenu.y, 
               content: base64,
               fileName: file.name,
               fileType: file.type,
               width: w,
               height: h
            });
          }
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
            allItems={items}
            onAddItem={onAddItem}
            onUpdateAllItem={onUpdateItem}
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
            className="fixed z-50 w-56 bg-white/95 backdrop-blur-md rounded-xl shadow-xl shadow-black/5 border border-zinc-200 overflow-hidden py-1.5"
            style={{ left: menuPos.x, top: menuPos.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button onClick={() => createItem('text', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <Type size={16} className="mr-3 text-zinc-400" /> Add Text
            </button>
            <button onClick={() => createItem('text-clear', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <Type size={16} className="mr-3 text-zinc-400 opacity-50" /> Add Clear Text
            </button>
            <button onClick={() => createItem('task', '')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <CheckSquare size={16} className="mr-3 text-zinc-400" /> Add Task
            </button>
            <div className="h-px bg-zinc-200 my-1 mx-2"></div>
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
              <File size={16} className="mr-3 text-zinc-400" /> Add File / Media
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
            <div className="h-px bg-zinc-200 my-1 mx-2"></div>
            <button onClick={() => createItem('ai', '[]')} className="w-full flex items-center px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 transition-colors">
              <Sparkles size={16} className="mr-3 text-purple-500" /> Add AI Block
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <input type="file" accept="*/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
    </div>
  );
};
