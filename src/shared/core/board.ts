import { randomInt, type Rng } from '@1337exp/pkt-threejs-blueprint/rng';

/** Пустая клетка (шар лопнул, ждёт падения соседей). */
export const EMPTY = -1;

export interface Cell {
    col: number;
    row: number;
}

/**
 * Поле: row 0 это верх, row растёт вниз, гравитация тянет к большим row.
 * Хранит только типы шаров, больше ничего о них не знает.
 */
export class Board {
    readonly cells: Int8Array;

    constructor(
        readonly cols: number,
        readonly rows: number,
    ) {
        this.cells = new Int8Array(cols * rows).fill(EMPTY);
    }

    inside(col: number, row: number): boolean {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    get(col: number, row: number): number {
        return this.inside(col, row) ? this.cells[row * this.cols + col]! : EMPTY;
    }

    set(col: number, row: number, type: number): void {
        this.cells[row * this.cols + col] = type;
    }

    swap(a: Cell, b: Cell): void {
        const type = this.get(a.col, a.row);
        this.set(a.col, a.row, this.get(b.col, b.row));
        this.set(b.col, b.row, type);
    }

    clone(): Board {
        const copy = new Board(this.cols, this.rows);
        copy.cells.set(this.cells);
        return copy;
    }

    /** Поле строками из букв, для тестов и отладки: пустая клетка это точка. */
    toString(): string {
        const lines: string[] = [];
        for (let row = 0; row < this.rows; row++) {
            let line = '';
            for (let col = 0; col < this.cols; col++) {
                const type = this.get(col, row);
                line += type === EMPTY ? '.' : String.fromCharCode(65 + type);
            }
            lines.push(line);
        }
        return lines.join('\n');
    }

    /** Поле из строк `toString`, обратная операция. */
    static parse(text: string): Board {
        const lines = text.trim().split('\n').map((l) => l.trim());
        const board = new Board(lines[0]!.length, lines.length);
        lines.forEach((line, row) => {
            for (let col = 0; col < line.length; col++) {
                const ch = line[col]!;
                board.set(col, row, ch === '.' ? EMPTY : ch.charCodeAt(0) - 65);
            }
        });
        return board;
    }
}

/** Первое заполнение: случайно, но так, чтобы сразу не было троек. */
export function fillBoard(board: Board, rng: Rng, types: number): void {
    for (let row = 0; row < board.rows; row++) {
        for (let col = 0; col < board.cols; col++) {
            const banned = new Set<number>();
            if (col >= 2 && board.get(col - 1, row) === board.get(col - 2, row)) banned.add(board.get(col - 1, row));
            if (row >= 2 && board.get(col, row - 1) === board.get(col, row - 2)) banned.add(board.get(col, row - 1));
            const allowed = Array.from({ length: types }, (_, t) => t).filter((t) => !banned.has(t));
            board.set(col, row, allowed[randomInt(rng, allowed.length)]!);
        }
    }
}
