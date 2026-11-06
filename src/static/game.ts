import { Board, fillBoard, type Cell } from '../shared/core/board';
import { pathCells } from '../shared/core/path';
import { mulberry32, type Rng } from '@1337exp/pkt-threejs-blueprint/rng';
import { resolve, type Resolution } from './resolve';

export interface GameOptions {
    cols: number;
    rows: number;
    /** Сколько разных типов шаров. */
    types: number;
    seed: number;
}

/** Захваченный шар прошёл из клетки `from` в `to`, а тот, кто там стоял, уехал в `from`. */
export interface Swap {
    from: Cell;
    to: Cell;
}

/**
 * Партия: поле, захваченный шар и правила хода. Хватаем шар, тащим по полю (он меняется местами
 * со всеми на пути), отпускаем, и ход доигрывается цепочкой лопаний. Ни Vue, ни Three тут нет.
 */
export class Game {
    readonly board: Board;
    readonly types: number;
    #rng: Rng;
    #held: Cell | null = null;
    #swaps = 0;

    constructor(options: GameOptions) {
        this.types = options.types;
        this.#rng = mulberry32(options.seed);
        this.board = new Board(options.cols, options.rows);
        fillBoard(this.board, this.#rng, options.types);
    }

    /** Где сейчас захваченный шар, null если ничего не держим. */
    get held(): Cell | null {
        return this.#held;
    }

    /** Сколько обменов сделано за этот ход. */
    get swaps(): number {
        return this.#swaps;
    }

    press(col: number, row: number): boolean {
        if (this.#held || !this.board.inside(col, row)) return false;
        this.#held = { col, row };
        this.#swaps = 0;
        return true;
    }

    /** Палец ушёл в клетку: шар проходит туда через все промежуточные. */
    drag(col: number, row: number): Swap[] {
        const swaps: Swap[] = [];
        if (!this.#held || !this.board.inside(col, row)) return swaps;
        for (const to of pathCells(this.#held, { col, row })) {
            const from = this.#held;
            this.board.swap(from, to);
            swaps.push({ from, to });
            this.#held = to;
            this.#swaps++;
        }
        return swaps;
    }

    /** Отпустили шар: доигрываем ход. Если шар не двигали, ничего не происходит. */
    release(): Resolution {
        this.#held = null;
        if (!this.#swaps) return { steps: [], combos: 0 };
        this.#swaps = 0;
        return resolve(this.board, this.#rng, this.types);
    }
}
