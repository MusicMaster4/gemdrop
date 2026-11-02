import { useState, type FormEvent } from "react";
import { Check, ChevronDown, Globe, Shuffle } from "lucide-react";
import { Dialog } from "./Dialog";
import {
  PresetIcon,
  presetIcons,
  presetColors,
  randomColor,
  randomIcon,
} from "./PresetIcon";
import { ReasoningSelect } from "./ReasoningSelect";
import { ModelPicker } from "./ModelPicker";
import type { ReasoningEffort } from "../lib/reasoning";
import type { Model, Preset, PresetDraft, Settings } from "../lib/types";

export function PresetEditor({
  preset,
  models,
  defaults,
  onClose,
  onSave,
}: {
  preset?: Preset;
  models: Model[];
  defaults: Settings;
  onClose: () => void;
  onSave: (draft: PresetDraft, id?: string) => void;
}) {
  const [title, setTitle] = useState(preset?.title ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(preset?.systemPrompt ?? "");
  const [icon, setIcon] = useState(preset?.icon ?? randomIcon);
  const [color, setColor] = useState(preset?.color ?? randomColor);
  const [webSearch, setWebSearch] = useState(preset?.webSearch ?? false);
  const [model, setModel] = useState<string | null>(preset?.model ?? null);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort | null>(preset?.reasoningEffort ?? null);
  const [choosingModel, setChoosingModel] = useState(false);
  const modelName = (id: string) =>
    models.find((item) => item.id === id)?.name ?? id;
  const [error, setError] = useState("");
  function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !systemPrompt.trim()) return;
    try {
      onSave(
        {
          title: title.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          icon,
          color,
          webSearch,
          model,
          reasoningEffort,
          favorite: preset?.favorite ?? false,
        },
        preset?.id,
      );
      onClose();
    } catch (cause) {
      setError(String(cause));
    }
  }
  return (
    <>
      <Dialog
        title={preset ? "Editar preset" : "Novo preset"}
        onClose={onClose}
        className="preset-dialog"
      >
        <form onSubmit={save} className="preset-form">
          <div className="preset-preview">
            <PresetIcon icon={icon} color={color} size={29} />
            <div>
              <strong>{title || "Seu próximo assistente"}</strong>
              <span>
                {description || "Um prompt, infinitas possibilidades."}
              </span>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Sortear ícone e cor"
              aria-label="Sortear ícone e cor"
              onClick={() => {
                setIcon(randomIcon());
                setColor(randomColor());
              }}
            >
              <Shuffle size={18} />
            </button>
          </div>
          <label className="field">
            Nome
            <input
              autoFocus
              required
              maxLength={80}
              placeholder="Ex.: Meu editor de textos"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field">
            Descrição <span className="optional">opcional</span>
            <input
              maxLength={220}
              placeholder="Uma breve descrição do que ele faz"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="preset-model-settings">
            <div className="field">
              <span id="preset-model-label">Modelo</span>
              <button
                type="button"
                aria-label="Modelo do preset"
                className="button secondary preset-model-button"
                onClick={() => setChoosingModel(true)}
              >
                <span>
                  {model
                    ? modelName(model)
                    : "Usar padrão · " + modelName(defaults.model)}
                </span>
                <ChevronDown size={15} />
              </button>
            </div>
            <label className="field" htmlFor="preset-reasoning-effort">
              Thinking effort
              <ReasoningSelect
                id="preset-reasoning-effort"
                value={reasoningEffort}
                inherit={defaults.reasoningEffort}
                onChange={setReasoningEffort}
              />
            </label>
          </div>
          <div className="appearance-fields">
            <div>
              <span className="field-label">Ícone</span>
              <div className="icon-options">
                {Object.entries(presetIcons).map(([name, Icon]) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Ícone ${name}`}
                    aria-pressed={icon === name}
                    className={`icon-option ${icon === name ? "selected" : ""}`}
                    onClick={() => setIcon(name)}
                  >
                    <Icon size={18} strokeWidth={1.6} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="field-label">Cor</span>
              <div className="color-options">
                {presetColors.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className="color-option"
                    style={{ background: option }}
                    aria-label={`Cor ${option}`}
                    aria-pressed={color === option}
                    onClick={() => setColor(option)}
                  >
                    {color === option && <Check size={15} strokeWidth={2.5} />}
                  </button>
                ))}
                <label className="custom-color" title="Escolher outra cor">
                  <input
                    type="color"
                    aria-label="Cor personalizada"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                  <span>+</span>
                </label>
              </div>
            </div>
          </div>
          <label className="field">
            System prompt
            <textarea
              className="prompt-input"
              required
              maxLength={100000}
              rows={7}
              placeholder="Você é um assistente que..."
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </label>
          <div className="internet-setting">
            <Globe size={19} strokeWidth={1.6} aria-hidden="true" />
            <div>
              <span id="preset-internet-label">Acesso à internet</span>
              <p id="preset-internet-description">
                Busca na web pelo OpenRouter. Pode gerar custos adicionais.
              </p>
            </div>
            <button
              id="preset-internet-switch"
              type="button"
              role="switch"
              aria-checked={webSearch}
              aria-labelledby="preset-internet-label"
              aria-describedby="preset-internet-description"
              className="internet-switch"
              onClick={() => setWebSearch(!webSearch)}
            >
              <span />
            </button>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={!title.trim() || !systemPrompt.trim()}
            >
              <Check size={17} />
              {preset ? "Salvar alterações" : "Criar preset"}
            </button>
          </div>
        </form>
      </Dialog>
      {choosingModel && (
        <ModelPicker
          models={models}
          selected={model ?? ""}
          defaultModelName={modelName(defaults.model)}
          onUseDefault={() => setModel(null)}
          onSelect={setModel}
          onClose={() => setChoosingModel(false)}
        />
      )}
    </>
  );
}
