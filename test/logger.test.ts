import { formatError } from '../src/logger';

describe('formatError', () => {
    it('preserves the full stack trace for Error instances', () => {
        const makeError = (): Error => new SyntaxError('broken route');
        const formatted = formatError(makeError());

        expect(formatted).toContain('SyntaxError: broken route');
        expect(formatted).toContain('makeError');
        expect(formatted.split('\n').length).toBeGreaterThan(1);
    });

    it('formats arbitrary thrown values', () => {
        expect(formatError('broken route')).toBe('broken route');
    });
});
