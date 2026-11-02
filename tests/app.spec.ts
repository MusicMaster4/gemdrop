import { test, expect } from "@playwright/test";

test("preset creation, customization, editing, favorite and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Biblioteca." }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/library-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Novo preset", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Novo preset" });
  await dialog
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Meu revisor");
  await dialog
    .getByRole("textbox", { name: /Descrição/ })
    .fill("Revisão sem perder minha voz.");
  await dialog
    .getByRole("textbox", { name: "System prompt" })
    .fill("Responda sempre com clareza. Preserve a voz do autor.");
  await dialog.getByRole("button", { name: "Ícone pen", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Cor #91b9a4", exact: true })
    .click();
  await dialog.getByRole("switch", { name: "Acesso à internet" }).click();
  await dialog.getByRole("button", { name: "Criar preset" }).click();
  await expect(
    page.getByRole("button", { name: "Conversar com Meu revisor" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Favoritar Meu revisor", exact: true })
    .click();
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Conversar com Meu revisor" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Buscar presets" })
    .fill("Meu revisor");
  await expect(page.locator(".preset-card")).toHaveCount(1);
  await page.getByLabel("Opções de Meu revisor", { exact: true }).click();
  await page
    .getByRole("button", { name: "Editar preset", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Editar preset" });
  await expect(
    editor.getByRole("textbox", { name: "System prompt" }),
  ).toHaveValue("Responda sempre com clareza. Preserve a voz do autor.");
  await expect(
    editor.getByRole("switch", { name: "Acesso à internet" }),
  ).toBeChecked();
  await editor
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Meu revisor final");
  await editor.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("button", { name: "Conversar com Meu revisor final" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Desfavoritar Meu revisor final" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("old conversations preserve prompt after preset edit and deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Conversar com Um segundo olhar" })
    .click();
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  const originalPrompt = await page.locator(".prompt-panel pre").textContent();
  expect(originalPrompt).toContain("parceiro de pensamento");
  await page.getByRole("button", { name: "Voltar à biblioteca" }).click();
  await page.getByLabel("Opções de Um segundo olhar", { exact: true }).click();
  await page
    .getByRole("button", { name: "Editar preset", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "System prompt" })
    .fill("Este é o novo prompt. Responda somente em inglês.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByLabel("Opções de Um segundo olhar", { exact: true }).click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Excluir preset?" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.locator(".history-open").first().click();
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await expect(page.locator(".prompt-panel pre")).toHaveText(originalPrompt!);
});

test("browser preview protects credentials and imported history renders safe Markdown", async ({
  page,
}) => {
  const timestamp = new Date().toISOString();
  const data = {
    version: 1,
    presets: [],
    conversations: [
      {
        id: "test-conversation",
        presetId: "deleted",
        presetTitle: "Revisor antigo",
        title: "Uma conversa antiga",
        systemPrompt: "Seja gentil.",
        model: "openai/gpt-4.1-mini",
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [
          {
            id: "u1",
            role: "user",
            content: "Meu texto original",
            createdAt: timestamp,
          },
          {
            id: "a1",
            role: "assistant",
            content:
              "Uma **resposta salva**.\n\n```ts\nconst ok = true\n```\n\n<script>window.hacked = true</script>",
            createdAt: timestamp,
          },
        ],
      },
    ],
    settings: { model: "openai/gpt-4.1-mini", temperature: 0.7 },
  };
  await page.addInitScript(
    (library) =>
      localStorage.setItem("gemdrop.library.v1", JSON.stringify(library)),
    data,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.locator(".history-open").first().click();
  await expect(page.locator(".markdown-content strong")).toHaveText(
    "resposta salva",
  );
  await expect(page.locator(".markdown-content code")).toContainText(
    "const ok = true",
  );
  expect(await page.evaluate(() => "hacked" in window)).toBe(false);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByLabel("Chave de API OpenRouter", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Abra o app desktop para conectar sua chave."),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/settings.png", fullPage: true });
});

test("library adapts to small screens without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Novo preset", exact: true }),
  ).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflows).toBe(false);
  await page.screenshot({
    path: "artifacts/library-mobile.png",
    fullPage: true,
  });
});
