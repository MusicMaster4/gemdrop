import { createInitialData } from "./defaults";
import { cancelCompletion, startCompletion } from "./native";
import {
  createStorage,
  parseImport,
  validateData,
  type LibraryStorage,
} from "./store";
import type {
  AppData,
  ChatMessage,
  CompletionRequest,
  Conversation,
  Message,
  PresetDraft,
  Settings,
  StreamEvent,
} from "./types";

export interface LibraryState {
  data: AppData;
  ready: boolean;
  persistenceError: string | null;
  error: string | null;
  streamingConversationId: string | null;
}
interface CompletionTransport {
  start(
    request: CompletionRequest,
    receive: (event: StreamEvent) => void,
  ): Promise<void>;
  cancel(requestId: string): Promise<void>;
}
const transport: CompletionTransport = {
  start: startCompletion,
  cancel: cancelCompletion,
};
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Não foi possível concluir. Tente novamente.";

export function buildRequestMessages(
  conversation: Conversation,
): ChatMessage[] {
  return [
    { role: "system", content: conversation.systemPrompt },
    ...conversation.messages
      .filter((message) => message.content.trim())
      .map(({ role, content }) => ({ role, content })),
  ];
}

export class LibraryController {
  private state: LibraryState = {
    data: createInitialData(),
    ready: false,
    persistenceError: null,
    error: null,
    streamingConversationId: null,
  };
  private listeners = new Set<() => void>();
  private initPromise?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private storageBlocked = false;
  private active: {
    requestId: string;
    conversationId: string;
    assistantId: string;
    cancelled: boolean;
    failed: boolean;
  } | null = null;

  constructor(
    private readonly storage: LibraryStorage = createStorage(),
    private readonly completion: CompletionTransport = transport,
  ) {}

  getSnapshot = (): LibraryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private patch(patch: Partial<LibraryState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private change(data: AppData, deferred = false) {
    this.patch({ data });
    if (deferred) {
      if (!this.saveTimer)
        this.saveTimer = setTimeout(() => {
          this.saveTimer = undefined;
          this.persist();
        }, 250);
    } else {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.persist();
    }
  }
  private persist() {
    if (this.storageBlocked) return;
    const data = this.state.data;
    this.writes = this.writes
      .then(() => this.storage.write(data))
      .then(
        () => {
          if (this.state.persistenceError)
            this.patch({ persistenceError: null });
        },
        () =>
          this.patch({
            persistenceError:
              "Não foi possível salvar a biblioteca. Exporte uma cópia e verifique o espaço disponível.",
          }),
      );
  }
  flush = async (): Promise<void> => {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.persist();
    }
    await this.writes;
  };
  initialize = (): Promise<void> => {
    if (!this.initPromise)
      this.initPromise = (async () => {
        try {
          const data = await this.storage.read();
          if (data != null)
            this.patch({ data: validateData(data), ready: true });
          else {
            this.patch({ ready: true });
            this.persist();
          }
        } catch {
          this.storageBlocked = true;
          this.patch({
            ready: true,
            persistenceError:
              "Não foi possível ler a biblioteca. Seus arquivos foram preservados; alterações ficam apenas nesta sessão. Exporte uma cópia ou importe uma biblioteca para recuperar.",
          });
        }
      })();
    return this.initPromise;
  };
  clearError = () => this.patch({ error: null });

  savePreset = (input: PresetDraft, presetId?: string): string => {
    const title = input.title.trim();
    const systemPrompt = input.systemPrompt.trim();
    if (!title || !systemPrompt)
      throw new Error("Preencha o título e o system prompt.");
    if (
      title.length > 120 ||
      input.description.length > 500 ||
      systemPrompt.length > 100_000
    )
      throw new Error("O título, descrição ou system prompt é muito longo.");
    if (!/^#[0-9a-f]{6}$/i.test(input.color))
      throw new Error("Escolha uma cor válida.");
    if (typeof input.webSearch !== "boolean")
      throw new Error(
        "A configura\u00e7\u00e3o de acesso \u00e0 internet \u00e9 inv\u00e1lida.",
      );
    const existing = this.state.data.presets.find(
      (preset) => preset.id === presetId,
    );
    const timestamp = now();
    const preset = {
      id: existing?.id ?? id(),
      title,
      description: input.description.trim(),
      systemPrompt,
      icon: input.icon,
      color: input.color,
      favorite: input.favorite ?? existing?.favorite ?? false,
      webSearch: input.webSearch,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.change({
      ...this.state.data,
      presets: existing
        ? this.state.data.presets.map((item) =>
            item.id === preset.id ? preset : item,
          )
        : [preset, ...this.state.data.presets],
    });
    return preset.id;
  };
  deletePreset = (presetId: string): void => {
    this.change({
      ...this.state.data,
      presets: this.state.data.presets.filter(
        (preset) => preset.id !== presetId,
      ),
    });
  };
  toggleFavorite = (presetId: string): void => {
    this.change({
      ...this.state.data,
      presets: this.state.data.presets.map((preset) =>
        preset.id === presetId
          ? { ...preset, favorite: !preset.favorite, updatedAt: now() }
          : preset,
      ),
    });
  };
  createConversation = (presetId: string): string => {
    const preset = this.state.data.presets.find(
      (preset) => preset.id === presetId,
    );
    if (!preset) throw new Error("Preset não encontrado.");
    const timestamp = now();
    const conversation: Conversation = {
      id: id(),
      presetId,
      presetTitle: preset.title,
      title: "Nova conversa",
      systemPrompt: preset.systemPrompt,
      webSearch: preset.webSearch,
      messages: [],
      model: this.state.data.settings.model,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.change({
      ...this.state.data,
      conversations: [conversation, ...this.state.data.conversations],
    });
    return conversation.id;
  };
  deleteConversation = (conversationId: string): void => {
    if (this.active?.conversationId === conversationId)
      void this.stopGeneration();
    this.change({
      ...this.state.data,
      conversations: this.state.data.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      ),
    });
  };
  updateSettings = (patch: Partial<Settings>): void => {
    const settings = { ...this.state.data.settings, ...patch };
    if (
      !settings.model.trim() ||
      settings.model.length > 200 ||
      !Number.isFinite(settings.temperature) ||
      settings.temperature < 0 ||
      settings.temperature > 2
    )
      throw new Error("Configuração inválida.");
    this.change({ ...this.state.data, settings });
  };
  setConversationModel = (conversationId: string, model: string): void => {
    if (!model.trim() || model.length > 200)
      throw new Error("Escolha um modelo válido.");
    if (this.active?.conversationId === conversationId) return;
    this.updateConversation(conversationId, (conversation) => ({
      ...conversation,
      model,
      updatedAt: now(),
    }));
  };
  private updateConversation(
    conversationId: string,
    update: (conversation: Conversation) => Conversation,
    deferred = false,
  ) {
    this.change(
      {
        ...this.state.data,
        conversations: this.state.data.conversations.map((conversation) =>
          conversation.id === conversationId
            ? update(conversation)
            : conversation,
        ),
      },
      deferred,
    );
  }
  sendMessage = async (conversationId: string, text: string): Promise<void> => {
    if (this.active) {
      this.patch({
        error: "Aguarde a resposta atual ou interrompa a geração.",
      });
      return;
    }
    const content = text.trim();
    if (!content) return;
    if (content.length > 100_000) {
      this.patch({ error: "A mensagem deve ter até 100 mil caracteres." });
      return;
    }
    const conversation = this.state.data.conversations.find(
      (conversation) => conversation.id === conversationId,
    );
    if (!conversation) return;
    const message: Message = {
      id: id(),
      role: "user",
      content,
      createdAt: now(),
    };
    this.updateConversation(conversationId, (item) => ({
      ...item,
      title: item.messages.length ? item.title : content.slice(0, 72),
      messages: [...item.messages, message],
      updatedAt: now(),
    }));
    await this.generate(conversationId);
  };
  retryMessage = async (conversationId: string): Promise<void> => {
    if (this.active) return;
    const conversation = this.state.data.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation?.messages.length) return;
    const messages = [...conversation.messages];
    if (messages.at(-1)?.role === "assistant") messages.pop();
    if (messages.at(-1)?.role !== "user") return;
    this.updateConversation(conversationId, (item) => ({
      ...item,
      messages,
      updatedAt: now(),
    }));
    await this.generate(conversationId);
  };
  private async generate(conversationId: string): Promise<void> {
    const conversation = this.state.data.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) return;
    const request: CompletionRequest = {
      requestId: id(),
      model: conversation.model,
      messages: buildRequestMessages(conversation),
      temperature: this.state.data.settings.temperature,
      webSearch: conversation.webSearch,
    };
    const active = {
      requestId: request.requestId,
      conversationId,
      assistantId: id(),
      cancelled: false,
      failed: false,
    };
    this.active = active;
    this.patch({ streamingConversationId: conversationId, error: null });
    this.updateConversation(conversationId, (item) => ({
      ...item,
      messages: [
        ...item.messages,
        {
          id: active.assistantId,
          role: "assistant",
          content: "",
          createdAt: now(),
        },
      ],
    }));
    try {
      await this.completion.start(request, (event) => {
        if (this.active !== active || active.cancelled || active.failed) return;
        if (event.type === "delta") {
          this.updateConversation(
            conversationId,
            (item) => ({
              ...item,
              messages: item.messages.map((message) =>
                message.id === active.assistantId
                  ? { ...message, content: message.content + event.content }
                  : message,
              ),
              updatedAt: now(),
            }),
            true,
          );
        } else if (event.type === "error") {
          active.failed = true;
          this.patch({ error: event.message });
        }
      });
    } catch (error) {
      if (!active.cancelled) {
        active.failed = true;
        this.patch({ error: errorText(error) });
      }
    } finally {
      if (this.active === active) {
        this.finalizeMessage(
          active,
          active.cancelled ? "cancelled" : active.failed ? "error" : "complete",
        );
        this.active = null;
        this.patch({ streamingConversationId: null });
      }
    }
  }
  private finalizeMessage(
    active: NonNullable<LibraryController["active"]>,
    status: NonNullable<Message["status"]>,
  ) {
    this.updateConversation(active.conversationId, (item) => ({
      ...item,
      messages: item.messages
        .filter(
          (message) =>
            message.id !== active.assistantId || message.content.length > 0,
        )
        .map((message) =>
          message.id === active.assistantId ? { ...message, status } : message,
        ),
      updatedAt: now(),
    }));
  }
  stopGeneration = async (): Promise<void> => {
    const active = this.active;
    if (!active) return;
    active.cancelled = true;
    this.finalizeMessage(active, "cancelled");
    this.active = null;
    this.patch({ streamingConversationId: null });
    try {
      await this.completion.cancel(active.requestId);
    } catch {
      this.patch({
        error:
          "A resposta foi interrompida localmente. Não foi possível confirmar o cancelamento da conexão.",
      });
    }
  };
  importData = async (raw: string): Promise<void> => {
    const data = parseImport(raw);
    await this.stopGeneration();
    this.patch({ error: null });
    this.storageBlocked = false;
    this.change(data);
    await this.flush();
    if (this.state.persistenceError)
      throw new Error(this.state.persistenceError);
  };
  exportData = (): string => JSON.stringify(this.state.data, null, 2);
}
