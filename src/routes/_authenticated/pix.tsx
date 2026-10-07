import { createFileRoute } from "@tanstack/react-router";
import { PixSection } from "@/components/PixSection";

export const Route = createFileRoute("/_authenticated/pix")({
  head: () => ({
    meta: [
      { title: "Pagamento via Pix — CompensAI" },
      { name: "description", content: "Em breve: pague suas compras com Pix e QR Code pelo CompensAI." },
      { property: "og:title", content: "Pagamento via Pix — CompensAI" },
      { property: "og:description", content: "Em breve: pague suas compras com Pix e QR Code pelo CompensAI." },
    ],
  }),
  component: () => <PixSection />,
});
