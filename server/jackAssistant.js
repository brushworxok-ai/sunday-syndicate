export const DEFAULT_JACK_MODEL = 'gemini-3.5-flash-lite';

export function questionNeedsNflNews(value) {
  return /\b(news|headline|injur(?:y|ies|ed)?|hurt|questionable|doubtful|inactive|suspend(?:ed|sion)?|trade(?:d|s)?|roster update)\b/i.test(String(value ?? ''));
}

export function formatNflNews(news) {
  const items = Array.isArray(news?.items) ? news.items : [];
  return {
    provider: 'espn',
    syncedAt: news?.fetchedAt ?? null,
    scope: 'ESPN NFL headline watch; not a complete official injury report',
    articles: items.slice(0, 6).map((item, index) => ({
      id: `espn-${index + 1}`,
      headline: item.headline,
      description: item.description,
      publishedAt: item.published ?? null,
      updatedAt: item.published ?? null,
      url: item.url ?? null,
      teams: [],
      isInjury: /\b(injur(?:y|ies|ed)?|hurt|questionable|doubtful|inactive|out)\b/i.test(`${item.headline ?? ''} ${item.description ?? ''}`),
      source: 'ESPN',
    })),
  };
}

export function jackGenerationTuning(model) {
  const name = String(model ?? '').toLowerCase();
  if (name.startsWith('gemini-3')) return { thinkingConfig: { thinkingLevel: 'low' } };
  if (name.startsWith('gemini-2.5-flash')) return { thinkingConfig: { thinkingBudget: 0 } };
  return {};
}
