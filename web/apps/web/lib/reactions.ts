/** Same list as REACTION_EMOJIS in @smartdemo/db: the API rejects anything else. */
export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "👏", "😮", "🤔"] as const;

export interface PlayerReaction {
  id: string;
  emoji: string;
  atSec: number;
  /** Who reacted, for the owner's view (the share link's label). */
  label?: string | null;
  mine?: boolean;
}
