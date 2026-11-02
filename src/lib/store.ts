import { isDesktop } from "./native";
import type { AppData, Conversation, Message, Preset } from "./types";

const STORAGE_KEY = "gemdrop.library.v1";
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export interface LibraryStorage {
  read(): Promise<unknown>;
  write(data: AppData): Promise<void>;
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Arquivo de biblioteca inválido.");
  return value as Record<string, unknown>;
};
const string = (value: unknown, max = 100_000): string => {
  if (typeof value !== "string" || value.length > max)
    throw new Error("A biblioteca contém um campo inválido ou muito longo.");
  return value;
};
const date = (value: unknown): string => {
  const result = string(value, 40);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error("A biblioteca contém uma data inválida.");
  return result;
};
const list = (value: unknown, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("A biblioteca contém uma lista inválida ou muito grande.");
  return value;
};
function uniqueIds(items: { id: string }[]) {
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some((item) => !item.id)
  )
    throw new Error("A biblioteca contém identificadores repetidos ou vazios.");
}

export function validateData(input: unknown): AppData {
  const data = record(input);
  if (data.version !== 1)
    throw new Error("Versão de biblioteca não suportada.");
  const presets: Preset[] = list(data.presets, 5_000).map((input) => {
    const preset = record(input);
    const color = string(preset.color, 7);
    if (!/^#[0-9a-f]{6}$/i.test(color) || typeof preset.favorite !== "boolean")
      throw new Error("A biblioteca contém um preset inválido.");
    const title = string(preset.title, 120);
    const systemPrompt = string(preset.systemPrompt);
    if (!title.trim() || !systemPrompt.trim())
      throw new Error("Todo preset precisa de título e system prompt.");
    return {
      id: string(preset.id, 100),
      title,
      description: string(preset.description, 500),
      systemPrompt,
      icon: string(preset.icon, 40),
      color,
      favorite: preset.favorite,
      createdAt: date(preset.createdAt),
      updatedAt: date(preset.updatedAt),
    };
  });
  const conversations: Conversation[] = list(data.conversations, 10_000).map(
    (input) => {
      const conversation = record(input);
      const messages: Message[] = list(conversation.messages, 50_000).map(
        (input) => {
          const message = record(input);
          if (message.role !== "user" && message.role !== "assistant")
            throw new Error("A biblioteca contém uma mensagem inválida.");
          const status = message.status;
          if (
            status !== undefined &&
            status !== "complete" &&
            status !== "cancelled" &&
            status !== "error"
          )
            throw new Error(
              "A biblioteca contém um estado de mensagem inválido.",
            );
          return {
            id: string(message.id, 100),
            role: message.role,
            content: string(message.content, 2_000_000),
            createdAt: date(message.createdAt),
            ...(status ? { status } : {}),
          };
        },
      );
      uniqueIds(messages);
      return {
        id: string(conversation.id, 100),
        presetId: string(conversation.presetId, 100),
        ...(conversation.presetTitle === undefined
          ? {}
          : { presetTitle: string(conversation.presetTitle, 120) }),
        title: string(conversation.title, 160),
        systemPrompt: string(conversation.systemPrompt),
        messages,
        model: string(conversation.model, 200),
        createdAt: date(conversation.createdAt),
        updatedAt: date(conversation.updatedAt),
      };
    },
  );
  uniqueIds(presets);
  uniqueIds(conversations);
  const settings = record(data.settings);
  const temperature = settings.temperature;
  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2
  )
    throw new Error("Temperatura inválida.");
  const model = string(settings.model, 200);
  if (!model.trim()) throw new Error("Escolha um modelo.");
  // Construct every field explicitly: API keys or unrelated imported properties never survive.
  return {
    version: 1,
    presets,
    conversations,
    settings: { model, temperature },
  };
}

export function parseImport(raw: string): AppData {
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES)
    throw new Error("O arquivo deve ter até 25 MB.");
  try {
    return validateData(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("Escolha um arquivo JSON de biblioteca válido.");
    throw error;
  }
}

export function createStorage(): LibraryStorage {
  if (isDesktop()) {
    const store = import("@tauri-apps/plugin-store").then(({ load }) =>
      load("library.json", { autoSave: false, defaults: {} }),
    );
    return {
      async read() {
        return (await store).get<unknown>("library");
      },
      async write(data) {
        const storage = await store;
        await storage.set("library", data);
        await storage.save();
      },
    };
  }
  return {
    async read() {
      const value = localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    },
    async write(data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
  };
}
