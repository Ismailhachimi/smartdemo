import { Button, Heading, Section, Text } from "react-email";
import { Layout, button, h1, muted, p } from "./layout.js";

export interface VideoViewedProps {
  appUrl: string;
  videoTitle: string;
  linkLabel: string | null;
  dashboardUrl: string;
}

export default function VideoViewedEmail({ appUrl, videoTitle, linkLabel, dashboardUrl }: VideoViewedProps) {
  const who = linkLabel ? `Quelqu'un via le lien « ${linkLabel} »` : "Quelqu'un";
  return (
    <Layout preview={`${who} regarde « ${videoTitle} »`} appUrl={appUrl}>
      <Heading style={h1}>👀 Ta vidéo est regardée</Heading>
      <Text style={p}>
        {who} vient d'ouvrir <strong>« {videoTitle} »</strong>.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={dashboardUrl} style={button}>Voir les statistiques</Button>
      </Section>
      <Text style={muted}>Tu peux couper ces notifications lien par lien depuis le tableau de bord.</Text>
    </Layout>
  );
}

VideoViewedEmail.PreviewProps = {
  appUrl: "http://localhost:8080",
  videoTitle: "Démo entrops pour ACME",
  linkLabel: "ACME — Julie",
  dashboardUrl: "http://localhost:8080/videos/preview",
} satisfies VideoViewedProps;
