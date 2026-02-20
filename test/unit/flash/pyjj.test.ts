import { findPyjjMatchesInContent } from '../../../src/flash/pyjj';

describe('pyjj matcher', () => {
  it('matches pyjj pairs against Chinese text', () => {
    const cache = new Map<string, string[]>();
    const matches = findPyjjMatchesInContent('vygo', '中国世界', 0, cache);

    expect(matches.length).toBe(1);
    expect(matches[0].linkText).toBe('中国');
  });

  it('supports single-letter trailing token', () => {
    const cache = new Map<string, string[]>();
    const matches = findPyjjMatchesInContent('n', '你好', 0, cache);

    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].linkText).toBe('你');
  });

  it('returns empty when query contains non-letters', () => {
    const cache = new Map<string, string[]>();
    const matches = findPyjjMatchesInContent('n.', '你好', 0, cache);

    expect(matches).toEqual([]);
  });
});
