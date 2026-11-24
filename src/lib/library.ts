import { isReasoningEffort } from "./reasoning";
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
  errors: ReadonlyMap<string, string>;
  streamingConversationIds: ReadonlySet<string>;
}
interface ActiveGeneration {
  requestId: string;
  assistantId: string;
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
    errors: new Map(),
    streamingConversationIds: new Set(),
  };
  private listeners = new Set<() => void>();
  private initPromise?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private storageBlocked = false;
  private active = new Map<string, ActiveGeneration>();

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
  clearError = (conversationId: string): void => {
    if (!this.state.errors.has(conversationId)) return;
    const errors = new Map(this.state.errors);
    errors.delete(conversationId);
    this.patch({ errors });
  };
  private setError(conversationId: string, error: string) {
    const errors = new Map(this.state.errors);
    errors.set(conversationId, error);
    this.patch({ errors });
  }

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
    const model =
      input.model === undefined
        ? (existing?.model ?? null)
        : (input.model?.trim() ?? null);
    const reasoningEffort =
      input.reasoningEffort === undefined
        ? (existing?.reasoningEffort ?? null)
        : input.reasoningEffort;
    if (model !== null && (!model || model.length > 200 || /\s/.test(model)))
      throw new Error("Escolha um modelo válido.");
    if (reasoningEffort !== null && !isReasoningEffort(reasoningEffort))
      throw new Error("Esforço de raciocínio inválido.");
    const timestamp = now();
    const preset = {
      id: existing?.id ?? id(),
      title,
      description: input.description.trim(),
      systemPrompt,
      icon: input.icon,
      color: input.color,
      favorite: input.favorite ?? existing?.favorite ?? false,
      model,
      reasoningEffort,
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
      model: preset.model ?? this.state.data.settings.model,
      reasoningEffort:
        preset.reasoningEffort ?? this.state.data.settings.reasoningEffort,
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
    void this.stopGeneration(conversationId);
    this.clearError(conversationId);
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
      !isReasoningEffort(settings.reasoningEffort) ||
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
    if (this.active.has(conversationId)) return;
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
    if (this.active.has(conversationId)) return;
    const conversation = this.state.data.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) return;
    const content = text.trim();
    if (!content) return;
    if (content.length > 100_000) {
      this.setError(
        conversationId,
        "A mensagem deve ter até 100 mil caracteres.",
      );
      return;
    }
    const message: Message = {
      id: id(),
      role: "user",
      content,
      createdAt: now(),
    };
    await this.generate({
      ...conversation,
      title: conversation.messages.length
        ? conversation.title
        : content.slice(0, 72),
      messages: [...conversation.messages, message],
      updatedAt: now(),
    });
  };
  retryMessage = async (conversationId: string): Promise<void> => {
    if (this.active.has(conversationId)) return;
    const conversation = this.state.data.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation?.messages.length) return;
    const messages = [...conversation.messages];
    if (messages.at(-1)?.role === "assistant") messages.pop();
    if (messages.at(-1)?.role !== "user") return;
    await this.generate({ ...conversation, messages, updatedAt: now() });
  };
  private async generate(conversation: Conversation): Promise<void> {
    const conversationId = conversation.id;
    const request: CompletionRequest = {
      requestId: id(),
      model: conversation.model,
      reasoningEffort: conversation.reasoningEffort,
      messages: buildRequestMessages(conversation),
      temperature: this.state.data.settings.temperature,
      webSearch: conversation.webSearch,
    };
    const active: ActiveGeneration = {
      requestId: request.requestId,
      assistantId: id(),
    };
    this.active.set(conversationId, active);
    this.clearError(conversationId);
    this.patch({ streamingConversationIds: new Set(this.active.keys()) });
    this.updateConversation(conversationId, () => ({
      ...conversation,
      messages: [
        ...conversation.messages,
        {
          id: active.assistantId,
          role: "assistant",
          content: "",
          createdAt: now(),
        },
      ],
    }));
    let error: string | undefined;
    try {
      await this.completion.start(request, (event) => {
        if (this.active.get(conversationId) !== active || error !== undefined)
          return;
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
            }),
            true,
          );
        } else if (event.type === "error") {
          error = event.message;
        }
      });
    } catch (cause) {
      error ??= errorText(cause);
    } finally {
      if (this.active.get(conversationId) === active) {
        if (error !== undefined) this.setError(conversationId, error);
        this.finishGeneration(
          conversationId,
          active.assistantId,
          error === undefined ? "complete" : "error",
        );
      }
    }
  }
  private finishGeneration(
    conversationId: string,
    assistantId: string,
    status: NonNullable<Message["status"]>,
  ) {
    this.active.delete(conversationId);
    this.updateConversation(conversationId, (item) => ({
      ...item,
      messages: item.messages
        .filter(
          (message) =>
            message.id !== assistantId || message.content.length > 0,
        )
        .map((message) =>
          message.id === assistantId ? { ...message, status } : message,
        ),
      updatedAt: now(),
    }));
    this.patch({ streamingConversationIds: new Set(this.active.keys()) });
  }
  stopGeneration = async (conversationId: string): Promise<void> => {
    const active = this.active.get(conversationId);
    if (!active) return;
    this.finishGeneration(conversationId, active.assistantId, "cancelled");
    const conversation = this.state.data.conversations.find(
      (item) => item.id === conversationId,
    );
    try {
      await this.completion.cancel(active.requestId);
    } catch {
      if (conversation && this.state.data.conversations.includes(conversation))
        this.setError(
          conversationId,
          "A resposta foi interrompida localmente. Não foi possível confirmar o cancelamento da conexão.",
        );
    }
  };
  stopAllGenerations = async (): Promise<void> => {
    await Promise.all([...this.active.keys()].map(this.stopGeneration));
  };
  importData = async (raw: string): Promise<void> => {
    const data = parseImport(raw);
    const stopping = this.stopAllGenerations();
    this.patch({ errors: new Map() });
    this.storageBlocked = false;
    this.change(data);
    await stopping;
    await this.flush();
    if (this.state.persistenceError)
      throw new Error(this.state.persistenceError);
  };
  exportData = (): string => JSON.stringify(this.state.data, null, 2);
}
