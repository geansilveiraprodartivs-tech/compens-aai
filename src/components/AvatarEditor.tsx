import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/hooks/useAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 5 * 1024 * 1024;

function initials(name?: string | null) {
  const parts = (name?.trim() || "Usuário").split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
}

export function AvatarEditor({
  path,
  userId,
  displayName,
  onSaved,
}: {
  path: string | null;
  userId?: string | null | undefined;
  displayName?: string | null | undefined;
  onSaved: (path: string) => void;
}) {
  const qc = useQueryClient();
  const { data: signedUrl } = useAvatarUrl(path);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    if (event.target.value) event.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Escolha uma imagem (JPG, PNG, WEBP...).");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Imagem muito grande. Escolha uma com até 5 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function confirm() {
    if (!file || !userId) return;
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const objectPath = `avatars/${userId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(objectPath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      if (path && path !== objectPath) {
        await supabase.storage
          .from("avatars")
          .remove([path])
          .catch(() => {});
      }

      onSaved(objectPath);
      qc.invalidateQueries({ queryKey: ["avatar"] });
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
      toast.success("Foto de perfil atualizada!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível salvar a foto.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  }

  return (
    <section className="glass p-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 border border-border">
          {preview ? (
            <AvatarImage src={preview} alt="Nova foto selecionada" />
          ) : signedUrl ? (
            <AvatarImage src={signedUrl} alt="Foto de perfil" />
          ) : (
            <AvatarFallback className="text-lg font-bold text-primary">
              {initials(displayName)}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Camera className="size-4 text-accent" /> Foto de perfil
          </p>
          <p className="text-xs text-muted-foreground">
            {preview
              ? "Foto selecionada — confirme para salvar."
              : "Escolha uma foto do seu aparelho."}
          </p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      <div className="mt-4 flex flex-wrap gap-2">
        {preview ? (
          <>
            <Button onClick={confirm} disabled={busy} className="flex-1 gradient-brand">
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 size-4" />
              )}
              Confirmar foto
            </Button>
            <Button variant="outline" onClick={cancel} disabled={busy}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => inputRef.current?.click()} className="flex-1">
            <ImagePlus className="mr-2 size-4" /> Alterar foto
          </Button>
        )}
      </div>
    </section>
  );
}
