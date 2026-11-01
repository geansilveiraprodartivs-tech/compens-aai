import { useRef, useState } from "react";
import { Camera, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/hooks/useAvatar";
import { Button } from "@/components/ui/button";

export function AvatarEditor({
  path,
  userId,
  onSaved,
}: {
  path: string | null;
  userId?: string;
  onSaved: (path: string) => Promise<unknown>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { data: url } = useAvatarUrl(path);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(f?: File) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Foto maior que 5MB."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function confirm() {
    if (!file || !userId) return;
    setBusy(true);
    const ext = file.name.split(".").pop() || "jpg";
    const p = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(p, file, { upsert: true, contentType: file.type });
    if (error) { setBusy(false); toast.error("Não foi possível salvar a foto."); return; }
    await onSaved(p);
    if (path) await supabase.storage.from("avatars").remove([path]);
    setBusy(false); setFile(null); setPreview(null);
    toast.success("Foto atualizada!");
  }

  const shown = preview ?? url;
  return (
    <section className="glass flex items-center gap-4 p-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/40 bg-secondary">
        {shown ? <img src={shown} alt="Foto de perfil" className="size-full object-cover" /> : <User className="size-8 text-muted-foreground" />}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {file ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm} disabled={busy}>{busy ? "Salvando..." : "Confirmar"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFile(null); setPreview(null); }}>Cancelar</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>
            <Camera className="mr-2 size-4" /> Alterar foto
          </Button>
        )}
      </div>
    </section>
  );
}
