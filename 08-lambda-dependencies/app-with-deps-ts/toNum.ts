export function toNum(sth: unknown) {
    if (typeof sth !== 'string') return null;

    const number = Number.parseInt(sth, 10);

    return Number.isNaN(number) ? null : { number };
}
