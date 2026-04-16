export type ItemType = 'text' | 'text-clear' | 'task' | 'image' | 'embed' | 'video' | 'arrow' | 'ai';

export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface BoardItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  content: string; // text, base64 image URL, embed URL, legacy task
  checked?: boolean; // legacy task
  tasks?: TaskItem[]; // modern multi-task
  endX?: number; // for arrow end point
  endY?: number; // for arrow end point
}

export type DayData = Record<string, BoardItem[]>; // Key is YYYY-MM-DD
