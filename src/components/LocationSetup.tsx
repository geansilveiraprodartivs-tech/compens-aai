import { useState } from "react";
import { MapPin, Navigation, Mail, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateProfile } from "@/hooks/useProfile";

type Mode = "choose" | "cep" | "manual";

export function LocationSetup({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [cep, setCep] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [busy, setBusy] = useState(false);
  const update = useUpdateProfile();

  async function useGeolocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Seu aparelho não permite localização automática.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await update.mutateAsync({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          location_label: "Minha localização atual",
        });
        setBusy(false);
        toast.success("Localização salva!");
        onDone?.();
      },
      () => {
        setBusy(false);
        toast.error("Não conseguimos acessar sua localização.");
      },
    );
  }

  async function saveCep() {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        localidade?: string;
        bairro?: string;
        uf?: string;
      };
      if (data.erro) throw new Error("CEP não encontrado");
      await update.mutateAsync({
        cep: clean,
        city: data.localidade ?? null,
        neighborhood: data.bairro ?? null,
        location_label: `${data.bairro ?? ""}${data.bairro ? ", " : ""}${data.localidade ?? ""} - ${data.uf ?? ""}`,
      });
      toast.success("Localização salva!");
      onDone?.();
    } catch {
      toast.error("Não foi possível consultar esse CEP.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    if (!city.trim()) {
      toast.error("Informe pelo menos a cidade.");
      return;
    }
    setBusy(true);
    await update.mutateAsync({
      city: city.trim(),
      neighborhood: neighborhood.trim() || null,
      location_label: neighborhood.trim() ? `${neighborhood.trim()}, ${city.trim()}` : city.trim(),
    });
    setBusy(false);
    toast.success("Localização salva!");
    onDone?.();
  }

  return (
    <section className="glass glow p-5">
      <div className="flex items-center gap-2">
        <MapPin className="size-5 text-accent" />
        <h2 className="text-lg font-bold">Onde você faz suas compras?</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Usamos sua região para encontrar mercados próximos e personalizar os preços pesquisados.
      </p>

      {mode === "choose" && (
        <div className="mt-4 space-y-2">
          <Button
            onClick={useGeolocation}
            disabled={busy}
            className="h-12 w-full justify-start gradient-brand glow"
          >
            <Navigation className="mr-2 size-4" /> Usar minha localização
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode("cep")}
            className="h-12 w-full justify-start"
          >
            <Mail className="mr-2 size-4" /> Informar CEP
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode("manual")}
            className="h-12 w-full justify-start"
          >
            <Building2 className="mr-2 size-4" /> Escolher cidade/bairro
          </Button>
        </div>
      )}

      {mode === "cep" && (
        <div className="mt-4 space-y-3">
          <Input
            inputMode="numeric"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={saveCep} disabled={busy} className="flex-1 gradient-brand">
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setMode("choose")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {mode === "manual" && (
        <div className="mt-4 space-y-3">
          <Input placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input
            placeholder="Bairro (opcional)"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={saveManual} disabled={busy} className="flex-1 gradient-brand">
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setMode("choose")}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
