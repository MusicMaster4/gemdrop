import { useState } from "react";
import { Check, Cpu, Search } from "lucide-react";
import { Dialog } from "./Dialog";
import type { Model } from "../lib/types";

export function ModelPicker({
  models,
  selected,
  onSelect,
  onClose,
}: {
  models: Model[];
  selected: string;
  onSelect: (model: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = models
    .filter((model) =>
      `${model.name} ${model.id}`.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 100);
  const [custom, setCustom] = useState("");
  return (
    <Dialog title="Escolher modelo" onClose={onClose} className="model-dialog">
      <div className="search-field model-search">
        <Search size={17} />
        <input
          autoFocus
          aria-label="Buscar modelos"
          placeholder="Buscar um modelo..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="model-list">
        {filtered.map((model) => (
          <button
            key={model.id}
            className={`model-option ${selected === model.id ? "selected" : ""}`}
            onClick={() => {
              onSelect(model.id);
              onClose();
            }}
          >
            <Cpu size={18} />
            <span>
              <strong>{model.name}</strong>
              <small>{model.id}</small>
            </span>
            {selected === model.id && <Check size={17} />}
          </button>
        ))}
        {!filtered.length && (
          <p className="empty-small">Nenhum modelo encontrado.</p>
        )}
      </div>
      <form
        className="custom-model"
        onSubmit={(event) => {
          event.preventDefault();
          if (custom.trim()) {
            onSelect(custom.trim());
            onClose();
          }
        }}
      >
        <input
          aria-label="ID de outro modelo"
          placeholder="Ou cole o ID de um modelo"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
        <button className="button secondary" disabled={!custom.trim()}>
          Usar
        </button>
      </form>
    </Dialog>
  );
}
