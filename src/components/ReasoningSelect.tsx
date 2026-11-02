import {
  REASONING_EFFORTS,
  REASONING_LABELS,
  isReasoningEffort,
  type ReasoningEffort,
} from "../lib/reasoning";

export function ReasoningSelect({
  id,
  value,
  inherit,
  onChange,
}: {
  id: string;
  value: ReasoningEffort | null;
  inherit?: ReasoningEffort;
  onChange: (value: ReasoningEffort | null) => void;
}) {
  return (
    <select
      id={id}
      className="reasoning-select"
      value={value ?? "inherit"}
      onChange={(event) => {
        const next = event.target.value;
        if (next === "inherit" && inherit !== undefined) onChange(null);
        else if (isReasoningEffort(next)) onChange(next);
      }}
    >
      {inherit !== undefined && (
        <option value="inherit">
          Usar padrão ({REASONING_LABELS[inherit]})
        </option>
      )}
      {REASONING_EFFORTS.map((effort) => (
        <option key={effort} value={effort}>
          {REASONING_LABELS[effort]}
        </option>
      ))}
    </select>
  );
}
