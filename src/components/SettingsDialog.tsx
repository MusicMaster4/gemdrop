import { ReasoningSelect } from "./ReasoningSelect";
import { UpdateControl } from "../UpdateControl";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Dialog } from "./Dialog";
import {
  clearApiKey,
  getApiKeyStatus,
  isDesktop,
  setApiKey,
} from "../lib/native";
import type { Settings } from "../lib/types";

export function SettingsDialog({
  settings,
  modelName,
  onClose,
  onChooseModel,
  onUpdate,
  onExport,
  onImport,
  onKeyChanged,
}: {
  settings: Settings;
  modelName: string;
  onClose: () => void;
  onChooseModel: () => void;
  onUpdate: (patch: Partial<Settings>) => void;
  onExport: () => void;
  onImport: (raw: string) => Promise<void>;
  onKeyChanged: (hasKey: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktop();
  useEffect(() => {
    void getApiKeyStatus()
      .then(setHasKey)
      .catch(() => {});
  }, []);
  async function saveKey() {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await setApiKey(key.trim());
      setKey("");
      setHasKey(true);
      onKeyChanged(true);
      setNotice("Chave salva. Tudo pronto para conversar.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function removeKey() {
    setBusy(true);
    setError("");
    try {
      await clearApiKey();
      setHasKey(false);
      onKeyChanged(false);
      setNotice("Chave removida.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Configurações" onClose={onClose} className="settings-dialog">
      <div className="settings-section">
        <div className="section-title">
          <KeyRound size={18} />
          <h3>OpenRouter</h3>
          {hasKey && (
            <span className="connected-badge">
              <Check size={12} />
              Conectado
            </span>
          )}
        </div>
        <p className="field-help">
          Sua chave fica protegida neste dispositivo.
        </p>
        {!desktop && (
          <div className="inline-notice">
            Abra o app desktop para conectar sua chave.
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveKey();
          }}
        >
          <label className="field">
            Chave de API
            <div className="password-field">
              <input
                aria-label="Chave de API OpenRouter"
                autoComplete="off"
                spellCheck={false}
                type={visible ? "text" : "password"}
                placeholder={
                  hasKey ? "••••••••••••••••••••••••" : "sk-or-v1-..."
                }
                value={key}
                disabled={!desktop || busy}
                onChange={(event) => setKey(event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? "Ocultar chave" : "Mostrar chave"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <div className="key-actions">
            {hasKey && (
              <button
                type="button"
                className="button ghost danger-text"
                disabled={busy}
                onClick={() => void removeKey()}
              >
                <Trash2 size={15} />
                Remover
              </button>
            )}
            <button
              className="button secondary"
              type="submit"
              disabled={!desktop || !key.trim() || busy}
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}
              {hasKey ? "Atualizar chave" : "Salvar chave"}
            </button>
          </div>
        </form>
        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="settings-section">
        <h3>Conversas</h3>
        <div className="setting-row">
          <div>
            <label>Modelo padrão</label>
            <p>Usado nas novas conversas.</p>
          </div>
          <button
            className="button secondary model-setting"
            onClick={onChooseModel}
          >
            {modelName}
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <label htmlFor="default-reasoning-effort">
              Thinking effort padrão
            </label>
            <p>Disponível em modelos com raciocínio.</p>
          </div>
          <ReasoningSelect
            id="default-reasoning-effort"
            value={settings.reasoningEffort}
            onChange={(value) => {
              if (value !== null) onUpdate({ reasoningEffort: value });
            }}
          />
        </div>
        <div className="setting-row temperature-row">
          <div>
            <label htmlFor="temperature">Criatividade</label>
            <p>Mais precisão ou mais possibilidades.</p>
          </div>
          <div className="range-control">
            <input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(event) =>
                onUpdate({ temperature: Number(event.target.value) })
              }
            />
            <output htmlFor="temperature">
              {settings.temperature.toFixed(1)}
            </output>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <h3>Seus dados</h3>
        <div className="setting-row">
          <div>
            <label>Backup local</label>
            <p>Presets e conversas, sem sua chave.</p>
          </div>
          <div className="backup-actions">
            <button
              className="button secondary"
              onClick={() => fileRef.current?.click()}
            >
              <ArrowUpFromLine size={15} />
              Importar
            </button>
            <button className="button secondary" onClick={onExport}>
              <ArrowDownToLine size={15} />
              Exportar
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setError("");
            try {
              await onImport(await file.text());
              setNotice("Backup importado.");
            } catch (cause) {
              setError(String(cause));
            }
            event.target.value = "";
          }}
        />
      </div>
      <UpdateControl />
      <div className="settings-bottom">
        <span>
          <ShieldCheck size={14} />
          Mensagens enviadas passam pelo OpenRouter.
        </span>
      </div>
    </Dialog>
  );
}
