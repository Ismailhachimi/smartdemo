import { render } from "@react-email/render";
import { createElement } from "react";
import MagicLinkEmail, { type MagicLinkProps } from "./templates/magic-link.js";
import VideoViewedEmail, { type VideoViewedProps } from "./templates/video-viewed.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

async function build(subject: string, element: ReturnType<typeof createElement>): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject, html, text };
}

export function magicLinkEmail(props: MagicLinkProps): Promise<RenderedEmail> {
  return build("Ton lien de connexion à SmartDemo", createElement(MagicLinkEmail, props));
}

export function videoViewedEmail(props: VideoViewedProps): Promise<RenderedEmail> {
  const subject = props.linkLabel
    ? `👀 « ${props.videoTitle} » regardée (${props.linkLabel})`
    : `👀 « ${props.videoTitle} » est regardée`;
  return build(subject, createElement(VideoViewedEmail, props));
}

export type { MagicLinkProps, VideoViewedProps };
