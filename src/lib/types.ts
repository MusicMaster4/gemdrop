export interface Preset {
  id: string;
  title: string;
  description: string;
  systemPrompt: string;
  icon: string;
  color: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PresetDraft = Pick<
  Preset,
  "title" | "description" | "systemPrompt" | "icon" | "color"
> & { favorite?: boolean };

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "complete" | "cancelled" | "error";
}

export interface Conversation {
  id: string;
  presetId: string;
  presetTitle?: string;
  title: string;
  systemPrompt: string;
  messages: Message[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  model: string;
  temperature: number;
}

export interface AppData {
  version: 1;
  presets: Preset[];
  conversations: Conversation[];
  settings: Settings;
}

export interface Model {
  id: string;
  name: string;
  contextLength: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  requestId: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
}

export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };
