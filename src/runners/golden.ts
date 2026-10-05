// Levenshtein similarity used by the goldenDataset runner in ./api.ts.

/** Cap on each string's length, to bound the O(m*n) distance computation. */
const MAX_LEVENSHTEIN_LEN = 20_000;

/** Both strings cut to the cap, so distance and length are measured on the same text. */
function capped(str1: string, str2: string): [string, string] {
  return [
    str1.length > MAX_LEVENSHTEIN_LEN ? str1.slice(0, MAX_LEVENSHTEIN_LEN) : str1,
    str2.length > MAX_LEVENSHTEIN_LEN ? str2.slice(0, MAX_LEVENSHTEIN_LEN) : str2,
  ];
}

/**
 * Levenshtein distance with a two-row dynamic program. The rows are sized by
 * the shorter string, so memory is O(min(m, n)); time is O(m * n).
 */
function levenshteinDistance(str1: string, str2: string): number {
  if (str1 === str2) return 0;
  const [a, b] = str1.length >= str2.length ? [str1, str2] : [str2, str1];
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
 * Similarity as 1 - distance / maxLength, computed on the capped strings so
 * text past the cap neither counts as matching nor as differing.
 */
function calculateSimilarity(str1: string, str2: string): number {
  const [a, b] = capped(str1, str2);
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  
  if (maxLength === 0) {
    return 1.0; // Both strings are empty
  }
  
  return 1 - distance / maxLength;
}

export { calculateSimilarity, levenshteinDistance };
