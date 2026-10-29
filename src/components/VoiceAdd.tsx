import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Mic, MicOff, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNITS } from "@/lib/compensai";
import { parseVoiceProducts, productKey, type VoiceDraft } from "@/lib/voiceList";

type AddFn = (item: {
  name: string;
  price: number;
  quantity: number;
  unit: string;
}) => Promise<unknown>;

type Draft = VoiceDraft & { id: string };

/** Tipos mínimos da Web Speech API (não faz parte do lib.dom). */
type RecognitionResult = { isFinal: boolean; readonly 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionError = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;
type WindowWithSpeech = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

function speechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithSpeech;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  "not-allowed":
    "Permissão do microfone negada. Libere o microfone nas configurações do navegador e tente de novo.",
  "service-not-allowed":
    "Permissão do microfone negada. Libere o microfone nas configurações do navegador e tente de novo.",
  "no-speech": "Não ouvi nada. Tente falar mais perto do microfone.",
  "audio-capture": "Nenhum microfone foi encontrado no aparelho.",
  network: "Falha de rede no reconhecimento de voz. Verifique a conexão e tente de novo.",
};

let sequence = 0;

function nextId(): string {
  sequence += 1;
  return `voice-${sequence}`;
}

function QtyField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value).replace(".", ","));

  useEffect(() => setText(String(value).replace(".", ",")), [value]);

  function commit(raw: string) {
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setText(String(value).replace(".", ","));
      return;
    }
    if (parsed !== value) onChange(parsed);
  }

  return (
    <Input
      inputMode="decimal"
      aria-label="Quantidade"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        setText(e.target.value.replace(".", ","));
        commit(e.target.value);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-9 w-16 text-center"
    />
  );
}

export function VoiceAdd({
  onAdd,
  existingNames = [],
}: {
  onAdd: AddFn;
  existingNames?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const chunksRef = useRef<string[]>([]);

  const existing = new Set(existingNames.map(productKey));
  const readyCount = drafts.filter(
    (d) => d.name.trim() && !existing.has(productKey(d.name)),
  ).length;

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  function mergeDrafts(parsed: VoiceDraft[]) {
    setDrafts((prev) => {
      const seen = new Set(prev.map((d) => productKey(d.name)));
      const merged = [...prev];
      for (const item of parsed) {
        const key = productKey(item.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...item, id: nextId() });
      }
      return merged;
    });
  }

  /**
   * Guarda um trecho final do reconhecimento. Alguns navegadores repetem o
   * mesmo resultado (ou reenviam a transcrição inteira), o que duplicaria
   * produtos — então trechos repetidos/cumulativos são ignorados.
   */
  function pushFinal(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const chunks = chunksRef.current;
    const last = chunks[chunks.length - 1] ?? "";
    const whole = chunks.join(" ").trim();
    if (clean === last || clean === whole) return;
    if (last.endsWith(clean)) return;
    if (whole && clean.startsWith(whole)) chunksRef.current = [clean];
    else chunks.push(clean);
    finalRef.current = chunksRef.current.join(" ");
  }

  function resetSession() {
    finalRef.current = "";
    chunksRef.current = [];
    setLiveText("");
    setError(null);
    setDrafts([]);
  }

  function startListening() {
    const Ctor = speechCtor();
    if (!Ctor) {
      toast.error(
        "Reconhecimento de voz não está disponível neste navegador. Use as opções de texto ou foto.",
      );
      return;
    }

    recRef.current?.abort();
    finalRef.current = "";
    chunksRef.current = [];
    setLiveText("");
    setError(null);

    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) pushFinal(text);
        else interim += ` ${text}`;
      }
      setLiveText(`${finalRef.current} ${interim}`.replace(/\s+/g, " ").trim());
      if (finalRef.current.trim()) mergeDrafts(parseVoiceProducts(finalRef.current));
    };

    rec.onerror = (event) => {
      setListening(false);
      if (event.error === "aborted") return;
      const message = FRIENDLY_ERRORS[event.error];
      setError(message ?? "Não foi possível reconhecer a voz. Tente novamente.");
    };

    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      if (!text) return;
      const parsed = parseVoiceProducts(text);
      if (parsed.length > 0) mergeDrafts(parsed);
      else
        setError(
          "Não consegui identificar nenhum produto na fala. Tente falar o nome do produto, por exemplo: “arroz”.",
        );
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
      setError("Não foi possível iniciar o microfone.");
    }
  }

  function stopListening() {
    recRef.current?.stop();
    setListening(false);
  }

  function close() {
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
    setSaving(false);
    setOpen(false);
    resetSession();
  }

  function openModal() {
    if (!speechCtor()) {
      toast.error(
        "Reconhecimento de voz não está disponível neste navegador. Use as opções de texto ou foto.",
      );
      return;
    }
    setOpen(true);
  }

  function restart() {
    resetSession();
    startListening();
  }

  function updateDraft(id: string, patch: Partial<VoiceDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  async function confirm() {
    const usable = drafts.filter((d) => d.name.trim() && !existing.has(productKey(d.name)));
    const skipped = drafts.length - usable.length;
    if (usable.length === 0) {
      toast.error("Nada novo para adicionar. Ajuste os produtos ou fale de novo.");
      return;
    }

    setSaving(true);
    try {
      for (const draft of usable) {
        await onAdd({
          name: draft.name.trim(),
          price: 0,
          quantity: draft.quantity,
          unit: draft.unit,
        });
      }
      toast.success(
        usable.length === 1
          ? `${usable[0]?.name ?? "Produto"} adicionado à lista.`
          : `${usable.length} produtos adicionados à lista.`,
      );
      if (skipped > 0) {
        toast.info(`${skipped} item(ns) já estavam na lista e foram ignorados.`);
      }
      close();
    } catch {
      toast.error("Não foi possível adicionar os produtos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-12 w-full" onClick={openModal}>
        <Mic className="mr-2 size-5" /> Adicionar por Voz
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur sm:items-center">
          <div className="glass max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Adicionar por voz</h2>
              <button onClick={close} aria-label="Fechar">
                <X className="size-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 py-2">
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                aria-label={listening ? "Parar gravação" : "Iniciar gravação"}
                aria-pressed={listening}
                className={`flex size-20 items-center justify-center rounded-full transition ${
                  listening
                    ? "glow animate-pulse bg-primary text-primary-foreground ring-8 ring-primary/20"
                    : "bg-secondary text-foreground hover:bg-secondary/70"
                }`}
              >
                {listening ? <MicOff className="size-8" /> : <Mic className="size-8" />}
              </button>
              <p className="text-sm font-medium" role="status">
                {listening ? "Ouvindo… fale os produtos" : "Toque no microfone e fale"}
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Fale um produto por vez ou vários separados por vírgula ou “e”. Ex.: “dois quilos de
                batata, três caixas de leite e uma dúzia de ovos”.
              </p>
            </div>

            {liveText && <p className="rounded-lg bg-secondary/50 p-2 text-sm">{liveText}</p>}

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}

            {listening && (
              <Button variant="outline" className="w-full" onClick={stopListening}>
                <MicOff className="mr-2 size-4" /> Parar gravação
              </Button>
            )}

            {drafts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Confira antes de adicionar</p>
                {drafts.map((draft) => {
                  const duplicated = existing.has(productKey(draft.name));
                  return (
                    <div
                      key={draft.id}
                      className={`space-y-2 rounded-xl bg-secondary/50 p-2 ${
                        duplicated ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="Nome do produto"
                          value={draft.name}
                          onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                          className="h-9 flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeDraft(draft.id)}
                          aria-label={`Remover ${draft.name}`}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <QtyField
                          value={draft.quantity}
                          onChange={(quantity) => updateDraft(draft.id, { quantity })}
                        />
                        <select
                          aria-label="Unidade"
                          value={draft.unit}
                          onChange={(e) => updateDraft(draft.id, { unit: e.target.value })}
                          className="h-9 rounded-lg border border-input bg-secondary/50 px-2 text-sm"
                        >
                          {UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                        {duplicated && (
                          <span className="text-xs text-muted-foreground">já na lista</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {drafts.length === 0 && !listening && !error && (
              <p className="text-center text-sm text-muted-foreground">
                Os produtos reconhecidos aparecem aqui para você revisar antes de adicionar.
              </p>
            )}

            <div className="grid gap-2">
              <Button
                className="gradient-brand glow"
                onClick={confirm}
                disabled={saving || readyCount === 0}
              >
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Check className="mr-2 size-4" />
                )}
                {saving
                  ? "Adicionando…"
                  : readyCount > 1
                    ? `Adicionar ${readyCount} itens`
                    : "Adicionar à lista"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={restart} disabled={saving}>
                  <RotateCcw className="mr-2 size-4" /> Falar de novo
                </Button>
                <Button variant="outline" onClick={close} disabled={saving}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
