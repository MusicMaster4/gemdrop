import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { CompletionRequest, Model, StreamEvent } from "./types";

export const isDesktop = (): boolean => isTauri();

function requireDesktop() {
  if (!isDesktop())
    throw new Error(
      "Abra o aplicativo desktop para configurar o OpenRouter e conversar.",
    );
}

export async function getApiKeyStatus(): Promise<boolean> {
  if (!isDesktop()) return false;
  return invoke<boolean>("get_api_key_status");
}

export async function setApiKey(apiKey: string): Promise<void> {
  requireDesktop();
  await invoke("set_api_key", { apiKey: apiKey.trim() });
}

export async function clearApiKey(): Promise<void> {
  requireDesktop();
  await invoke("clear_api_key");
}

export async function fetchModels(): Promise<Model[]> {
  requireDesktop();
  return invoke<Model[]>("fetch_models");
}

export async function startCompletion(
  request: CompletionRequest,
  receive: (event: StreamEvent) => void,
): Promise<void> {
  requireDesktop();
  const onEvent = new Channel<StreamEvent>();
  onEvent.onmessage = receive;
  await invoke("start_completion", { request, onEvent });
}

export async function cancelCompletion(requestId: string): Promise<void> {
  if (isDesktop()) await invoke("cancel_completion", { requestId });
}
