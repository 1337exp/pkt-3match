export type Ease = (t: number) => number;

export const ease = {
    linear: (t: number) => t,
    outCubic: (t: number) => 1 - (1 - t) ** 3,
    inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    /** Мягкий перелёт и возврат: шар приземляется и чуть пружинит. */
    outBack: (t: number) => {
        const c1 = 1.2;
        const c3 = c1 + 1;
        return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    },
};

interface Job {
    time: number;
    delay: number;
    duration: number;
    ease: Ease;
    update: (k: number) => void;
    done: () => void;
}

export interface TweenOptions {
    delay?: number;
    ease?: Ease;
}

/**
 * Крошечный твин-движок: всё, что в игре движется, это `tween`, который можно `await`.
 * Тикается вручную из кадра, поэтому время игры идёт ровно столько, сколько мы разрешили.
 */
export class Animator {
    #jobs: Job[] = [];

    /** `update(k)` получает прогресс после сглаживания, на последнем вызове ровно 1. */
    tween(duration: number, update: (k: number) => void, options: TweenOptions = {}): Promise<void> {
        return new Promise((done) => {
            this.#jobs.push({
                time: 0,
                delay: options.delay ?? 0,
                duration: Math.max(duration, 1e-6),
                ease: options.ease ?? ease.outCubic,
                update,
                done,
            });
        });
    }

    wait(seconds: number): Promise<void> {
        return this.tween(seconds, () => {});
    }

    get busy(): boolean {
        return this.#jobs.length > 0;
    }

    tick(dt: number): void {
        const finished: Job[] = [];
        for (const job of this.#jobs) {
            job.time += dt;
            const local = job.time - job.delay;
            if (local < 0) continue;
            const k = Math.min(local / job.duration, 1);
            job.update(k >= 1 ? 1 : job.ease(k));
            if (k >= 1) finished.push(job);
        }
        if (!finished.length) return;
        this.#jobs = this.#jobs.filter((job) => !finished.includes(job));
        for (const job of finished) job.done();
    }
}
