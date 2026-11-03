import { describe, expect, it } from 'vitest';
import { Board } from '../../src/shared/core/board';
import { findClusters } from '../../src/shared/core/clusters';

describe('кластеры', () => {
    it('находит горизонтальную и вертикальную тройки', () => {
        const board = Board.parse(`
            AAAB
            BCDB
            CDAB
        `);
        const clusters = findClusters(board);
        expect(clusters).toHaveLength(2);
        expect(clusters.find((c) => c.type === 0)!.cells).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }]);
        expect(clusters.find((c) => c.type === 1)!.cells).toHaveLength(3);
    });

    it('двойка и змейка из трёх не считаются', () => {
        const board = Board.parse(`
            AABC
            BAAC
            CBCB
        `);
        expect(findClusters(board)).toHaveLength(0);
    });

    it('пересекающиеся линии склеиваются в один кластер (Т и крест)', () => {
        const board = Board.parse(`
            BABB
            AAAC
            BABC
        `);
        const clusters = findClusters(board);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]!.cells).toHaveLength(5);
    });

    it('соприкасающиеся линии одного типа склеиваются, разных типов нет', () => {
        const board = Board.parse(`
            AAAB
            AAAB
            CCCB
        `);
        const clusters = findClusters(board);
        expect(clusters.map((c) => [c.type, c.cells.length]).sort()).toEqual([[0, 6], [1, 3], [2, 3]]);
    });

    it('пустые клетки линию не образуют', () => {
        const board = Board.parse(`
            ...A
            ...A
            ...B
        `);
        expect(findClusters(board)).toHaveLength(0);
    });

    it('линия до края поля', () => {
        const board = Board.parse(`
            BCAAA
            CBBCB
        `);
        expect(findClusters(board).map((c) => c.cells.length)).toEqual([3]);
    });
});
