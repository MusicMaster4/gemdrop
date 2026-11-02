import { test, expect, type Page } from "@playwright/test";

async function mockNative(page: Page) {
  await page.addInitScript(() => {
    const env = window as unknown as Record<string, unknown>;
    env.isTauri = true;
    env.__requests = [];
    env.__failNext = false;
    const values: Record<string, unknown> = JSON.parse(
      localStorage.getItem("test.native-store") ?? "{}",
    );
    const pending = new Map<string, () => void>();
    let hasKey = false;
    env.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        if (command === "plugin:store|load") return 1;
        if (command === "plugin:store|get")
          return [values[String(args.key)], String(args.key) in values];
        if (command === "plugin:store|set") {
          values[String(args.key)] = args.value;
          return;
        }
        if (command === "plugin:store|save") {
          localStorage.setItem("test.native-store", JSON.stringify(values));
          return;
        }
        if (command === "get_api_key_status") return hasKey;
        if (command === "set_api_key") {
          hasKey = true;
          return;
        }
        if (command === "clear_api_key") {
          hasKey = false;
          return;
        }
        if (command === "plugin:app|version") return "0.1.0-testing.1";
        if (command === "fetch_models")
          return [
            {
              id: "openai/gpt-4.1-mini",
              name: "GPT-4.1 mini",
              contextLength: 100000,
            },
          ];
        if (command === "cancel_completion") {
          pending.get(String(args.requestId))?.();
          return;
        }
        if (command === "start_completion") {
          const request = args.request as {
            requestId: string;
            messages: { role: string; content: string }[];
          };
          (env.__requests as unknown[]).push(
            JSON.parse(JSON.stringify(request)),
          );
          const channel = args.onEvent as {
            onmessage: (event: unknown) => void;
          };
          if (env.__failNext) {
            env.__failNext = false;
            channel.onmessage({
              type: "error",
              message: "O provedor está indisponível. Tente novamente.",
            });
            return;
          }
          channel.onmessage({ type: "delta", content: "Uma **resposta" });
          if (request.messages.at(-1)?.content === "Resposta longa") {
            await new Promise<void>((resolve) => {
              pending.set(request.requestId, resolve);
            });
            pending.delete(request.requestId);
            channel.onmessage({ type: "delta", content: " fantasma" });
          } else {
            await new Promise((resolve) => setTimeout(resolve, 40));
            channel.onmessage({ type: "delta", content: " completa**." });
          }
          channel.onmessage({ type: "done" });
          return;
        }
        throw new Error(`Unexpected test IPC command: ${command}`);
      },
    };
  });
}

async function connect(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Configurações/ }).click();
  await page
    .getByLabel("Chave de API OpenRouter", { exact: true })
    .fill("sk-or-test-not-a-real-credential");
  await page.getByRole("button", { name: "Salvar chave", exact: true }).click();
  await expect(
    page.getByText("Chave salva. Tudo pronto para conversar."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Conversar com Um segundo olhar" })
    .click();
}

test("UI sends actual system prompt and complete history through native IPC", async ({
  page,
}) => {
  await mockNative(page);
  await connect(page);
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Primeira pergunta");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".message.assistant strong")).toHaveText(
    "resposta completa",
  );
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Segunda pergunta");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Parar resposta" }),
  ).toHaveCount(0);
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          __requests: { messages: { role: string; content: string }[] }[];
        }
      ).__requests,
  );
  expect(requests[0].messages[0].role).toBe("system");
  expect(requests[0].messages[0].content).toContain("parceiro de pensamento");
  expect(requests[1].messages.map((message) => message.role)).toEqual([
    "system",
    "user",
    "assistant",
    "user",
  ]);
  expect(requests[1].messages.at(-1)?.content).toBe("Segunda pergunta");
  expect(
    await page.evaluate(() => localStorage.getItem("test.native-store")),
  ).not.toContain("sk-or-test");
  await page.screenshot({ path: "artifacts/chat-desktop.png", fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.locator(".history-open").first().click();
  await expect(page.locator(".message")).toHaveCount(4);
  await expect(page.locator(".message.assistant strong")).toHaveText([
    "resposta completa",
    "resposta completa",
  ]);
});

test("cancelled stream preserves partial text and ignores late native events", async ({
  page,
}) => {
  await mockNative(page);
  await connect(page);
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Resposta longa");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page.getByRole("button", { name: "Parar resposta" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Parar resposta" }).click();
  await expect(
    page.getByRole("button", { name: "Parar resposta" }),
  ).toHaveCount(0);
  await expect(page.locator(".message.assistant")).toContainText(
    "Uma **resposta",
  );
  await expect(page.locator(".message.assistant")).not.toContainText(
    "fantasma",
  );
});

test("provider failure can be retried without duplicating the user message", async ({
  page,
}) => {
  await mockNative(page);
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __failNext: boolean }).__failNext = true;
  });
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Minha pergunta original");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "O provedor está indisponível.",
  );
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(page.locator(".message.assistant strong")).toHaveText(
    "resposta completa",
  );
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("internet opt-in is saved and forwarded to the actual chat request", async ({
  page,
}) => {
  await mockNative(page);
  await page.goto("/");
  await page.getByLabel("Opções de Um segundo olhar", { exact: true }).click();
  await page
    .getByRole("button", { name: "Editar preset", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Editar preset" });
  await expect(
    editor.getByRole("switch", { name: "Acesso à internet" }),
  ).not.toBeChecked();
  await editor.getByRole("switch", { name: "Acesso à internet" }).click();
  await editor.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("img", { name: "Internet ativada" }),
  ).toBeVisible();
  await connect(page);
  await expect(
    page.locator(".chat-header").getByRole("img", { name: "Internet ativada" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Pesquise as notícias de hoje");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".message.assistant strong")).toHaveText(
    "resposta completa",
  );
  const request = await page.evaluate(
    () =>
      (window as unknown as { __requests: { webSearch: boolean }[] })
        .__requests[0],
  );
  expect(request.webSearch).toBe(true);
});
