import { parseCsv, csvEscape, downloadCsv } from '../../../src/utils/csv.js';

describe('parseCsv', () => {
  it('parses a simple CSV with header and one row', () => {
    const result = parseCsv('name,email\nAlice,alice@test.com');
    expect(result).toEqual([
      ['name', 'email'],
      ['Alice', 'alice@test.com'],
    ]);
  });

  it('parses multiple rows', () => {
    const result = parseCsv('a,b\n1,2\n3,4');
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual(['1', '2']);
    expect(result[2]).toEqual(['3', '4']);
  });

  it('handles quoted fields with commas', () => {
    const result = parseCsv('name,address\nAlice,"123 Main St, City"');
    expect(result[1][1]).toBe('123 Main St, City');
  });

  it('handles doubled-quote escapes inside quoted fields', () => {
    const result = parseCsv('name,quote\nAlice,"She said ""hello"""');
    expect(result[1][1]).toBe('She said "hello"');
  });

  it('skips blank lines', () => {
    const result = parseCsv('a,b\n\n1,2\n\n3,4');
    expect(result).toHaveLength(3);
  });

  it('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(result).toHaveLength(3);
  });

  it('trims field values', () => {
    const result = parseCsv('a,b\n  hello  ,  world  ');
    expect(result[1]).toEqual(['hello', 'world']);
  });

  it('returns empty array for empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('csvEscape', () => {
  it('returns a plain string unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('wraps strings containing commas in quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('wraps strings containing double quotes and escapes them', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns empty string for null', () => {
    expect(csvEscape(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(csvEscape(undefined)).toBe('');
  });

  it('converts numbers to strings', () => {
    expect(csvEscape(42)).toBe('42');
  });
});

describe('downloadCsv', () => {
  let createObjectURL;
  let revokeObjectURL;
  let appendChildSpy;
  let removeChildSpy;
  let clickSpy;
  let anchorElement;

  beforeEach(() => {
    createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    anchorElement = { href: '', download: '', click: jest.fn() };
    clickSpy = anchorElement.click;
    jest.spyOn(document, 'createElement').mockReturnValue(anchorElement);
    appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a CSV blob and triggers download', () => {
    const rows = [{ email: 'alice@test.com', groupName: 'Team A' }];
    downloadCsv(rows, ['groupName', 'email'], 'test.csv');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorElement.download).toBe('test.csv');
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('builds correct CSV content with header row', () => {
    let capturedContent;
    const OriginalBlob = global.Blob;
    jest.spyOn(global, 'Blob').mockImplementationOnce((parts, opts) => {
      capturedContent = parts[0];
      return new OriginalBlob(parts, opts);
    });

    downloadCsv([{ name: 'Alice', email: 'alice@test.com' }], ['name', 'email'], 'out.csv');

    expect(capturedContent).toContain('name,email');
    expect(capturedContent).toContain('Alice,alice@test.com');
  });

  it('appends and removes the anchor element', () => {
    downloadCsv([{ a: '1' }], ['a'], 'x.csv');
    expect(appendChildSpy).toHaveBeenCalledWith(anchorElement);
    expect(removeChildSpy).toHaveBeenCalledWith(anchorElement);
  });
});
