import { describe, expect, it } from 'vitest';
import { BuildCsv, ControlNumbersCsv, CsvCell, PinsCsv } from '../one-time-secrets';

describe('CsvCell', () => {
    it('leaves plain text alone', () => {
        expect(CsvCell('Ada Lovelace')).toBe('Ada Lovelace');
        expect(CsvCell(null)).toBe('');
    });
    it('quotes cells with commas, quotes and line breaks, doubling quotes', () => {
        expect(CsvCell('Lovelace, Ada')).toBe('"Lovelace, Ada"');
        expect(CsvCell('say "hi"')).toBe('"say ""hi"""');
        expect(CsvCell('a\nb')).toBe('"a\nb"');
    });
    it('neutralizes spreadsheet formulas', () => {
        expect(CsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
        expect(CsvCell('+1')).toBe("'+1");
        expect(CsvCell('-1')).toBe("'-1");
        expect(CsvCell('@cmd')).toBe("'@cmd");
    });
});

describe('CSV builders', () => {
    it('writes a header row then CRLF-separated data rows', () => {
        expect(BuildCsv(['A', 'B'], [['1', '2']])).toBe('A,B\r\n1,2\r\n');
    });
    it('builds the control number file', () => {
        expect(ControlNumbersCsv([{ Voter: 'Ada', SourceKey: '', Secret: 'ABCD-1234' }])).toBe('Voter,Control number\r\nAda,ABCD-1234\r\n');
    });
    it('builds the PIN file with the roster key', () => {
        expect(PinsCsv([{ Voter: 'Ada', SourceKey: 'k1', Secret: '12345678' }])).toBe('Voter,Roster key,PIN\r\nAda,k1,12345678\r\n');
    });
});
