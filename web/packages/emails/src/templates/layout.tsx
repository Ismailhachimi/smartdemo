import { Body, Container, Head, Html, Img, Preview, Section, Text } from "react-email";
import type { ReactNode } from "react";

export const colors = {
  bg: "#f4f4f7",
  card: "#ffffff",
  text: "#1f2330",
  muted: "#6b7080",
  brand: "#4f46e5",
};

export function Layout({ preview, appUrl, children }: { preview: string; appUrl: string; children: ReactNode }) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 520, margin: "0 auto", backgroundColor: colors.card, borderRadius: 14, padding: "32px 36px" }}>
          <Section style={{ marginBottom: 24 }}>
            <Img src={`${appUrl}/icon.png`} width="40" height="40" alt="SmartDemo" style={{ borderRadius: 10 }} />
          </Section>
          {children}
        </Container>
        <Text style={{ textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 20 }}>
          SmartDemo · {new URL(appUrl).host}
        </Text>
      </Body>
    </Html>
  );
}

export const h1 = { color: colors.text, fontSize: 22, fontWeight: 600, margin: "0 0 12px" } as const;
export const p = { color: colors.text, fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } as const;
export const muted = { color: colors.muted, fontSize: 13, lineHeight: "20px", margin: "16px 0 0" } as const;
export const button = {
  backgroundColor: colors.brand,
  color: "#ffffff",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
} as const;
