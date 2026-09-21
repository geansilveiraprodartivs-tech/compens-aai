import logo from "@/assets/compensai-logo.png.asset.json";

export function Brand({ size = 44 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={logo.url}
        alt="CompensAI"
        width={size}
        height={size}
        className="rounded-2xl glow"
        style={{ width: size, height: size, objectFit: "cover" }}
      />
      <div className="leading-tight">
        <p className="font-display text-lg font-bold">
          Compens<span className="text-gradient">AI</span>
        </p>
        <p className="text-[11px] text-muted-foreground">Compare. Escolha. Economize.</p>
      </div>
    </div>
  );
}
