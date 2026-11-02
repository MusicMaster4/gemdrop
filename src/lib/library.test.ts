import { describe, expect, it, vi } from "vitest";
import { LibraryController, buildRequestMessages } from "./library";
import { createInitialData } from "./defaults";
import { parseImport, validateData, type LibraryStorage } from "./store";
import type { AppData, CompletionRequest, StreamEvent } from "./types";

vi.mock("./native", () => ({
  isDesktop: () => false,
  startCompletion: vi.fn(),
  cancelCompletion: vi.fn(),
}));

function setup(
  start: (
    request: CompletionRequest,
    receive: (event: StreamEvent) => void,
  ) => Promise<void> = async (_request, receive) => {
    receive({ type: "delta", content: "Resposta" });
    receive({ type: "done" });
  },
) {
  let saved: AppData | null = null;
  const storage: LibraryStorage = {
    read: vi.fn(async () => null),
    write: vi.fn(async (data) => {
      saved = structuredClone(data);
    }),
  };
  const completion = { start: vi.fn(start), cancel: vi.fn(async () => {}) };
  const library = new LibraryController(storage, completion);
  return { library, storage, completion, saved: () => saved };
}

describe("versioned library validation", () => {
  it("preserves a valid export while stripping unknown properties and credentials", () => {
    const data = createInitialData();
    const imported = validateData({
      ...data,
      apiKey: "never-export-me",
      settings: { ...data.settings, apiKey: "also-secret" },
    });
    expect(imported).toEqual(data);
    expect(JSON.stringify(imported)).not.toContain("secret");
    expect(imported.conversations).toHaveLength(0);
  });

  it("rejects future versions, invalid data, duplicate ids and malformed JSON", () => {
    const data = createInitialData();
    expect(() => validateData({ ...data, version: 2 })).toThrow("Versão");
    expect(() =>
      validateData({ ...data, presets: [...data.presets, data.presets[0]] }),
    ).toThrow("identificadores");
    expect(() =>
      validateData({
        ...data,
        settings: { ...data.settings, temperature: Number.NaN },
      }),
    ).toThrow("Temperatura");
    expect(() => parseImport("{ broken")).toThrow("JSON");
  });
});

describe("local library and chat lifecycle", () => {
  it("always sends the original system prompt plus complete saved history", async () => {
    const { library, completion, saved } = setup();
    await library.initialize();
    const preset = library.getSnapshot().data.presets[0];
    const conversationId = library.createConversation(preset.id);
    library.savePreset(
      { ...preset, systemPrompt: "New prompt for future conversations only" },
      preset.id,
    );
    await library.sendMessage(conversationId, "Primeira pergunta");
    await library.sendMessage(conversationId, "Segunda pergunta");
    const request = completion.start.mock.calls[1][0];
    expect(request.messages).toEqual([
      { role: "system", content: preset.systemPrompt },
      { role: "user", content: "Primeira pergunta" },
      { role: "assistant", content: "Resposta" },
      { role: "user", content: "Segunda pergunta" },
    ]);
    await library.flush();
    expect(
      saved()?.conversations[0].messages.map((message) => message.content),
    ).toEqual([
      "Primeira pergunta",
      "Resposta",
      "Segunda pergunta",
      "Resposta",
    ]);
    expect(library.getSnapshot().streamingConversationId).toBeNull();
  });

  it("keeps streamed tokens while independent preset edits occur", async () => {
    let deliver!: (event: StreamEvent) => void;
    let finish!: () => void;
    const { library } = setup(async (_request, receive) => {
      deliver = receive;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await library.initialize();
    const preset = library.getSnapshot().data.presets[0];
    const conversationId = library.createConversation(preset.id);
    const pending = library.sendMessage(conversationId, "Olá");
    deliver({ type: "delta", content: "Uma " });
    library.toggleFavorite(preset.id);
    deliver({ type: "delta", content: "resposta" });
    finish();
    await pending;
    expect(
      library.getSnapshot().data.conversations[0].messages.at(-1)?.content,
    ).toBe("Uma resposta");
    expect(library.getSnapshot().data.presets[0].favorite).toBe(
      !preset.favorite,
    );
    await library.flush();
  });

  it("cancels locally, preserves partial output and ignores late stream events", async () => {
    let deliver!: (event: StreamEvent) => void;
    let finish!: () => void;
    const { library, completion } = setup(async (_request, receive) => {
      deliver = receive;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await library.initialize();
    const conversationId = library.createConversation(
      library.getSnapshot().data.presets[0].id,
    );
    const pending = library.sendMessage(conversationId, "Olá");
    deliver({ type: "delta", content: "Parcial" });
    await library.stopGeneration();
    deliver({ type: "delta", content: " ignorado" });
    finish();
    await pending;
    expect(completion.cancel).toHaveBeenCalledOnce();
    expect(
      library.getSnapshot().data.conversations[0].messages.at(-1),
    ).toMatchObject({ content: "Parcial", status: "cancelled" });
    expect(library.getSnapshot().streamingConversationId).toBeNull();
    await library.flush();
  });

  it("retains the failed user message and retries without duplicating it", async () => {
    const { library, completion } = setup(async () => {
      throw new Error("Chave inválida");
    });
    await library.initialize();
    const conversationId = library.createConversation(
      library.getSnapshot().data.presets[0].id,
    );
    await library.sendMessage(conversationId, "Teste");
    expect(library.getSnapshot().error).toBe("Chave inválida");
    expect(library.getSnapshot().data.conversations[0].messages).toHaveLength(
      1,
    );
    completion.start.mockImplementationOnce(async (_request, receive) => {
      receive({ type: "delta", content: "Agora sim" });
    });
    await library.retryMessage(conversationId);
    expect(
      library
        .getSnapshot()
        .data.conversations[0].messages.map((message) => message.content),
    ).toEqual(["Teste", "Agora sim"]);
    expect(completion.start.mock.calls[1][0].messages).toHaveLength(2);
    expect(library.getSnapshot().error).toBeNull();
    await library.flush();
  });

  it("keeps old conversations after deleting their preset and persists model choice", async () => {
    const { library, completion } = setup();
    await library.initialize();
    const preset = library.getSnapshot().data.presets[0];
    const conversationId = library.createConversation(preset.id);
    library.setConversationModel(conversationId, "anthropic/claude-sonnet-4");
    library.deletePreset(preset.id);
    await library.sendMessage(conversationId, "Ainda funciona?");
    expect(completion.start.mock.calls[0][0].model).toBe(
      "anthropic/claude-sonnet-4",
    );
    expect(library.getSnapshot().data.conversations[0].presetTitle).toBe(
      preset.title,
    );
    expect(
      buildRequestMessages(library.getSnapshot().data.conversations[0])[0]
        .content,
    ).toBe(preset.systemPrompt);
    await library.flush();
  });

  it("does not overwrite unreadable persisted data on startup", async () => {
    const storage = {
      read: vi.fn(async () => ({ broken: true })),
      write: vi.fn(async () => {}),
    };
    const library = new LibraryController(storage);
    await library.initialize();
    await library.flush();
    expect(library.getSnapshot().ready).toBe(true);
    expect(library.getSnapshot().persistenceError).toContain(
      "ler a biblioteca",
    );
    library.toggleFavorite(library.getSnapshot().data.presets[0].id);
    await library.flush();
    expect(storage.write).not.toHaveBeenCalled();
    expect(JSON.parse(library.exportData()).presets[0].favorite).toBe(false);
    await library.importData(JSON.stringify(createInitialData()));
    expect(storage.write).toHaveBeenCalledOnce();
    expect(library.getSnapshot().persistenceError).toBeNull();
  });

  it("reports storage failure and recovers on a subsequent successful write", async () => {
    const { library, storage } = setup();
    await library.initialize();
    await library.flush();
    vi.mocked(storage.write).mockRejectedValueOnce(new Error("disk full"));
    library.toggleFavorite(library.getSnapshot().data.presets[0].id);
    await library.flush();
    expect(library.getSnapshot().persistenceError).toContain("salvar");
    library.toggleFavorite(library.getSnapshot().data.presets[0].id);
    await library.flush();
    expect(library.getSnapshot().persistenceError).toBeNull();
    vi.mocked(storage.write).mockRejectedValueOnce(new Error("disk full"));
    await expect(
      library.importData(JSON.stringify(createInitialData())),
    ).rejects.toThrow("salvar");
  });
});
