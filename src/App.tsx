import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileText,
  Globe2,
  History,
  Library,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLibrary } from "./hooks/useLibrary";
import { fetchModels, getApiKeyStatus, isDesktop } from "./lib/native";
import type { Conversation, Model, Preset } from "./lib/types";
import { Dialog } from "./components/Dialog";
import { GemdropMark, PresetIcon } from "./components/PresetIcon";
import { PresetEditor } from "./components/PresetEditor";
import { SettingsDialog } from "./components/SettingsDialog";
import { ModelPicker } from "./components/ModelPicker";
import "./styles.css";

const fallbackModels: Model[] = [
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 mini", contextLength: 1047576 },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    contextLength: 200000,
  },
  { id: "openai/gpt-5.2", name: "GPT-5.2", contextLength: 400000 },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    contextLength: 1000000,
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    contextLength: 163840,
  },
  { id: "openrouter/free", name: "Modelos gratuitos", contextLength: 128000 },
];
const dateLabel = (value: string | number) =>
  new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
function IconButton({
  children,
  label,
  onClick,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function modelShortName(id: string, models: Model[]) {
  return (
    models.find((model) => model.id === id)?.name ?? id.split("/").at(-1) ?? id
  );
}

function WebAccessIndicator() {
  return (
    <span
      className="web-access-indicator"
      role="img"
      aria-label="Internet ativada"
      title="Internet ativada"
    >
      <Globe2 size={14} />
    </span>
  );
}

export default function App() {
  const library = useLibrary();
  const { data, ready, persistenceError, streamingConversationId, error } =
    library;
  const [view, setView] = useState<
    "library" | "favorites" | "history" | "chat"
  >("library");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [editor, setEditor] = useState<Preset | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelPicker, setModelPicker] = useState<"settings" | "chat" | null>(
    null,
  );
  const [models, setModels] = useState<Model[]>(fallbackModels);
  const [hasKey, setHasKey] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    action: () => void;
  } | null>(null);
  useEffect(() => {
    void getApiKeyStatus()
      .then(setHasKey)
      .catch(() => {});
    void fetchModels()
      .then((items) => {
        if (items.length) setModels(items);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "n" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setEditor("new");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const conversations = useMemo(
    () =>
      [...data.conversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [data.conversations],
  );
  const activeConversation = data.conversations.find(
    (item) => item.id === conversationId,
  );
  const activePreset = data.presets.find(
    (item) => item.id === activeConversation?.presetId,
  );
  const filteredPresets = useMemo(
    () =>
      data.presets
        .filter(
          (preset) =>
            (view !== "favorites" || preset.favorite) &&
            `${preset.title} ${preset.description} ${preset.systemPrompt}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.localeCompare(b.title, "pt-BR")
            : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [data.presets, search, sort, view],
  );
  const filteredConversations = conversations.filter((item) =>
    `${item.title} ${data.presets.find((preset) => preset.id === item.presetId)?.title ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function navigate(next: "library" | "favorites" | "history") {
    setView(next);
    setSearch("");
  }
  function openConversation(id: string) {
    setConversationId(id);
    setView("chat");
    setSearch("");
    library.clearError();
  }
  function startConversation(presetId: string) {
    openConversation(library.createConversation(presetId));
  }
  function exportBackup() {
    const blob = new Blob([library.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gemdrop-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Backup exportado.");
  }
  function removePreset(preset: Preset) {
    setConfirmation({
      title: "Excluir preset?",
      text: `“${preset.title}” será removido. As conversas salvas continuarão no histórico.`,
      action: () => {
        library.deletePreset(preset.id);
        setEditor(null);
        setToast("Preset excluído.");
      },
    });
  }
  function removeConversation(conversation: Conversation) {
    setConfirmation({
      title: "Excluir conversa?",
      text: `“${conversation.title}” será excluída deste dispositivo.`,
      action: () => {
        library.deleteConversation(conversation.id);
        if (conversationId === conversation.id) navigate("history");
        setToast("Conversa excluída.");
      },
    });
  }
  async function send(text: string) {
    if (!activeConversation) return false;
    if (!isDesktop() || !hasKey) {
      setSettingsOpen(true);
      return false;
    }
    void library.sendMessage(activeConversation.id, text);
    return true;
  }
  if (!ready)
    return (
      <div className="loading-screen">
        <GemdropMark size={39} />
        <LoaderCircle size={21} className="spin" aria-label="Carregando" />
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("library")}
          aria-label="Gemdrop, abrir biblioteca"
        >
          <GemdropMark />
          <span>
            gemdrop<span className="brand-dot">.</span>
          </span>
        </button>
        <nav className="main-nav" aria-label="Navegação principal">
          <button
            className={`nav-item ${view === "library" ? "active" : ""}`}
            aria-label="Biblioteca"
            onClick={() => navigate("library")}
          >
            <Library size={18} />
            <span>Biblioteca</span>
            <span className="nav-count">{data.presets.length}</span>
          </button>
          <button
            className={`nav-item ${view === "favorites" ? "active" : ""}`}
            aria-label="Favoritos"
            onClick={() => navigate("favorites")}
          >
            <Star size={18} />
            <span>Favoritos</span>
          </button>
          <button
            className={`nav-item ${view === "history" ? "active" : ""}`}
            aria-label="Histórico"
            onClick={() => navigate("history")}
          >
            <History size={18} />
            <span>Histórico</span>
          </button>
        </nav>
        <div className="sidebar-conversations">
          <div className="sidebar-section-title">
            <span>Conversas recentes</span>
            {conversations.length > 0 && (
              <IconButton
                label="Ver histórico"
                onClick={() => navigate("history")}
              >
                <ArrowUpRight size={15} />
              </IconButton>
            )}
          </div>
          {conversations.length ? (
            conversations.slice(0, 7).map((conversation) => {
              const preset = data.presets.find(
                (item) => item.id === conversation.presetId,
              );
              return (
                <button
                  key={conversation.id}
                  className={`recent-item ${view === "chat" && conversationId === conversation.id ? "active" : ""}`}
                  onClick={() => openConversation(conversation.id)}
                >
                  <span
                    className="recent-dot"
                    style={{ background: preset?.color ?? "#a7a2b7" }}
                  />
                  <span>{conversation.title}</span>
                  {streamingConversationId === conversation.id && (
                    <LoaderCircle className="spin" size={12} />
                  )}
                </button>
              );
            })
          ) : (
            <div className="recent-empty">
              <MessageSquare size={20} strokeWidth={1.3} />
              <p>Suas conversas ficam aqui.</p>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item settings-nav"
            aria-label="Configurações"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
            <span>Configurações</span>
            <span
              className={`connection-dot ${hasKey ? "connected" : ""}`}
              title={hasKey ? "OpenRouter conectado" : "Configure sua chave"}
            />
          </button>
        </div>
      </aside>
      <main
        className={`main-panel ${view === "chat" && activeConversation ? "chat-panel" : ""}`}
      >
        {view === "chat" && activeConversation ? (
          <ChatView
            key={activeConversation.id}
            conversation={activeConversation}
            preset={activePreset}
            modelName={modelShortName(activeConversation.model, models)}
            streaming={streamingConversationId === activeConversation.id}
            anotherStreaming={Boolean(
              streamingConversationId &&
              streamingConversationId !== activeConversation.id,
            )}
            error={error}
            onClearError={library.clearError}
            onBack={() => navigate("library")}
            onSend={send}
            onStop={() => void library.stopGeneration()}
            onRetry={() => void library.retryMessage(activeConversation.id)}
            onChooseModel={() => setModelPicker("chat")}
            onNew={() => activePreset && startConversation(activePreset.id)}
            onEdit={() => activePreset && setEditor(activePreset)}
            onDelete={() => removeConversation(activeConversation)}
            onToast={setToast}
          />
        ) : (
          <>
            <header className="page-header">
              <div className="page-heading">
                <h1>
                  {view === "history"
                    ? "Suas conversas"
                    : view === "favorites"
                      ? "Favoritos"
                      : "Biblioteca"}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {view === "history"
                    ? "Continue de onde a ideia parou."
                    : view === "favorites"
                      ? "Os prompts que você quer por perto."
                      : "Bons prompts. Boas conversas."}
                </p>
              </div>
              <button
                className="button primary new-preset-button"
                onClick={() => setEditor("new")}
              >
                <Plus size={18} />
                Novo preset
              </button>
            </header>
            <div className="library-content">
              <div className="library-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label={
                      view === "history" ? "Buscar conversas" : "Buscar presets"
                    }
                    placeholder={
                      view === "history"
                        ? "Buscar conversas..."
                        : "Buscar um preset..."
                    }
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <IconButton
                      label="Limpar busca"
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </IconButton>
                  )}
                </div>
                <div className="toolbar-right">
                  <span className="result-count">
                    {view === "history"
                      ? `${filteredConversations.length} ${filteredConversations.length === 1 ? "conversa" : "conversas"}`
                      : `${filteredPresets.length} presets`}
                  </span>
                  {view !== "history" && (
                    <label className="sort-select">
                      <SlidersHorizontal size={14} />
                      <select
                        aria-label="Ordenar presets"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                      >
                        <option value="recent">Recentes</option>
                        <option value="name">Nome</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  )}
                </div>
              </div>
              {view === "history" ? (
                <div className="history-list">
                  {filteredConversations.map((conversation) => {
                    const preset = data.presets.find(
                      (item) => item.id === conversation.presetId,
                    );
                    return (
                      <div className="history-row" key={conversation.id}>
                        <button
                          className="history-open"
                          onClick={() => openConversation(conversation.id)}
                        >
                          <PresetIcon
                            icon={preset?.icon ?? "sparkles"}
                            color={preset?.color ?? "#b7a0e8"}
                            size={20}
                          />
                          <span className="history-info">
                            <strong>{conversation.title}</strong>
                            <span>
                              {preset?.title ??
                                conversation.presetTitle ??
                                "Preset removido"}
                              <i>·</i>
                              {conversation.messages.length} mensagens
                            </span>
                          </span>
                          <span className="history-date">
                            {dateLabel(conversation.updatedAt)}
                          </span>
                          <ArrowUpRight size={18} className="history-arrow" />
                        </button>
                        <IconButton
                          className="history-delete"
                          label={`Excluir conversa ${conversation.title}`}
                          onClick={() => removeConversation(conversation)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    );
                  })}
                  {!filteredConversations.length && (
                    <EmptyState
                      icon="history"
                      title={
                        search
                          ? "Nenhuma conversa encontrada"
                          : "Uma boa conversa começa aqui"
                      }
                      text={
                        search
                          ? "Tente buscar por outro nome."
                          : "Escolha um preset na biblioteca para começar."
                      }
                      action={
                        !search ? (
                          <button
                            className="button secondary"
                            onClick={() => navigate("library")}
                          >
                            Abrir biblioteca
                            <ArrowRight size={16} />
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="preset-grid">
                  {filteredPresets.map((preset, index) => {
                    const count = data.conversations.filter(
                      (conversation) => conversation.presetId === preset.id,
                    ).length;
                    return (
                      <article
                        className="preset-card"
                        key={preset.id}
                        style={
                          {
                            "--preset-color": preset.color,
                            "--card-delay": `${Math.min(index, 8) * 35}ms`,
                          } as CSSProperties
                        }
                      >
                        <div className="card-top">
                          <PresetIcon
                            icon={preset.icon}
                            color={preset.color}
                            size={25}
                          />
                          <div className="card-actions">
                            <IconButton
                              className={preset.favorite ? "is-favorite" : ""}
                              label={
                                preset.favorite
                                  ? `Desfavoritar ${preset.title}`
                                  : `Favoritar ${preset.title}`
                              }
                              onClick={() => library.toggleFavorite(preset.id)}
                            >
                              <Star
                                size={16}
                                fill={preset.favorite ? "currentColor" : "none"}
                              />
                            </IconButton>
                            <details className="card-menu">
                              <summary
                                className="icon-button"
                                aria-label={`Opções de ${preset.title}`}
                              >
                                <MoreHorizontal size={18} />
                              </summary>
                              <div className="dropdown-menu">
                                <button
                                  onClick={(event) => {
                                    event.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                    setEditor(preset);
                                  }}
                                >
                                  <Pencil size={15} />
                                  Editar preset
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                    library.savePreset({
                                      ...preset,
                                      title: `${preset.title} (cópia)`,
                                    });
                                    setToast("Preset duplicado.");
                                  }}
                                >
                                  <Copy size={15} />
                                  Duplicar
                                </button>
                                <button
                                  className="danger-text"
                                  onClick={(event) => {
                                    event.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                    removePreset(preset);
                                  }}
                                >
                                  <Trash2 size={15} />
                                  Excluir
                                </button>
                              </div>
                            </details>
                          </div>
                        </div>
                        <button
                          className="card-content"
                          onClick={() => startConversation(preset.id)}
                          aria-label={`Conversar com ${preset.title}`}
                        >
                          <h2>{preset.title}</h2>
                          <p>
                            {preset.description ||
                              "Pronto para a sua próxima conversa."}
                          </p>
                        </button>
                        <div className="card-footer">
                          <span>
                            <MessageSquare size={13} />
                            {preset.webSearch && <WebAccessIndicator />}
                            {count
                              ? `${count} ${count === 1 ? "conversa" : "conversas"}`
                              : "Uma nova conversa"}
                          </span>
                          <button
                            className="card-open"
                            onClick={() => startConversation(preset.id)}
                            aria-label={`Abrir ${preset.title}`}
                          >
                            <ArrowUpRight size={18} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {view === "library" &&
                    !search &&
                    data.presets.length === 0 && (
                      <button
                        className="new-preset-card"
                        onClick={() => setEditor("new")}
                      >
                        <span className="new-card-icon">
                          <Plus size={24} strokeWidth={1.3} />
                        </span>
                        <strong>Seu próximo preset</strong>
                        <span>Dê um novo papel à sua IA.</span>
                      </button>
                    )}
                  {!filteredPresets.length &&
                    (search || view === "favorites") && (
                      <EmptyState
                        icon="library"
                        title={
                          search
                            ? "Nenhum preset encontrado"
                            : "Seus favoritos, bem aqui"
                        }
                        text={
                          search
                            ? "Tente outro nome ou uma palavra do prompt."
                            : "Toque na estrela de um preset para guardá-lo aqui."
                        }
                      />
                    )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
      {persistenceError && (
        <div className="persistence-error" role="alert">
          {persistenceError}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {editor && (
        <PresetEditor
          preset={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSave={(draft, id) => {
            library.savePreset(draft, id);
            setToast(id ? "Preset atualizado." : "Preset criado.");
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={data.settings}
          modelName={modelShortName(data.settings.model, models)}
          onClose={() => setSettingsOpen(false)}
          onChooseModel={() => setModelPicker("settings")}
          onUpdate={library.updateSettings}
          onExport={exportBackup}
          onImport={library.importData}
          onKeyChanged={(value) => {
            setHasKey(value);
            if (value)
              void fetchModels()
                .then((items) => {
                  if (items.length) setModels(items);
                })
                .catch(() => {});
          }}
        />
      )}
      {modelPicker && (
        <ModelPicker
          models={models}
          selected={
            modelPicker === "chat"
              ? (activeConversation?.model ?? data.settings.model)
              : data.settings.model
          }
          onClose={() => setModelPicker(null)}
          onSelect={(model) => {
            if (modelPicker === "chat" && activeConversation)
              library.setConversationModel(activeConversation.id, model);
            else library.updateSettings({ model });
          }}
        />
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          onClose={() => setConfirmation(null)}
          className="confirm-dialog"
        >
          <p className="confirm-text">{confirmation.text}</p>
          <div className="dialog-footer">
            <button
              className="button secondary"
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              Excluir
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: "history" | "library";
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        {icon === "history" ? (
          <MessageSquare size={30} strokeWidth={1.3} />
        ) : (
          <BookOpen size={30} strokeWidth={1.3} />
        )}
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

function ChatView({
  conversation,
  preset,
  modelName,
  streaming,
  anotherStreaming,
  error,
  onClearError,
  onBack,
  onSend,
  onStop,
  onRetry,
  onChooseModel,
  onNew,
  onEdit,
  onDelete,
  onToast,
}: {
  conversation: Conversation;
  preset?: Preset;
  modelName: string;
  streaming: boolean;
  anotherStreaming: boolean;
  error: string | null;
  onClearError: () => void;
  onBack: () => void;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  onRetry: () => void;
  onChooseModel: () => void;
  onNew: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToast: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessage = conversation.messages.at(-1);
  useEffect(() => {
    if (atBottom)
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: streaming ? "instant" : "smooth",
      });
  }, [lastMessage?.content, conversation.messages.length, streaming, atBottom]);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    const field = textareaRef.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
    }
  }, [draft]);
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || streaming || anotherStreaming) return;
    if (await onSend(text)) {
      setDraft("");
      setAtBottom(true);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      onToast("Copiado.");
    } catch {
      onToast("Não foi possível copiar.");
    }
  }
  function exportChat() {
    const text = `# ${conversation.title}\n\n${conversation.messages.map((message) => `## ${message.role === "user" ? "Você" : (preset?.title ?? conversation.presetTitle ?? "Assistente")}\n\n${message.content}`).join("\n\n")}`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `gemdrop-conversa-${conversation.id.slice(0, 8)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="chat-header">
        <div className="chat-heading">
          <IconButton label="Voltar à biblioteca" onClick={onBack}>
            <ChevronLeft size={21} />
          </IconButton>
          <PresetIcon
            icon={preset?.icon ?? "sparkles"}
            color={preset?.color ?? "#b7a0e8"}
            size={20}
          />
          <div>
            <h1>
              {preset?.title ?? conversation.presetTitle ?? "Conversa salva"}
            </h1>
            <span>
              {conversation.messages.length
                ? conversation.title
                : "Nova conversa"}
            </span>
          </div>
        </div>
        <div className="chat-header-actions">
          {conversation.webSearch && <WebAccessIndicator />}
          <button
            className={`button ghost prompt-toggle ${showPrompt ? "selected" : ""}`}
            onClick={() => setShowPrompt(!showPrompt)}
          >
            <FileText size={15} />
            <span>Prompt</span>
          </button>
          {preset && (
            <IconButton label="Nova conversa com este preset" onClick={onNew}>
              <Plus size={19} />
            </IconButton>
          )}
          <details className="card-menu">
            <summary className="icon-button" aria-label="Opções da conversa">
              <MoreHorizontal size={20} />
            </summary>
            <div className="dropdown-menu">
              <button
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  exportChat();
                }}
              >
                <ArrowDownToLine size={15} />
                Exportar conversa
              </button>
              {preset && (
                <button
                  onClick={(event) => {
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                    onEdit();
                  }}
                >
                  <Pencil size={15} />
                  Editar preset
                </button>
              )}
              <button className="danger-text" onClick={onDelete}>
                <Trash2 size={15} />
                Excluir conversa
              </button>
            </div>
          </details>
        </div>
      </header>
      <div className={`chat-workspace ${showPrompt ? "with-prompt" : ""}`}>
        <div className="chat-main">
          <div
            className="messages-scroll"
            ref={scrollRef}
            onScroll={(event) => {
              const target = event.currentTarget;
              setAtBottom(
                target.scrollHeight - target.scrollTop - target.clientHeight <
                  100,
              );
            }}
          >
            {conversation.messages.length === 0 ? (
              <div className="chat-welcome">
                <PresetIcon
                  className="welcome-icon"
                  icon={preset?.icon ?? "sparkles"}
                  color={preset?.color ?? "#b7a0e8"}
                  size={37}
                />
                <h2>{preset?.title ?? "Vamos conversar?"}</h2>
                <p>
                  {preset?.description ||
                    "Um novo espaço para desenvolver suas ideias."}
                </p>
                <div className="welcome-rule" />
              </div>
            ) : (
              <div className="messages-list">
                {conversation.messages.map((message, index) => (
                  <article
                    key={message.id}
                    className={`message ${message.role}`}
                  >
                    <div className="message-avatar">
                      {message.role === "assistant" ? (
                        <PresetIcon
                          icon={preset?.icon ?? "sparkles"}
                          color={preset?.color ?? "#b7a0e8"}
                          size={17}
                        />
                      ) : (
                        <span>V</span>
                      )}
                    </div>
                    <div className="message-body">
                      <div className="message-author">
                        {message.role === "user"
                          ? "Você"
                          : (preset?.title ??
                            conversation.presetTitle ??
                            "Assistente")}
                        {message.role === "assistant" && (
                          <span>{modelName}</span>
                        )}
                      </div>
                      <div className="markdown-content">
                        {message.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ children, href }) => (
                                <a
                                  className="markdown-link"
                                  href={
                                    href && /^https?:\/\//i.test(href)
                                      ? href
                                      : undefined
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => {
                                    if (isDesktop() && href) {
                                      event.preventDefault();
                                      if (/^https?:\/\//i.test(href))
                                        void openUrl(href).catch(() =>
                                          onToast(
                                            "Não foi possível abrir o link.",
                                          ),
                                        );
                                    }
                                  }}
                                >
                                  {children}
                                </a>
                              ),
                              pre: ({ children }) => (
                                <div className="code-block">
                                  <pre>{children}</pre>
                                </div>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        ) : streaming &&
                          index === conversation.messages.length - 1 ? (
                          <span
                            className="thinking-dots"
                            aria-label="Escrevendo"
                          >
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          <span className="muted">Resposta interrompida.</span>
                        )}
                      </div>
                      {message.content && (
                        <div className="message-actions">
                          <IconButton
                            label="Copiar mensagem"
                            onClick={() => void copy(message.content)}
                          >
                            <Copy size={13} />
                          </IconButton>
                          {message.role === "assistant" &&
                            index === conversation.messages.length - 1 &&
                            !streaming &&
                            !anotherStreaming && (
                              <IconButton
                                label="Gerar outra resposta"
                                onClick={onRetry}
                              >
                                <RotateCcw size={13} />
                              </IconButton>
                            )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          {!atBottom && (
            <button
              className="scroll-bottom icon-button"
              aria-label="Ir para última mensagem"
              onClick={() => {
                setAtBottom(true);
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: "smooth",
                });
              }}
            >
              <ArrowDown size={18} />
            </button>
          )}
          <div className="composer-area">
            {error && (
              <div className="chat-error" role="alert">
                <span>{error}</span>
                {!streaming &&
                  !anotherStreaming &&
                  conversation.messages.length > 0 && (
                    <button
                      type="button"
                      className="button ghost"
                      onClick={onRetry}
                    >
                      <RotateCcw size={14} />
                      Tentar novamente
                    </button>
                  )}
                <IconButton label="Fechar erro" onClick={onClearError}>
                  <X size={14} />
                </IconButton>
              </div>
            )}
            <form
              className={`composer ${streaming ? "is-streaming" : ""}`}
              onSubmit={(event) => void submit(event)}
            >
              <textarea
                ref={textareaRef}
                aria-label="Mensagem"
                maxLength={100000}
                placeholder={
                  anotherStreaming
                    ? "Outra conversa está respondendo..."
                    : "O que vamos criar hoje?"
                }
                rows={1}
                value={draft}
                disabled={anotherStreaming}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
              <div className="composer-bottom">
                <button
                  type="button"
                  className="model-button"
                  onClick={onChooseModel}
                  disabled={streaming}
                >
                  <span className="model-dot" />
                  {modelName}
                  <ChevronDown size={13} />
                </button>
                {streaming ? (
                  <button
                    type="button"
                    className="send-button stop-button"
                    onClick={onStop}
                    aria-label="Parar resposta"
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!draft.trim() || anotherStreaming}
                    aria-label="Enviar mensagem"
                  >
                    <ArrowUp size={20} strokeWidth={2} />
                  </button>
                )}
              </div>
            </form>
            <div className="composer-hint">
              <span>
                {streaming ? (
                  <>
                    <span className="status-dot" />
                    Escrevendo...
                  </>
                ) : (
                  "Enter para enviar · Shift + Enter para pular linha"
                )}
              </span>
              <span>Salvo automaticamente</span>
            </div>
          </div>
        </div>
        {showPrompt && (
          <aside className="prompt-panel">
            <div className="prompt-panel-heading">
              <h2>System prompt</h2>
              <IconButton
                label="Fechar prompt"
                onClick={() => setShowPrompt(false)}
              >
                <X size={16} />
              </IconButton>
            </div>
            <p>O ponto de partida desta conversa.</p>
            <pre>{conversation.systemPrompt}</pre>
            <button
              className="button secondary"
              onClick={() => void copy(conversation.systemPrompt)}
            >
              <Copy size={15} />
              Copiar prompt
            </button>
          </aside>
        )}
      </div>
    </>
  );
}
