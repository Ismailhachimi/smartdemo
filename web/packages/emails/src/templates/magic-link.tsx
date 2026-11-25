import { Button, Heading, Section, Text } from "react-email";
import { Layout, button, h1, muted, p } from "./layout.js";

export interface MagicLinkProps {
  url: string;
  appUrl: string;
  minutes: number;
}

export default function MagicLinkEmail({ url, appUrl, minutes }: MagicLinkProps) {
  return (
    <Layout preview="Ton lien de connexion à SmartDemo" appUrl={appUrl}>
      <Heading style={h1}>Connexion à SmartDemo</Heading>
      <Text style={p}>Clique sur le bouton ci-dessous pour te connecter. Le lien est valable {minutes} minutes et ne fonctionne qu'une fois.</Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={url} style={button}>Se connecter</Button>
      </Section>
      <Text style={muted}>Si tu n'as pas demandé ce lien, ignore simplement cet email.</Text>
    </Layout>
  );
}

MagicLinkEmail.PreviewProps = {
  url: "http://localhost:8080/auth/verify?token=preview",
  appUrl: "http://localhost:8080",
  minutes: 15,
} satisfies MagicLinkProps;
