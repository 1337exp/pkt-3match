import { describe, expect, it } from 'vitest';
import { Board, EMPTY } from '../../src/shared/core/board';
import { findClusters } from '../../src/shared/core/clusters';
import { mulberry32 } from '../../src/shared/core/rng';
import { applyGravity, resolve } from '../../src/static/resolve';

describe('гравитация и досыпание', () => {
    it('шары падают в самый низ столбца и сохраняют порядок', () => {
        const board = Board.parse(`
            A.B
            ..C
            .D.
            ...
        `);
        const falls = applyGravity(board);
        expect(board.toString()).toBe(['...', '...', '..B', 'ADC'].join('\n'));
        expect(falls.find((f) => f.type === 0)!.to).toEqual({ col: 0, row: 3 });
        expect(falls.find((f) => f.type === 1)!.to).toEqual({ col: 2, row: 2 });
    });

    it('падают только те, у кого под ногами пустота', () => {
        const board = Board.parse(`
            A
            B
            .
        `);
        expect(applyGravity(board)).toHaveLength(2);
        const full = Board.parse('A\nB\nC');
        expect(applyGravity(full)).toHaveLength(0);
    });
});

describe('цепочка хода', () => {
    it('лопает, роняет и дальше лопает то, что собралось при падении', () => {
        // Столбец из трёх B лопается, A сверху падает в нижний ряд и собирает там тройку A.
        const board = Board.parse(`
            CAD
            DBC
            CBD
            ABA
        `);
        const result = resolve(board, mulberry32(5), 4);
        expect(result.steps.length).toBeGreaterThanOrEqual(2);
        expect(result.steps[0]!.clusters.map((c) => c.type)).toEqual([1]);
        expect(result.steps[0]!.falls).toEqual([{ type: 0, from: { col: 1, row: 0 }, to: { col: 1, row: 3 } }]);
        expect(result.steps[1]!.clusters.map((c) => c.type)).toEqual([0]);
        expect(findClusters(board)).toHaveLength(0);
        expect(board.cells.includes(EMPTY)).toBe(false);
    });

    it('новые шары сыплются только когда падение не даёт кластеров', () => {
        const board = Board.parse(`
            CAD
            DBC
            CBD
            ABA
        `);
        const result = resolve(board, mulberry32(5), 4);
        // После первой волны падение собрало вторую, досыпать рано.
        expect(result.steps[0]!.spawns).toHaveLength(0);
        // После второй пустот шесть: по одной в столбцах 0 и 2 и весь столбец 1 из четырёх.
        expect(result.steps[1]!.spawns).toHaveLength(6);
        expect(result.steps[1]!.spawns.every((s) => s.fromRow < 0)).toBe(true);
    });

    it('в конце на поле нет ни пустот, ни кластеров, spawn-ы описывают полное заполнение', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const rng = mulberry32(seed);
            const board = new Board(6, 5);
            for (let i = 0; i < board.cells.length; i++) board.cells[i] = Math.floor(rng() * 4);
            const before = board.clone();
            const result = resolve(board, rng, 4);
            expect(findClusters(board)).toHaveLength(0);
            expect(board.cells.includes(EMPTY)).toBe(false);
            if (!findClusters(before).length) expect(result.steps).toHaveLength(0);
            for (const step of result.steps) {
                for (const spawn of step.spawns) expect(spawn.fromRow).toBeLessThan(0);
            }
        }
    });

    it('шаги достаточны, чтобы воспроизвести итоговое поле', () => {
        // Проигрываем шаги на копии: лопнуть, упасть, досыпать, и получаем то же поле.
        for (let seed = 1; seed <= 100; seed++) {
            const rng = mulberry32(seed);
            const board = new Board(6, 5);
            for (let i = 0; i < board.cells.length; i++) board.cells[i] = Math.floor(rng() * 3);
            const replay = board.clone();
            const result = resolve(board, rng, 3);
            for (const step of result.steps) {
                for (const cluster of step.clusters) for (const c of cluster.cells) replay.set(c.col, c.row, EMPTY);
                const moved = replay.clone();
                for (const f of step.falls) moved.set(f.from.col, f.from.row, EMPTY);
                for (const f of step.falls) moved.set(f.to.col, f.to.row, f.type);
                for (const s of step.spawns) moved.set(s.to.col, s.to.row, s.type);
                replay.cells.set(moved.cells);
            }
            expect(replay.toString()).toBe(board.toString());
        }
    });
});
