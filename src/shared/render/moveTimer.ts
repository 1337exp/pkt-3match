/**
 * Время на ход. Как в старой игре: отсчёт идёт с первого обмена, повторный `start` пока идёт отсчёт игнорируется,
 * по нулю `tick` один раз сообщает «время вышло». Часов тут нет: время даёт тот, кто вызывает `tick`,
 * поэтому таймер стоит вместе со всей анимацией (вкладка заснула, пауза) и легко проверяется тестом.
 * `total` не больше нуля или бесконечность: без ограничения.
 */
export class MoveTimer {
    #left = 0;
    #running = false;

    constructor(readonly total: number) {}

    get limited(): boolean {
        return this.total > 0 && Number.isFinite(this.total);
    }

    get running(): boolean {
        return this.#running;
    }

    /** Сколько секунд осталось. */
    get left(): number {
        return this.#left;
    }

    /** Доля оставшегося времени: 1 в начале хода, 0 когда вышло. */
    get progress(): number {
        return this.limited ? this.#left / this.total : 1;
    }

    start(): void {
        if (!this.limited || this.#running) return;
        this.#left = this.total;
        this.#running = true;
    }

    stop(): void {
        this.#running = false;
    }

    /** Возвращает true ровно один раз: когда время только что вышло. */
    tick(dt: number): boolean {
        if (!this.#running) return false;
        this.#left -= dt;
        if (this.#left > 0) return false;
        this.#left = 0;
        this.#running = false;
        return true;
    }
}
