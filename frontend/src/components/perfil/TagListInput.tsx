import { useState, type KeyboardEvent } from "react";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function TagListInput({ value, onChange, placeholder }: Props) {
  const [borrador, setBorrador] = useState("");

  function agregar() {
    const limpio = borrador.trim();
    if (limpio && !value.includes(limpio)) onChange([...value, limpio]);
    setBorrador("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      agregar();
    } else if (e.key === "Backspace" && borrador === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            aria-label={`Quitar ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="ml-0.5"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={agregar}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="h-6 flex-1 border-none px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
