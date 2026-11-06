import { describe, expect, it } from 'vitest';
import { Board, EMPTY, fillBoard } from '../../src/shared/core/board';
import { findClusters } from '../../src/shared/core/clusters';
import { mulberry32 } from '@1337exp/pkt-threejs-blueprint/rng';

describe('первое заполнение', () => {
    it('без троек и без пустот', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const board = new Board(6, 5);
            fillBoard(board, mulberry32(seed), 5);
            expect(findClusters(board)).toHaveLength(0);
            expect(board.cells.includes(EMPTY)).toBe(false);
        }
    });

    it('при трёх типах тоже получается', () => {
        const board = new Board(8, 8);
        fillBoard(board, mulberry32(3), 3);
        expect(findClusters(board)).toHaveLength(0);
    });
});
