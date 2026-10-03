import { useRef, useState } from "react";
import { Camera, Check, Pencil, RotateCcw, Loader2, AlertTriangle, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeProductPhoto } from "@/lib/photo.functions";
import { brl } from "@/lib/compensai";

type AddFn = (item: { name: string; price: number; quantity: number; unit: string }) => Promise<unknown>;

/** Reduz a foto para envio rápido (máx. 1280px, JPEG). */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export function PhotoAdd({ onAdd }: { onAdd: AddFn }) {
  const analyze = useServerFn(analyzeProductPhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("un");
  const [saving, setSaving] = useState(false);

  const openCamera = () => {
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  };

  const openGallery = () => {
    if (galleryRef.current) galleryRef.current.value = "";
    galleryRef.current?.click();
  };

  async function onFile(file?: File) {
    if (!file) return;
    setOpen(true);
    setLoading(true);
    setProblem(null);
    setNote(null);
    setEditing(false);
    try {
      const image = await shrink(file);
      setPreview(image);
      const r = await analyze({ data: { image } });
      setName(r.name ?? "");
      setPrice(r.price != null ? r.price.toFixed(2).replace(".", ",") : "");
      setUnit(r.unit ?? "un");
      setNote(r.price_note);
      if (!r.ok || !r.name || r.price == null) {
        setProblem(r.problem ?? "Não identifiquei claramente o produto ou o preço.");
        setEditing(true);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Falha ao analisar a foto.");
      setEditing(true);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    const p = Number(price.replace(",", "."));
    if (!name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), price: Number.isFinite(p) ? p : 0, quantity: 1, unit });
      toast.success(`${name.trim()} adicionado à lista.`);
      openCamera(); // próximo produto
    } catch {
      toast.error("Não foi possível adicionar.");
    } finally {
      setSaving(false);
    }
  }

  const priceNum = Number(price.replace(",", "."));

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button type="button" variant="outline" className="h-12 w-full" onClick={openCamera}>
        <Camera className="mr-2 size-5" /> Adicionar por Foto
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur sm:items-center">
          <div className="glass w-full max-w-md space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Confirmar produto</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="size-5 text-muted-foreground" />
              </button>
            </div>
            {preview && (
              <img src={preview} alt="Foto do produto" className="max-h-48 w-full rounded-xl object-contain" />
            )}
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Analisando a foto…
              </p>
            ) : (
              <>
                {problem && (
                  <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {problem}
                  </p>
                )}
                {editing ? (
                  <div className="space-y-2">
                    <Input placeholder="Produto" value={name} onChange={(e) => setName(e.target.value)} />
                    <Input
                      inputMode="decimal"
                      placeholder="Preço (R$)"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1 rounded-xl bg-secondary/50 p-3 text-sm">
                    <p><span className="text-muted-foreground">Produto:</span> <b>{name}</b></p>
                    <p>
                      <span className="text-muted-foreground">Preço:</span>{" "}
                      <b>{Number.isFinite(priceNum) ? brl(priceNum) : "—"}</b>
                      {unit !== "un" ? ` / ${unit}` : ""}
                      {note ? <span className="text-xs text-muted-foreground"> ({note})</span> : null}
                    </p>
                    <p><span className="text-muted-foreground">Quantidade:</span> <b>1 unidade</b></p>
                  </div>
                )}
                <div className="grid gap-2">
                  <Button className="gradient-brand glow" onClick={confirm} disabled={saving}>
                    <Check className="mr-2 size-4" /> Confirmar e adicionar
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setEditing(true)} disabled={editing}>
                      <Pencil className="mr-2 size-4" /> Editar
                    </Button>
                    <Button variant="outline" onClick={openCamera}>
                      <RotateCcw className="mr-2 size-4" /> Tirar outra foto
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
