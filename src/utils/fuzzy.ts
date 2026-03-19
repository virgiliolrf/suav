/**
 * Fuzzy matching para servicos e profissionais da SUAV
 * Normaliza texto BR, remove acentos, compara por tokens e Levenshtein
 */

/**
 * Remove acentos e normaliza texto para comparacao
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Distancia de Levenshtein entre duas strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Score de similaridade entre duas strings (0 a 1, onde 1 = identico)
 */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;

  // Substring match bonus
  if (nb.includes(na) || na.includes(nb)) return 0.9;

  // Token overlap
  const tokensA = na.split(' ');
  const tokensB = nb.split(' ');
  const commonTokens = tokensA.filter(t => tokensB.some(tb => tb.includes(t) || t.includes(tb)));
  const tokenScore = commonTokens.length / Math.max(tokensA.length, tokensB.length);

  if (tokenScore >= 0.5) return 0.7 + tokenScore * 0.2;

  // Levenshtein
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const levScore = 1 - levenshtein(na, nb) / maxLen;

  return Math.max(tokenScore * 0.5, levScore);
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/**
 * Busca fuzzy em uma lista de itens
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  threshold: number = 0.3
): FuzzyMatch<T>[] {
  const normalizedQuery = normalize(query);

  return items
    .map(item => ({
      item,
      score: similarity(normalizedQuery, getText(item)),
    }))
    .filter(m => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
