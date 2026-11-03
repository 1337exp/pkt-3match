import { describe, expect, it } from 'vitest';
import { Board } from '../../src/shared/core/board';
import { findClusters } from '../../src/shared/core/clusters';
import { classifyCluster, SHAPES, shapeVariants } from '../../src/shared/core/shapes';

/** Фигуры первого кластера на поле, заданном строками. */
const shapeOf = (rows: string[]) => {
    const clusters = findClusters(Board.parse(rows.join('\n')));
    expect(clusters).toHaveLength(1);
    return classifyCluster(clusters[0]!);
};

describe('список фигур', () => {
    it('у фигур разные id и ни одно положение не принадлежит двум фигурам', () => {
        expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length);
        const seen = new Map<string, string>();
        for (const shape of SHAPES) {
            for (const variant of shapeVariants(shape)) {
                const key = variant.map((r) => r.join('')).join('/');
                expect(seen.get(key), `${shape.id} пересекается с ${seen.get(key)}`).toBeUndefined();
                seen.set(key, shape.id);
            }
        }
    });

    it('количество положений: симметрия учтена', () => {
        const count = (id: string) => shapeVariants(SHAPES.find((s) => s.id === id)!).length;
        expect(count('line3')).toBe(2);
        expect(count('line5')).toBe(2);
        expect(count('corner')).toBe(4);
        expect(count('tee')).toBe(4);
        expect(count('cross')).toBe(1);
    });

    it('каждая клетка каждой фигуры лежит в линии из трёх, иначе фигуру не собрать', () => {
        for (const shape of SHAPES) {
            for (const variant of shapeVariants(shape)) {
                const board = new Board(variant[0]!.length + 2, variant.length + 2);
                board.cells.fill(1);
                variant.forEach((row, r) => row.forEach((v, c) => v && board.set(c + 1, r + 1, 0)));
                const clusters = findClusters(board).filter((cl) => cl.type === 0);
                expect(clusters, shape.id).toHaveLength(1);
                expect(clusters[0]!.cells.length, shape.id).toBe(variant.flat().filter(Boolean).length);
            }
        }
    });
});

describe('распознавание', () => {
    it('линии по длине и направлению', () => {
        expect(shapeOf(['AAAB', 'CDEF'])).toBe('line3');
        expect(shapeOf(['AB', 'AC', 'AD'])).toBe('line3');
        expect(shapeOf(['AAAAB', 'CDEFG'])).toBe('line4');
        expect(shapeOf(['AB', 'AC', 'AD', 'AE'])).toBe('line4');
        expect(shapeOf(['AAAAA', 'BCDEF'])).toBe('line5');
        expect(shapeOf(['AB', 'AC', 'AD', 'AE', 'AF'])).toBe('line5');
    });

    it('угол в любой ориентации и с отражением', () => {
        expect(shapeOf(['ABC', 'ADE', 'AAA'])).toBe('corner');
        expect(shapeOf(['CBA', 'EDA', 'AAA'])).toBe('corner');
        expect(shapeOf(['AAA', 'ADE', 'ABC'])).toBe('corner');
        expect(shapeOf(['AAA', 'EDA', 'CBA'])).toBe('corner');
    });

    it('Т в разных положениях', () => {
        expect(shapeOf(['AAA', 'DAE', 'FAG'])).toBe('tee');
        expect(shapeOf(['DAE', 'FAG', 'AAA'])).toBe('tee');
        expect(shapeOf(['DFA', 'AAA', 'EGA'])).toBe('tee');
        expect(shapeOf(['AFD', 'AAA', 'AGE'])).toBe('tee');
    });

    it('крест', () => {
        expect(shapeOf(['DAE', 'AAA', 'FAG'])).toBe('cross');
    });

    it('кластер не из списка это null: толстый блок и шестёрка', () => {
        expect(shapeOf(['AAA', 'AAA', 'BCD'])).toBeNull();
        expect(shapeOf(['AAAAAA', 'BCDEFG'])).toBeNull();
    });

    it('набор активных фигур можно сузить', () => {
        const only = SHAPES.filter((s) => s.id === 'cross');
        const cross = findClusters(Board.parse('DAE\nAAA\nFAG'));
        expect(classifyCluster(cross[0]!, only)).toBe('cross');
        const line = findClusters(Board.parse('AAAB\nCDEF'));
        expect(classifyCluster(line[0]!, only)).toBeNull();
    });
});
