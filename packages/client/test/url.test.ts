import { describe, expect, it } from 'vitest';

import { parseURLSearch, stringifyURLSearch } from '../src';

describe('parse url', () => {
  it('page and page size should work', () => {
    expect(parseURLSearch(new URLSearchParams('page=1&pageSize=10'))).toMatchInlineSnapshot(`
      {
        "filter": {},
        "pagination": {
          "page": 1,
          "pageSize": 10,
        },
      }
    `);

    expect(parseURLSearch(new URLSearchParams('page=2&pageSize=1000000'))).toMatchInlineSnapshot(`
      {
        "filter": {},
        "pagination": {
          "page": 2,
          "pageSize": 100,
        },
      }
    `);

    expect(parseURLSearch(new URLSearchParams('page=2.2&pageSize=4.6'))).toMatchInlineSnapshot(`
      {
        "filter": {},
        "pagination": {
          "page": 2,
          "pageSize": 5,
        },
      }
    `);

    expect(parseURLSearch(new URLSearchParams('page=-1&pageSize=1000000'))).toMatchInlineSnapshot(`
      {
        "filter": {},
        "pagination": {
          "page": 1,
          "pageSize": 100,
        },
      }
    `);
  });

  it('before and after should work', () => {
    expect(parseURLSearch(new URLSearchParams(`after=2023-06-14`))).toMatchInlineSnapshot(`
      {
        "filter": {
          "after": 2023-06-14T00:00:00.000Z,
        },
        "pagination": {
          "page": 1,
          "pageSize": 100,
        },
      }
    `);

    expect(parseURLSearch(new URLSearchParams(`before=${new Date('2023-06-13').getTime()}`)))
      .toMatchInlineSnapshot(`
        {
          "filter": {
            "before": 2023-06-13T00:00:00.000Z,
          },
          "pagination": {
            "page": 1,
            "pageSize": 100,
          },
        }
      `);
  });

  it('parse search', () => {
    expect(parseURLSearch(new URLSearchParams(`search=你好世界`))).toMatchInlineSnapshot(`
      {
        "filter": {
          "search": [
            "你好世界",
          ],
        },
        "pagination": {
          "page": 1,
          "pageSize": 100,
        },
      }
    `);
  });

  it('should infer duplicate', () => {
    expect(parseURLSearch(new URLSearchParams(`provider=dmhy`))).toMatchInlineSnapshot(`
      {
        "filter": {
          "duplicate": true,
          "provider": "dmhy",
        },
        "pagination": {
          "page": 1,
          "pageSize": 100,
        },
      }
    `);

    expect(parseURLSearch(new URLSearchParams(`provider=dmhy&provider=moe`)))
      .toMatchInlineSnapshot(`
        {
          "filter": {
            "duplicate": true,
            "provider": "dmhy",
          },
          "pagination": {
            "page": 1,
            "pageSize": 100,
          },
        }
      `);
  });

  it('multiple include', () => {
    const wrap = (o: string[]) => new URLSearchParams(o.map((o) => `include=${o}`).join('&'));

    expect(parseURLSearch(wrap(['hello', 'world'])).filter.include).toMatchInlineSnapshot(`
      [
        "hello",
        "world",
      ]
    `);
    expect(parseURLSearch(wrap(['hello', 'world1', 'world2'])).filter.include)
      .toMatchInlineSnapshot(`
      [
        "hello",
        "world1",
        "world2",
      ]
    `);
    expect(parseURLSearch(wrap(['world'])).filter.include).toMatchInlineSnapshot(`
      [
        "world",
      ]
    `);
  });

  it('complex filter options', () => {
    const params = [
      'after=2023-06-10',
      'before=2023-06-13',
      'fansub=abc',
      'fansub=def',
      'publisher=456',
      'page=2',
      'pageSize=100',
      'search=hello',
      'search=world',
      'include=hello',
      'include=world1',
      'include=world3',
      'keywords=简中',
      'exclude=h1',
      'type=动画'
    ];

    expect(parseURLSearch(new URLSearchParams(params.join('&')))).toMatchInlineSnapshot(`
      {
        "filter": {
          "after": 2023-06-10T00:00:00.000Z,
          "before": 2023-06-13T00:00:00.000Z,
          "exclude": [
            "h1",
          ],
          "fansubs": [
            "abc",
            "def",
          ],
          "publishers": [
            "456",
          ],
          "search": [
            "hello",
            "world",
          ],
          "types": [
            "动画",
          ],
        },
        "pagination": {
          "page": 2,
          "pageSize": 100,
        },
      }
    `);
  });
});

describe('duplicate filter', () => {
  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['off', false],
    ['no', false],
    ['true', true],
    ['1', true],
    ['on', true],
    ['yes', true],
    ['FALSE', true],
    ['other', true]
  ])('parses duplicate=%s as %s in URL and body', (value, expected) => {
    const params = new URLSearchParams({ provider: 'dmhy', duplicate: value });
    expect(parseURLSearch(params).filter.duplicate).toBe(expected);
    // HTTP JSON bodies may contain strings even though the SDK accepts booleans.
    const body = JSON.parse(JSON.stringify({ provider: 'dmhy', duplicate: value }));
    expect(parseURLSearch(undefined, body).filter.duplicate).toBe(expected);
  });

  it.each([true, false])('preserves boolean %s through serialization', (duplicate) => {
    const options = { provider: 'dmhy', duplicate };
    expect(parseURLSearch(undefined, options).filter).toEqual(options);
    const params = stringifyURLSearch(options);
    expect(params.get('duplicate')).toBe(String(duplicate));
    expect(parseURLSearch(params).filter).toEqual(options);
  });

  it('omits an unspecified duplicate and keeps the provider default', () => {
    const params = stringifyURLSearch({ provider: 'dmhy' });
    expect(params.has('duplicate')).toBe(false);
    expect(parseURLSearch(params).filter.duplicate).toBe(true);
    expect(parseURLSearch(undefined, { provider: 'dmhy' }).filter.duplicate).toBe(true);
  });

  it.each(['', 'provider=invalid&'])('requires a valid provider: %s', (prefix) => {
    expect(
      parseURLSearch(new URLSearchParams(`${prefix}duplicate=false`)).filter
    ).not.toHaveProperty('duplicate');
  });

  it('preserves URL and body precedence for explicit false', () => {
    expect(
      parseURLSearch(new URLSearchParams('duplicate=false'), {
        provider: 'dmhy',
        duplicate: true
      }).filter.duplicate
    ).toBe(false);
    expect(
      parseURLSearch(new URLSearchParams('provider=dmhy&duplicate=true'), {
        duplicate: false
      }).filter.duplicate
    ).toBe(false);
  });
});

describe('strict filter', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['false', undefined],
    ['0', undefined],
    ['off', undefined],
    ['other', undefined]
  ])('parses strict=%s as %s in URL and body', (value, expected) => {
    const params = new URLSearchParams({ strict: value });
    expect(parseURLSearch(params).filter.strict).toBe(expected);
    // HTTP JSON bodies may contain strings even though the SDK accepts booleans.
    const body = JSON.parse(JSON.stringify({ strict: value }));
    expect(parseURLSearch(undefined, body).filter.strict).toBe(expected);
  });

  it('omits an unset strict from the resolved filter', () => {
    expect(parseURLSearch(new URLSearchParams()).filter).not.toHaveProperty('strict');
    expect(parseURLSearch(undefined, {}).filter).not.toHaveProperty('strict');
  });

  it('accepts boolean strict in JSON bodies', () => {
    expect(parseURLSearch(undefined, { strict: true }).filter.strict).toBe(true);
    expect(parseURLSearch(undefined, { strict: false }).filter).not.toHaveProperty('strict');
  });

  it('gives the URL precedence over the body like duplicate', () => {
    expect(
      parseURLSearch(new URLSearchParams('strict=false'), { strict: true }).filter
    ).not.toHaveProperty('strict');
    expect(
      parseURLSearch(new URLSearchParams('strict=true'), { strict: false }).filter.strict
    ).toBe(true);
  });

  it('serializes only an explicitly enabled strict', () => {
    expect(stringifyURLSearch({ strict: true }).get('strict')).toBe('true');
    expect(stringifyURLSearch({ strict: false }).has('strict')).toBe(false);
    expect(stringifyURLSearch({}).has('strict')).toBe(false);
  });

  it('round trips strict through a URL', () => {
    const params = stringifyURLSearch({ fansub: 'LMC', strict: true });
    expect(parseURLSearch(params).filter).toEqual({ fansubs: ['LMC'], strict: true });

    const lenient = stringifyURLSearch({ fansub: 'LMC' });
    expect(lenient.has('strict')).toBe(false);
    expect(parseURLSearch(lenient).filter).toEqual({ fansubs: ['LMC'] });
  });
});

describe('parse url with body', () => {
  it('should work', () => {
    expect(parseURLSearch(new URLSearchParams(), { page: 2 })).toMatchInlineSnapshot(`
      {
        "filter": {},
        "pagination": {
          "page": 2,
          "pageSize": 100,
        },
      }
    `);
  });
});

describe('stringify url', () => {
  it('should work', () => {
    const params = [
      'after=2023-06-10',
      'before=2023-06-13',
      'fansub=abc',
      'fansub=def',
      'publisher=456',
      'page=2',
      'pageSize=100',
      'search=hello',
      'search=world',
      'include=hello',
      'include=world1',
      'include=world3',
      'keywords=简中',
      'exclude=h1',
      'type=动画'
    ];

    const { pagination, filter } = parseURLSearch(new URLSearchParams(params.join('&')));

    expect(stringifyURLSearch({ ...pagination, ...filter }).toString()).toMatchInlineSnapshot(
      `"after=1686355200000&before=1686614400000&exclude=h1&fansub=abc&fansub=def&page=2&pageSize=100&publisher=456&search=hello&search=world&type=%E5%8A%A8%E7%94%BB"`
    );
  });
});
