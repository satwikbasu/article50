/**
 * Key EU AI Act transparency deadlines, as amended by the Digital Omnibus
 * agreement (high-risk obligations were delayed; Article 50 transparency
 * obligations were not, except machine-readable marking which moved by
 * three months to 2 December 2026).
 *
 * This tool provides technical assistance only and is not legal advice.
 */

export type Art50Category =
  | 'interaction'
  | 'synthetic-content'
  | 'emotion-biometric'
  | 'deepfake-text';

export interface Obligation {
  category: Art50Category;
  article: string;
  title: string;
  summary: string;
  deadline: string; // ISO date on which the obligation applies
  appliesTo: string;
}

export const OBLIGATIONS: Record<Art50Category, Obligation> = {
  interaction: {
    category: 'interaction',
    article: 'Art. 50(1)',
    title: 'AI interaction disclosure',
    summary:
      'Users must be informed that they are interacting with an AI system (e.g. chatbots, voice assistants), unless this is obvious from context.',
    deadline: '2026-08-02',
    appliesTo: 'Providers of AI systems intended to interact directly with natural persons',
  },
  'synthetic-content': {
    category: 'synthetic-content',
    article: 'Art. 50(2)',
    title: 'Machine-readable marking of AI-generated content',
    summary:
      'Outputs of generative AI (text, images, audio, video) must be marked as artificially generated or manipulated in a machine-readable format.',
    deadline: '2026-12-02',
    appliesTo: 'Providers of generative AI systems (incl. via API integration)',
  },
  'emotion-biometric': {
    category: 'emotion-biometric',
    article: 'Art. 50(3)',
    title: 'Emotion recognition / biometric categorisation disclosure',
    summary:
      'Natural persons exposed to emotion recognition or biometric categorisation systems must be informed of their operation.',
    deadline: '2026-08-02',
    appliesTo: 'Deployers of emotion recognition or biometric categorisation systems',
  },
  'deepfake-text': {
    category: 'deepfake-text',
    article: 'Art. 50(4)',
    title: 'Deepfake and AI text disclosure',
    summary:
      'Deepfakes and AI-generated/manipulated text published to inform the public on matters of public interest must be visibly disclosed.',
    deadline: '2026-08-02',
    appliesTo: 'Deployers publishing deepfakes or AI-generated public-interest text',
  },
};

export const PENALTY_NOTE =
  'Non-compliance with transparency obligations: fines up to €15M or 3% of global annual turnover (Art. 99(4)).';

/** Whole days from `now` until `deadline` (ISO date). Negative if past. */
export function daysUntil(deadline: string, now: Date = new Date()): number {
  const target = new Date(`${deadline}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((target - today) / 86_400_000);
}

export function deadlineLabel(deadline: string, now: Date = new Date()): string {
  const days = daysUntil(deadline, now);
  if (days > 1) return `applies in ${days} days (${deadline})`;
  if (days === 1) return `applies TOMORROW (${deadline})`;
  if (days === 0) return `applies TODAY (${deadline})`;
  return `IN FORCE since ${deadline} (${-days} days ago)`;
}
