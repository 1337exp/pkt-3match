import { describe, expect, it } from 'vitest';
import { pathCells } from '../../src/shared/core/path';

describe('путь шара', () => {
    it('сосед, диагональ, скачок', () => {
        expect(pathCells({ col: 1, row: 1 }, { col: 2, row: 1 })).toEqual([{ col: 2, row: 1 }]);
        expect(pathCells({ col: 1, row: 1 }, { col: 2, row: 2 })).toEqual([{ col: 2, row: 2 }]);
        expect(pathCells({ col: 0, row: 0 }, { col: 3, row: 0 })).toEqual([{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }]);
        expect(pathCells({ col: 2, row: 2 }, { col: 2, row: 2 })).toEqual([]);
    });

    it('каждый шаг соседний, хоть какой длины скачок', () => {
        for (let dc = -5; dc <= 5; dc++) {
            for (let dr = -5; dr <= 5; dr++) {
                let prev = { col: 5, row: 5 };
                for (const cell of pathCells(prev, { col: 5 + dc, row: 5 + dr })) {
                    expect(Math.max(Math.abs(cell.col - prev.col), Math.abs(cell.row - prev.row))).toBe(1);
                    prev = cell;
                }
                expect(prev).toEqual({ col: 5 + dc, row: 5 + dr });
            }
        }
    });
});
