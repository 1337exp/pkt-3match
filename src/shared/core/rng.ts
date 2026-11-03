/** Генератор случайных чисел [0, 1). Любой, например seeded. */
export type Rng = () => number;

/** Маленький детерминированный генератор, чтобы партию можно было повторить по зерну. */
export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomInt(rng: Rng, count: number): number {
    return Math.floor(rng() * count);
}
