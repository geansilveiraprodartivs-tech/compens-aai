import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, AlertTriangle, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeProductPhoto } from "@/lib/photo.functions";
import { brl, UNITS } from "@/lib/compensai";

export type CompareItem = { label: string; price: number; quantity: number; unit: string };

async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

const fmt = (v: number) => v.toFixed(2).replace(".", ",");

/** Fotografa um produto, a IA lê nome/preço/tamanho e adiciona na comparação. */
export function PhotoCompare({ onAdd, count }: { onAdd: (i: CompareItem) => void; count: number }) {
  const analyze = useServerFn(analyzeProductPhoto);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [options, setOptions] = useState<number[]>([]);
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState("un");

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) ref.current.value = "";
    ref.current?.click();
  };

  async function onFile(file?: File) {
    if (!file) return;
    setOpen(true);
    setLoading(true);
    setProblem(null);
    try {
      const image = await shrink(file);
      setPreview(image);
      const r = await analyze({ data: { image } });
      setName(r.name ?? "");
      const opts =
        r.price != null && r.regular_price != null && r.regular_price !== r.price
          ? [r.price, r.regular_price].sort((a, b) => a - b)
          : [];
      setOptions(opts);
      setPrice(opts.length ? "" : r.price != null ? fmt(r.price) : "");
      setSize(r.package_size != null ? String(r.package_size).replace(".", ",") : "1");
      setUnit(r.package_unit ?? "un");
      if (!r.ok || !r.name || r.price == null) setProblem(r.problem ?? "Não identifiquei claramente o produto ou o preço.");
      else if (r.package_size == null) setProblem("Não vi o tamanho da embalagem. Confira o peso/volume abaixo.");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Falha ao analisar a foto.");
    } finally {
      setLoading(false);
    }
  }

  function confirm(): void {
    const p = Number(price.replace(",", "."));
    const q = Number(size.replace(",", "."));
    if (!name.trim()) return toast.error("Informe o nome do produto.");
    if (!p) return toast.error(options.length > 1 ? "Escolha qual dos dois preços você quer." : "Informe o preço.");
    if (!q) return toast.error("Informe o tamanho da embalagem.");
    onAdd({ label: name.trim(), price: p, quantity: q, unit });
    toast.success(`${name.trim()} adicionado à comparação.`);
    setOpen(false);
  }

  return (
    <div className="glass space-y-2 p-4">
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <p className="text-sm font-semibold">Comparar por foto</p>
      <p className="text-xs text-muted-foreground">
        {count === 0
          ? "Fotografe o primeiro produto."
          : "Agora fotografe o mesmo produto de outra marca ou tamanho."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="gradient-brand glow" onClick={() => pick(camRef)}>
          <Camera className="mr-2 size-4" /> Câmera
        </Button>
        <Button type="button" variant="outline" onClick={() => pick(galRef)}>
          <ImagePlus className="mr-2 size-4" /> Galeria
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur sm:items-center">
          <div className="glass max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Confirmar produto</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="size-5 text-muted-foreground" />
              </button>
            </div>
            {preview && <img src={preview} alt="Foto do produto" className="max-h-40 w-full rounded-xl object-contain" />}
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
                {options.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Esta etiqueta tem dois preços. Qual você quer usar?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {options.map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPrice(fmt(v))}
                          className={`rounded-xl border p-3 text-left ${price === fmt(v) ? "border-primary bg-primary/15 glow" : "border-border bg-secondary/50"}`}
                        >
                          <span className="block text-xs text-muted-foreground">{i === 0 ? "Promocional" : "Normal"}</span>
                          <b className="text-lg">{brl(v)}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Input placeholder="Produto" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <Input inputMode="decimal" placeholder="Preço" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <Input inputMode="decimal" placeholder="Tamanho" value={size} onChange={(e) => setSize(e.target.value)} />
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-lg border border-input bg-secondary/50 px-3 text-sm">
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <Button className="gradient-brand glow w-full" onClick={confirm}>
                  <Check className="mr-2 size-4" /> Adicionar à comparação
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
