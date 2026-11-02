use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::{ipc::Channel, State};
use tokio::sync::watch;

const API_ROOT: &str = "https://openrouter.ai/api/v1";
const CREDENTIAL_SERVICE: &str = "com.musicmaster.gemdrop";
const CREDENTIAL_ACCOUNT: &str = "openrouter-api-key";

struct NativeState {
    client: reqwest::Client,
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    request_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
}

#[derive(Clone, Serialize, Debug)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StreamEvent {
    Delta { content: String },
    Done,
    Error { message: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    id: String,
    name: String,
    context_length: u64,
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<RemoteModel>,
}

#[derive(Deserialize)]
struct RemoteModel {
    id: String,
    name: String,
    #[serde(default)]
    context_length: u64,
}

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
        .map_err(|_| "O cofre de credenciais do sistema está indisponível.".to_string())
}

#[tauri::command]
fn get_api_key_status() -> Result<bool, String> {
    match credential()?.get_password() {
        Ok(value) => Ok(!value.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Não foi possível acessar a chave no cofre do sistema.".into()),
    }
}

#[tauri::command]
fn set_api_key(api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.len() < 12 || key.len() > 2048 || key.chars().any(char::is_whitespace) {
        return Err("Insira uma chave válida do OpenRouter.".into());
    }
    credential()?
        .set_password(key)
        .map_err(|_| "Não foi possível salvar a chave no cofre do sistema.".into())
}

#[tauri::command]
fn clear_api_key() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Não foi possível remover a chave do cofre do sistema.".into()),
    }
}

fn http_error(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        400 | 422 => {
            "O modelo não aceitou esta conversa. Confira o modelo e o tamanho das mensagens."
        }
        401 | 403 => "A chave foi recusada. Confira sua chave do OpenRouter nas configurações.",
        402 => "Seu saldo no OpenRouter é insuficiente para este modelo.",
        404 => "Este modelo não está disponível. Selecione outro modelo.",
        408 | 504 => "O provedor demorou para responder. Tente novamente.",
        413 => "Esta conversa excede o limite do modelo. Inicie uma nova conversa.",
        429 => "O limite de solicitações foi atingido. Aguarde e tente novamente.",
        _ => "O OpenRouter está indisponível no momento. Tente novamente.",
    }
    .to_string()
}

#[tauri::command]
async fn fetch_models(state: State<'_, NativeState>) -> Result<Vec<Model>, String> {
    let response = state
        .client
        .get(format!("{API_ROOT}/models"))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| "Não foi possível carregar os modelos. Confira sua conexão.".to_string())?;
    if !response.status().is_success() {
        return Err(http_error(response.status()));
    }
    let response = response
        .json::<ModelsResponse>()
        .await
        .map_err(|_| "O OpenRouter retornou uma lista de modelos inválida.".to_string())?;
    let mut models: Vec<_> = response
        .data
        .into_iter()
        .filter(|model| !model.id.is_empty() && model.id.len() <= 256)
        .map(|model| Model {
            id: model.id,
            name: model.name,
            context_length: model.context_length,
        })
        .collect();
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(models)
}

fn validate_request(request: &CompletionRequest) -> Result<(), String> {
    if request.request_id.is_empty()
        || request.request_id.len() > 128
        || !request
            .request_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Identificador da conversa inválido.".into());
    }
    if request.model.trim().is_empty()
        || request.model.len() > 256
        || request.model.chars().any(char::is_whitespace)
    {
        return Err("Selecione um modelo válido.".into());
    }
    if !request.temperature.is_finite() || !(0.0..=2.0).contains(&request.temperature) {
        return Err("A temperatura deve ficar entre 0 e 2.".into());
    }
    if request.messages.len() < 2
        || request.messages.len() > 2000
        || request
            .messages
            .first()
            .is_none_or(|message| message.role != "system")
        || request
            .messages
            .iter()
            .skip(1)
            .any(|message| message.role != "user" && message.role != "assistant")
        || request
            .messages
            .iter()
            .map(|message| message.content.len())
            .sum::<usize>()
            > 8_000_000
    {
        return Err("A conversa não é válida ou excede o limite de tamanho.".into());
    }
    Ok(())
}

fn request_body(request: &CompletionRequest) -> serde_json::Value {
    serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "temperature": request.temperature,
        "stream": true
    })
}

/// Decode SSE a line at a time, keeping UTF-8 bytes intact across transport chunks.
#[derive(Default)]
struct SseDecoder {
    pending: Vec<u8>,
    data_lines: Vec<String>,
}

impl SseDecoder {
    fn feed(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        self.pending.extend_from_slice(chunk);
        if self.pending.len() > 2_000_000 {
            return Err("A resposta do provedor excedeu o limite de tamanho.".into());
        }
        let mut events = Vec::new();
        let mut consumed = 0;
        while let Some(relative) = self.pending[consumed..]
            .iter()
            .position(|byte| *byte == b'\n')
        {
            let end = consumed + relative;
            let line = &self.pending[consumed..end];
            let line = line.strip_suffix(b"\r").unwrap_or(line);
            let line = std::str::from_utf8(line)
                .map_err(|_| "O provedor retornou texto inválido.".to_string())?;
            if line.is_empty() {
                if !self.data_lines.is_empty() {
                    events.push(self.data_lines.join("\n"));
                    self.data_lines.clear();
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                self.data_lines
                    .push(data.strip_prefix(' ').unwrap_or(data).to_string());
            }
            consumed = end + 1;
        }
        self.pending.drain(..consumed);
        Ok(events)
    }
}

async fn consume_completion(
    state: &NativeState,
    request: &CompletionRequest,
    on_event: &Channel<StreamEvent>,
    mut cancelled: watch::Receiver<bool>,
    api_key: String,
) -> Result<(), String> {
    let response = tokio::select! {
        _ = cancelled.changed() => return Ok(()),
        response = state.client.post(format!("{API_ROOT}/chat/completions"))
            .bearer_auth(api_key)
            .header("X-Title", "Gemdrop")
            .header("HTTP-Referer", "https://github.com/MusicMaster4/gemdrop")
            .json(&request_body(request)).send() => response
                .map_err(|_| "Não foi possível conectar ao OpenRouter. Confira sua conexão e tente novamente.".to_string())?,
    };
    if !response.status().is_success() {
        return Err(http_error(response.status()));
    }
    let mut stream = response.bytes_stream();
    let mut decoder = SseDecoder::default();
    let mut finished = false;
    let mut received_text = false;
    loop {
        let chunk = tokio::select! {
            _ = cancelled.changed() => return Ok(()),
            chunk = tokio::time::timeout(Duration::from_secs(120), stream.next()) =>
                chunk.map_err(|_| "A resposta demorou demais. Tente novamente.".to_string())?,
        };
        let Some(chunk) = chunk else {
            return if finished && received_text {
                Ok(())
            } else {
                Err("A conexão foi interrompida antes do fim da resposta. Tente novamente.".into())
            };
        };
        let chunk =
            chunk.map_err(|_| "A conexão foi interrompida. Tente novamente.".to_string())?;
        for event in decoder.feed(&chunk)? {
            if event.trim() == "[DONE]" {
                return if received_text {
                    Ok(())
                } else {
                    Err(
                        "O modelo não retornou texto. Tente novamente ou selecione outro modelo."
                            .into(),
                    )
                };
            }
            let event: serde_json::Value = serde_json::from_str(&event).map_err(|_| {
                "O provedor retornou uma resposta inválida. Tente outro modelo.".to_string()
            })?;
            if event.get("error").is_some_and(|error| !error.is_null()) {
                return Err(
                    "O provedor interrompeu a resposta. Tente novamente ou selecione outro modelo."
                        .into(),
                );
            }
            if let Some(choices) = event.get("choices").and_then(|value| value.as_array()) {
                for choice in choices {
                    if let Some(content) = choice
                        .pointer("/delta/content")
                        .and_then(|value| value.as_str())
                    {
                        if !content.is_empty() {
                            received_text = true;
                            on_event
                                .send(StreamEvent::Delta {
                                    content: content.to_string(),
                                })
                                .map_err(|_| "A conversa foi fechada.".to_string())?;
                        }
                    }
                    if choice
                        .get("finish_reason")
                        .is_some_and(|reason| !reason.is_null())
                    {
                        finished = true;
                    }
                }
            }
        }
    }
}

#[tauri::command]
async fn start_completion(
    request: CompletionRequest,
    on_event: Channel<StreamEvent>,
    state: State<'_, NativeState>,
) -> Result<(), String> {
    validate_request(&request)?;
    let api_key = credential()?
        .get_password()
        .map_err(|_| "Adicione sua chave do OpenRouter nas configurações.".to_string())?;
    let (sender, receiver) = watch::channel(false);
    {
        let mut active = state
            .active
            .lock()
            .map_err(|_| "Não foi possível iniciar a conversa.".to_string())?;
        if active.len() >= 4 {
            return Err("Aguarde uma das respostas em andamento terminar.".into());
        }
        if active.contains_key(&request.request_id) {
            return Err("Esta resposta já está em andamento.".into());
        }
        active.insert(request.request_id.clone(), sender);
    }
    let result = consume_completion(&state, &request, &on_event, receiver, api_key).await;
    if let Ok(mut active) = state.active.lock() {
        active.remove(&request.request_id);
    }
    match result {
        Ok(()) => {
            let _ = on_event.send(StreamEvent::Done);
        }
        Err(message) => {
            let _ = on_event.send(StreamEvent::Error { message });
        }
    }
    Ok(())
}

#[tauri::command]
fn cancel_completion(request_id: String, state: State<'_, NativeState>) -> Result<(), String> {
    if let Some(sender) = state
        .active
        .lock()
        .map_err(|_| "Não foi possível interromper a resposta.".to_string())?
        .get(&request_id)
    {
        let _ = sender.send(true);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .user_agent(concat!("Gemdrop/", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to initialize HTTPS client");
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .manage(NativeState {
            client,
            active: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_api_key_status,
            set_api_key,
            clear_api_key,
            fetch_models,
            start_completion,
            cancel_completion
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gemdrop");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> CompletionRequest {
        CompletionRequest {
            request_id: "request-1".into(),
            model: "openai/gpt-4.1-mini".into(),
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: "Use the saved prompt.".into(),
                },
                ChatMessage {
                    role: "user".into(),
                    content: "Hello".into(),
                },
            ],
            temperature: 0.7,
        }
    }

    #[test]
    fn payload_preserves_system_prompt_and_history_order() {
        let request = request();
        assert!(validate_request(&request).is_ok());
        let body = request_body(&request);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "Use the saved prompt.");
        assert_eq!(body["messages"][1]["content"], "Hello");
        assert_eq!(body["stream"], true);
        assert!(body.get("requestId").is_none());
    }

    #[test]
    fn rejects_missing_or_injected_system_prompt() {
        let mut request = request();
        request.messages[0].role = "user".into();
        assert!(validate_request(&request).is_err());
        request.messages[0].role = "system".into();
        request.messages[1].role = "system".into();
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn rejects_invalid_options() {
        let mut request = request();
        request.temperature = f64::NAN;
        assert!(validate_request(&request).is_err());
        request.temperature = 0.5;
        request.model = "bad\r\nmodel".into();
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn decodes_chunks_crlf_comments_and_split_unicode() {
        let input = ": heartbeat\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"Olá 🌿\"}}]}\r\n\r\ndata: [DONE]\n\n".as_bytes();
        let mut decoder = SseDecoder::default();
        let mut events = Vec::new();
        for chunk in input.chunks(1) {
            events.extend(decoder.feed(chunk).unwrap());
        }
        assert_eq!(events.len(), 2);
        assert!(events[0].contains("Olá 🌿"));
        assert_eq!(events[1], "[DONE]");
    }

    #[test]
    fn joins_multiline_sse_data_and_ignores_other_fields() {
        let mut decoder = SseDecoder::default();
        let events = decoder
            .feed(b"event: message\nid: 1\ndata: first\ndata: second\n\n")
            .unwrap();
        assert_eq!(events, vec!["first\nsecond"]);
    }

    #[test]
    fn provider_errors_never_expose_response_bodies_or_keys() {
        assert!(http_error(reqwest::StatusCode::UNAUTHORIZED).contains("chave"));
        assert!(http_error(reqwest::StatusCode::PAYMENT_REQUIRED).contains("saldo"));
        assert!(!http_error(reqwest::StatusCode::INTERNAL_SERVER_ERROR).contains("sk-"));
    }
}
