// Levenshtein similarity used by the goldenDataset runner in ./api.ts.

/** Cap on each string's length, to bound the O(m*n) distance computation. */
const MAX_LEVENSHTEIN_LEN = 20_000;

/**
 * Calculate Levenshtein distance between two strings using a two-row dynamic
 * program (O(min(m,n)) memory). Inputs longer than MAX_LEVENSHTEIN_LEN are
 * truncated first so a pathological pair can't blow up time or memory.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const a = str1.length > MAX_LEVENSHTEIN_LEN ? str1.slice(0, MAX_LEVENSHTEIN_LEN) : str1;
  const b = str2.length > MAX_LEVENSHTEIN_LEN ? str2.slice(0, MAX_LEVENSHTEIN_LEN) : str2;
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Calculate similarity score as 1 - (distance / maxLength)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  if (maxLength === 0) {
    return 1.0; // Both strings are empty
  }
  
  return 1 - distance / maxLength;
}

export { calculateSimilarity, levenshteinDistance };
