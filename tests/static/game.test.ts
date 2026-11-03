import { describe, expect, it } from 'vitest';
import { Board, EMPTY } from '../../src/shared/core/board';
import { findClusters } from '../../src/shared/core/clusters';
import { mulberry32 } from '../../src/shared/core/rng';
import { Game } from '../../src/static/game';

describe('ход игрока', () => {
    const make = () => new Game({ cols: 6, rows: 5, types: 5, seed: 7 });

    it('шар меняется местами со всеми на пути', () => {
        const game = make();
        const row = Array.from({ length: 6 }, (_, c) => game.board.get(c, 0));
        game.press(0, 0);
        const swaps = game.drag(3, 0);
        expect(swaps).toHaveLength(3);
        expect(game.held).toEqual({ col: 3, row: 0 });
        // Первый шар уехал на место третьего, остальные сдвинулись на одну клетку влево.
        const after = Array.from({ length: 6 }, (_, c) => game.board.get(c, 0));
        expect(after).toEqual([row[1], row[2], row[3], row[0], row[4], row[5]]);
    });

    it('без захвата тащить нельзя, захватить дважды нельзя', () => {
        const game = make();
        expect(game.drag(2, 2)).toEqual([]);
        expect(game.press(1, 1)).toBe(true);
        expect(game.press(2, 2)).toBe(false);
        expect(game.press(99, 0)).toBe(false);
    });

    it('отпустили не двигая: ходу не быть', () => {
        const game = make();
        game.press(2, 2);
        expect(game.release()).toEqual({ steps: [], combos: 0 });
        expect(game.held).toBeNull();
    });

    it('во время перетаскивания ничего не лопается, лопается после отпускания', () => {
        const game = new Game({ cols: 5, rows: 3, types: 4, seed: 1 });
        game.board.cells.set(Board.parse(['BCBCB', 'AABAD', 'DCDCD'].join('\n')).cells);
        expect(findClusters(game.board)).toHaveLength(0);

        game.press(3, 1);
        game.drag(2, 1);
        // Тройка A уже стоит в ряду, но пока палец на экране она живёт на поле.
        expect(findClusters(game.board)).toHaveLength(1);

        const result = game.release();
        expect(result.combos).toBeGreaterThanOrEqual(1);
        expect(result.steps[0]!.clusters[0]!.type).toBe(0);
        expect(findClusters(game.board)).toHaveLength(0);
        expect(game.board.cells.includes(EMPTY)).toBe(false);
    });

    it('партия повторяется по зерну', () => {
        const play = (seed: number) => {
            const game = new Game({ cols: 6, rows: 5, types: 5, seed });
            game.press(0, 4);
            game.drag(5, 0);
            game.release();
            return game.board.toString();
        };
        expect(play(42)).toBe(play(42));
        expect(play(42)).not.toBe(play(43));
    });

    it('после хода поле всегда чистое', () => {
        const rng = mulberry32(99);
        const game = new Game({ cols: 6, rows: 5, types: 4, seed: 5 });
        for (let move = 0; move < 300; move++) {
            game.press(Math.floor(rng() * 6), Math.floor(rng() * 5));
            for (let k = 0; k < 4; k++) game.drag(Math.floor(rng() * 6), Math.floor(rng() * 5));
            game.release();
            expect(findClusters(game.board)).toHaveLength(0);
            expect(game.board.cells.includes(EMPTY)).toBe(false);
        }
    });
});
