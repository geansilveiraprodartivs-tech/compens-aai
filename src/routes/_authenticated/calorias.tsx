import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe,
  HeartPulse,
  History,
  ImagePlus,
  Info,
  Leaf,
  Loader2,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useActiveList, useItemMutations, useListItems } from "@/hooks/useList";
import { productKey } from "@/lib/voiceList";
import { analyzeFoodPhoto, researchFoodByName } from "@/lib/nutrition.functions";
import {
  CONFIDENCE_HINTS,
  CONFIDENCE_LABELS,
  NUTRITION_GOALS,
  ORIGIN_HINTS,
  ORIGIN_LABELS,
  VERDICTS,
  addHistory,
  clearHistory,
  fmtGrams,
  fmtKcal,
  fmtNumber,
  fmtPortion,
  fmtSodium,
  goalLabel,
  historySummary,
  readGoal,
  readHistory,
  removeHistory,
  scaleNutrients,
  toNumber,
  writeGoal,
  type Confidence,
  type DataOrigin,
  type FoodAnalysis,
  type FoodSuggestion,
  type HistoryEntry,
  type NutritionGoal,
} from "@/lib/nutrition";

export const Route = createFileRoute("/_authenticated/calorias")({
  head: () => ({
    meta: [
      { title: "Calorias — CompensAI" },
      {
        name: "description",
        content:
          "Fotografe o alimento e veja calorias, nutrientes e como ele combina com seu objetivo.",
      },
      { property: "og:title", content: "Calorias — CompensAI" },
      {
        property: "og:description",
        content:
          "Fotografe o alimento e veja calorias, nutrientes e como ele combina com seu objetivo.",
      },
    ],
  }),
  component: CaloriasPage,
});

/** Reduz a foto para envio rápido (máx. 1280px, JPEG). Mesmo padrão do PhotoAdd. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

const STORE = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
};

const ORIGIN_STYLE: Record<DataOrigin, { className: string; icon: typeof Check }> = {
  label: { className: "border-success/40 bg-success/10 text-success", icon: CheckCircle2 },
  openfoodfacts: { className: "border-primary/40 bg-primary/10 text-primary", icon: BookOpenCheck },
  web: { className: "border-primary/40 bg-primary/10 text-primary", icon: Globe },
  unknown: {
    className: "border-border bg-secondary/60 text-muted-foreground",
    icon: AlertTriangle,
  },
};

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "border-success/40 bg-success/10 text-success",
  medium: "border-accent/40 bg-accent/10 text-accent",
  low: "border-destructive/40 bg-destructive/10 text-destructive",
};

function CaloriasPage() {
  const analyze = useServerFn(analyzeFoodPhoto);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [goal, setGoal] = useState<NutritionGoal>("know");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: list } = useActiveList();
  const { data: items = [] } = useListItems(list?.id);
  const { add } = useItemMutations(list?.id);

  const existingKeys = useMemo(() => new Set(items.map((item) => productKey(item.name))), [items]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) return;
      setGoal(readGoal(STORE, id));
      setHistory(readHistory(STORE, id));
    });
  }, []);

  const chooseGoal = (value: NutritionGoal) => {
    setGoal(value);
    if (userId) writeGoal(STORE, userId, value);
  };

  const remember = useCallback(
    (result: FoodAnalysis) => {
      if (!result.ok || !userId) return;
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        goal,
        analysis: result,
      };
      setHistory(addHistory(STORE, userId, entry));
    },
    [goal, userId],
  );

  const onFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      setLoading(true);
      setError(null);
      setAnalysis(null);
      try {
        const image = await shrink(file);
        setPreview(image);
        const result = await analyze({ data: { image, goal } });
        setAnalysis(result);
        remember(result);
      } catch (e) {
        setPreview(null);
        setError(e instanceof Error ? e.message : "Não foi possível analisar a foto agora.");
      } finally {
        setLoading(false);
      }
    },
    [analyze, goal, remember],
  );

  const onResearched = useCallback(
    (result: FoodAnalysis) => {
      setAnalysis(result);
      setPreview(null);
      setError(null);
      remember(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [remember],
  );

  const openCamera = () => {
    if (cameraRef.current) cameraRef.current.value = "";
    cameraRef.current?.click();
  };

  const openGallery = () => {
    if (galleryRef.current) galleryRef.current.value = "";
    galleryRef.current?.click();
  };

  const reset = () => {
    setAnalysis(null);
    setPreview(null);
    setError(null);
  };

  const addSuggestion = async (suggestion: FoodSuggestion) => {
    const key = productKey(suggestion.name);
    if (existingKeys.has(key)) {
      toast.info(`${suggestion.name} já está na sua lista.`);
      return;
    }
    try {
      await add.mutateAsync({ name: suggestion.name, quantity: 1, unit: "un" });
      toast.success(`${suggestion.name} adicionado à sua lista.`);
    } catch {
      toast.error("Não foi possível adicionar à lista.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {/* Cabeçalho */}
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <span className="gradient-brand grid size-9 place-items-center rounded-xl text-primary-foreground glow">
            <Flame className="size-5" />
          </span>
          Calorias
        </h1>
        <p className="text-sm text-muted-foreground">
          Fotografe o alimento ou a embalagem. A IA reconhece o produto — com ou sem rótulo — e
          pesquisa os valores nutricionais em fontes confiáveis, sempre mostrando de onde vieram.
        </p>
      </header>

      {/* Captura */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-4 shadow-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3.5" /> Análise por câmera
          </div>

          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-border">
              <img src={preview} alt="Foto analisada" className="max-h-56 w-full object-cover" />
              {loading && (
                <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Loader2 className="size-4 animate-spin text-primary" /> Reconhecendo e
                    pesquisando…
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid place-items-center rounded-xl border border-dashed border-primary/35 bg-background/40 px-4 py-8 text-center">
              <Camera className="size-8 text-primary/80" />
              <p className="mt-2 text-sm font-semibold">
                Aponte para o alimento ou para a embalagem
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Funciona mesmo sem a tabela nutricional à vista: a IA reconhece o produto e pesquisa
                os valores.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="gradient-brand h-12 flex-1 text-primary-foreground"
              onClick={openCamera}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : <Camera />}
              {analysis ? "Fotografar outra vez" : "Fotografar alimento"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              onClick={openGallery}
              disabled={loading}
            >
              <ImagePlus /> Escolher da galeria
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-tight text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />A foto é usada só para a análise e
            não fica salva no CompensAI. As análises são orientativas e não substituem nutricionista
            ou médico.
          </p>
        </div>
      </section>

      <NameSearch goal={goal} onFound={onResearched} />

      {/* Objetivo */}
      <section className="glass p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <HeartPulse className="size-4 text-accent" /> Seu objetivo
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {NUTRITION_GOALS.map((option) => {
            const active = goal === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseGoal(option.value)}
                aria-pressed={active}
                className={
                  active
                    ? "rounded-xl border border-primary/60 bg-primary/15 p-3 text-left text-xs font-semibold text-foreground"
                    : "rounded-xl border border-border bg-secondary/40 p-3 text-left text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40"
                }
              >
                <span className="flex items-center gap-1.5">
                  {active && <Check className="size-3.5 text-primary" />}
                  {option.label}
                </span>
                <span className="mt-1 block font-normal text-[11px] leading-tight opacity-80">
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
        {analysis && analysis.goal !== goal && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Você mudou o objetivo. A avaliação acima considera “{goalLabel(analysis.goal)}” —
            fotografe de novo para reavaliar com o objetivo novo.
          </p>
        )}
      </section>

      {error && (
        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Não foi possível analisar
          </p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" className="mt-3 h-9" onClick={reset}>
            <RotateCcw /> Tentar novamente
          </Button>
        </section>
      )}

      {analysis && (
        <AnalysisCard analysis={analysis} preview={preview} onAdd={addSuggestion} onClose={reset} />
      )}

      {/* Histórico */}
      <section className="glass p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-primary" /> Análises recentes
          </h2>
          {history.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (!userId) return;
                setHistory(clearHistory(STORE, userId));
                toast.success("Histórico limpo.");
              }}
            >
              Limpar tudo
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nenhuma análise ainda. As últimas 15 ficam guardadas neste aparelho, sem as fotos.
          </p>
        ) : (
          <>
            <ul className={showHistory ? "mt-3 space-y-2" : "mt-3 space-y-2"}>
              {(showHistory ? history : history.slice(0, 3)).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-2.5"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setAnalysis(entry.analysis);
                      setPreview(null);
                      setError(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span className="block truncate text-sm font-semibold">
                      {entry.analysis.name || "Análise"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {historySummary(entry)} · {goalLabel(entry.goal)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir análise de ${entry.analysis.name}`}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      if (!userId) return;
                      setHistory(removeHistory(STORE, userId, entry.id));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            {history.length > 3 && (
              <button
                type="button"
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? "Mostrar menos" : `Ver todas (${history.length})`}
                <ArrowRight
                  className={`size-3.5 transition-transform ${showHistory ? "-rotate-90" : ""}`}
                />
              </button>
            )}
          </>
        )}
      </section>

      <p className="pb-2 text-center text-[11px] leading-tight text-muted-foreground">
        O CompensAI não faz diagnóstico nutricional nem garante segurança para alergias ou
        restrições. Em caso de dúvida, procure um nutricionista.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ cartão */

function AnalysisCard({
  analysis,
  preview,
  onAdd,
  onClose,
}: {
  analysis: FoodAnalysis;
  preview: string | null;
  onAdd: (suggestion: FoodSuggestion) => void | Promise<void>;
  onClose: () => void;
}) {
  const origin = ORIGIN_STYLE[analysis.origin];
  const OriginIcon = origin.icon;
  const verdict = VERDICTS[analysis.fit.verdict];
  const unit = analysis.basis === "100 ml" ? "ml" : "g";

  const [amount, setAmount] = useState("");
  const consumed = useMemo(() => {
    const parsed = toNumber(amount);
    if (parsed == null || parsed <= 0) return null;
    const grams = Math.min(parsed, 5000);
    return { grams, nutrients: scaleNutrients(analysis.per100, grams) };
  }, [amount, analysis.per100]);

  const hasValues = analysis.origin !== "unknown";

  return (
    <section className="animate-rise space-y-3">
      <div className="glass overflow-hidden">
        <div className="flex items-start justify-between gap-2 border-b border-border/70 bg-secondary/30 p-4">
          <div className="flex min-w-0 items-start gap-3">
            {preview && (
              <img
                src={preview}
                alt={`Foto analisada de ${analysis.name || "alimento"}`}
                className="size-16 shrink-0 rounded-lg border border-border object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {analysis.category ?? "Alimento"}
              </p>
              <h2 className="font-display truncate text-lg font-bold">
                {analysis.name || "Alimento identificado"}
              </h2>
              {(analysis.brand || analysis.variant) && (
                <p className="truncate text-xs text-muted-foreground">
                  {[analysis.brand, analysis.variant].filter(Boolean).join(" · ")}
                </p>
              )}
              <span
                className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLE[analysis.confidence]}`}
                title={CONFIDENCE_HINTS[analysis.confidence]}
              >
                <ScanLine className="size-3" /> {CONFIDENCE_LABELS[analysis.confidence]}
              </span>
            </div>
          </div>
          <button type="button" aria-label="Fechar análise" onClick={onClose}>
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Origem do dado + fonte consultada */}
          <div className={`rounded-xl border p-3 ${origin.className}`}>
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <OriginIcon className="size-3.5" /> {ORIGIN_LABELS[analysis.origin]}
            </p>
            <p className="mt-1 text-[11px] leading-snug opacity-85">
              {ORIGIN_HINTS[analysis.origin]}
            </p>
            {analysis.source_name && (
              <p className="mt-1 text-[11px] leading-snug opacity-85">
                Fonte: {analysis.source_name}
              </p>
            )}
            {analysis.source_url && (
              <a
                href={analysis.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold underline"
              >
                Abrir a fonte consultada <ExternalLink className="size-3" />
              </a>
            )}
            {analysis.source_note && (
              <p className="mt-1 text-[11px] font-semibold leading-snug opacity-90">
                {analysis.source_note}
              </p>
            )}
          </div>

          {analysis.problem && (
            <p className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs text-accent">
              {analysis.problem}
            </p>
          )}

          {analysis.confidence === "low" && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />A identificação ficou incerta. Use a
              pesquisa por nome e marca acima para confirmar o produto antes de considerar estes
              valores.
            </p>
          )}

          {/* Porção em destaque */}
          {hasValues && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Porção de referência · {fmtPortion(analysis.portion, analysis.basis)}
              </p>
              <p className="font-display mt-1 text-3xl font-extrabold text-primary">
                {fmtKcal(analysis.portion.nutrients.kcal)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Macro label="Carboidratos" value={fmtGrams(analysis.portion.nutrients.carbs)} />
                <Macro label="Proteínas" value={fmtGrams(analysis.portion.nutrients.protein)} />
                <Macro label="Gorduras" value={fmtGrams(analysis.portion.nutrients.fat)} />
                <Macro label="Fibras" value={fmtGrams(analysis.portion.nutrients.fiber)} />
              </div>
            </div>
          )}

          {/* Quantidade consumida */}
          {hasValues && (
            <div className="rounded-xl border border-border bg-secondary/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quanto você vai consumir?
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={5000}
                  step="any"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={`Ex.: 150 (${unit})`}
                  aria-label={`Quantidade consumida em ${unit === "g" ? "gramas" : "mililitros"}`}
                  className="h-10 max-w-[10rem]"
                />
                <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
                {consumed && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => setAmount("")}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              {consumed ? (
                <div className="mt-3 rounded-lg bg-background/60 p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Em {fmtNumber(consumed.grams, 0)} {unit}
                  </p>
                  <p className="font-display text-2xl font-extrabold text-primary">
                    {fmtKcal(consumed.nutrients.kcal)}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                    <NutrientLine label="Carboidratos" value={fmtGrams(consumed.nutrients.carbs)} />
                    <NutrientLine label="Proteínas" value={fmtGrams(consumed.nutrients.protein)} />
                    <NutrientLine label="Gorduras" value={fmtGrams(consumed.nutrients.fat)} />
                    <NutrientLine label="Saturadas" value={fmtGrams(consumed.nutrients.sat_fat)} />
                    <NutrientLine label="Açúcares" value={fmtGrams(consumed.nutrients.sugar)} />
                    <NutrientLine label="Sódio" value={fmtSodium(consumed.nutrients.sodium)} />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Os valores acima são por 100 {unit}. Informe a quantidade para ver o total do seu
                  consumo.
                </p>
              )}
            </div>
          )}

          {/* Tabela por 100 g/ml */}
          {hasValues && (
            <div className="rounded-xl border border-border bg-secondary/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Por {analysis.basis}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                <NutrientLine label="Calorias" value={fmtKcal(analysis.per100.kcal)} strong />
                <NutrientLine label="Carboidratos" value={fmtGrams(analysis.per100.carbs)} />
                <NutrientLine label="Proteínas" value={fmtGrams(analysis.per100.protein)} />
                <NutrientLine label="Gorduras totais" value={fmtGrams(analysis.per100.fat)} />
                <NutrientLine label="Saturadas" value={fmtGrams(analysis.per100.sat_fat)} />
                <NutrientLine label="Trans" value={fmtGrams(analysis.per100.trans_fat)} />
                <NutrientLine label="Fibras" value={fmtGrams(analysis.per100.fiber)} />
                <NutrientLine label="Açúcares" value={fmtGrams(analysis.per100.sugar)} />
                <NutrientLine label="Sódio" value={fmtSodium(analysis.per100.sodium)} />
              </div>
              <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
                “—” significa que o valor não estava disponível na fonte. Nada é preenchido por
                adivinhação.
              </p>
            </div>
          )}

          {/* Avaliação */}
          <div className={`rounded-xl border p-3 ${verdict.className}`}>
            <p className="text-sm font-bold">{verdict.label}</p>
            <p className="mt-1 text-xs leading-snug opacity-90">{analysis.fit.reason}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
              Objetivo: {goalLabel(analysis.goal)}
            </p>
          </div>

          {/* Benefícios / atenção */}
          {(analysis.benefits.length > 0 || analysis.cautions.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {analysis.benefits.length > 0 && (
                <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-success">
                    <Leaf className="size-3.5" /> Pontos positivos
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-muted-foreground">
                    {analysis.benefits.map((benefit) => (
                      <li key={benefit} className="flex gap-1.5">
                        <Check className="mt-0.5 size-3 shrink-0 text-success" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.cautions.length > 0 && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-accent">
                    <Info className="size-3.5" /> Pontos de atenção
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] leading-snug text-muted-foreground">
                    {analysis.cautions.map((caution) => (
                      <li key={caution} className="flex gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-accent" />
                        <span>{caution}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {analysis.ingredients && (
            <details className="rounded-xl border border-border bg-secondary/20 p-3">
              <summary className="cursor-pointer text-xs font-semibold">
                Ingredientes lidos na embalagem
              </summary>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {analysis.ingredients}
              </p>
            </details>
          )}
        </div>
      </div>

      {/* Boas escolhas */}
      {analysis.better_choices.length > 0 && (
        <div className="glass p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart className="size-4 text-primary" /> Boas escolhas para sua próxima compra
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Alternativas para variar sem perder o equilíbrio. Toque para adicionar à sua lista
            atual.
          </p>
          <ul className="mt-3 space-y-2">
            {analysis.better_choices.map((suggestion) => (
              <li
                key={suggestion.name}
                className="rounded-xl border border-border bg-secondary/30 p-3"
              >
                <p className="text-sm font-semibold">{suggestion.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {suggestion.why}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-9 w-full border-primary/40 text-primary sm:w-auto"
                  onClick={() => void onAdd(suggestion)}
                >
                  <ShoppingCart /> Adicionar à minha lista de compras
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Equilíbrio */}
      {analysis.balance_tips.length > 0 && (
        <div className="glass p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <HeartPulse className="size-4 text-accent" /> Dá para aproveitar sem sair do equilíbrio?
          </h3>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-muted-foreground">
            {analysis.balance_tips.map((tip) => (
              <li key={tip} className="flex gap-1.5">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function NameSearch({
  goal,
  onFound,
}: {
  goal: NutritionGoal;
  onFound: (analysis: FoodAnalysis) => void;
}) {
  const research = useServerFn(researchFoodByName);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      toast.error("Digite o nome do alimento ou produto.");
      return;
    }
    setBusy(true);
    try {
      const result = await research({
        data: { name: clean, brand: brand.trim() || undefined, goal },
      });
      onFound(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível pesquisar este produto agora.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Search className="size-4 text-primary" /> Não achou pela foto? Pesquise pelo nome
      </h2>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Informe o nome e a marca. A busca consulta o Open Food Facts e, se precisar, páginas na
        internet — sempre mostrando a fonte.
      </p>
      <form className="mt-3 space-y-2" onSubmit={submit}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome do produto (ex.: Nescau 2.0 em pó)"
          aria-label="Nome do produto"
          className="h-10"
          disabled={busy}
          maxLength={120}
        />
        <Input
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          placeholder="Marca (opcional, ex.: Nestlé)"
          aria-label="Marca do produto"
          className="h-10"
          disabled={busy}
          maxLength={60}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-10 w-full border-primary/40 text-primary"
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Search />}
          {busy ? "Pesquisando fontes…" : "Pesquisar valores nutricionais"}
        </Button>
      </form>
    </section>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-bold">{value}</p>
    </div>
  );
}

function NutrientLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold text-foreground" : "font-semibold"}>{value}</span>
    </div>
  );
}
