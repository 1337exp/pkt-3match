import type { Cluster } from './clusters';

export type ShapeId = string;

export interface ShapeDef {
    id: ShapeId;
    title: string;
    /** Короткая подпись для тесной строки в интерфейсе. */
    short: string;
    /** Схема в исходном положении: 1 клетка фигуры, 0 пусто. */
    pattern: readonly (readonly number[])[];
    /** Считать повёрнутые на 90° и отражённые варианты той же фигурой. */
    rotate: boolean;
    mirror: boolean;
}

/**
 * Фигуры, которые можно собрать. Кластер строится только из линий по 3 и больше (`findClusters`), поэтому в списке
 * только такие: каждая клетка фигуры лежит в линии из трёх. Например «Г» из четырёх клеток (линия и одна ножка) здесь
 * невозможна, а большой угол из пяти возможен.
 *
 * Это единственный список: из него читают и распознавание (`classifyCluster`), и строка фигур в интерфейсе.
 */
export const SHAPES: readonly ShapeDef[] = [
    { id: 'line3', title: 'Тройка', short: '3', pattern: [[1, 1, 1]], rotate: true, mirror: false },
    { id: 'line4', title: 'Четвёрка', short: '4', pattern: [[1, 1, 1, 1]], rotate: true, mirror: false },
    { id: 'line5', title: 'Пятёрка', short: '5', pattern: [[1, 1, 1, 1, 1]], rotate: true, mirror: false },
    { id: 'corner', title: 'Угол', short: 'Г', pattern: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], rotate: true, mirror: true },
    { id: 'tee', title: 'Т', short: 'Т', pattern: [[1, 1, 1], [0, 1, 0], [0, 1, 0]], rotate: true, mirror: false },
    { id: 'cross', title: 'Крест', short: '+', pattern: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], rotate: false, mirror: false },
];

type Matrix = readonly (readonly number[])[];

const rotate90 = (m: Matrix): number[][] =>
    Array.from({ length: m[0]!.length }, (_, c) => Array.from({ length: m.length }, (_, r) => m[m.length - 1 - r]![c]!));

const mirrorH = (m: Matrix): number[][] => m.map((row) => [...row].reverse());

/** Ключ матрицы: строки из нулей и единиц через `/`. */
const keyOf = (m: Matrix): string => m.map((row) => row.join('')).join('/');

/** Все положения фигуры без повторов (у симметричных их меньше четырёх). */
export function shapeVariants(shape: ShapeDef): Matrix[] {
    const variants = new Map<string, Matrix>();
    let current: Matrix = shape.pattern;
    for (let i = 0; i < (shape.rotate ? 4 : 1); i++) {
        variants.set(keyOf(current), current);
        if (shape.mirror) {
            const mirrored = mirrorH(current);
            variants.set(keyOf(mirrored), mirrored);
        }
        current = rotate90(current);
    }
    return [...variants.values()];
}

/** Кластер как матрица 0/1 по его рамке. */
export function clusterMatrix(cluster: Cluster): number[][] {
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (const { col, row } of cluster.cells) {
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
    }
    const matrix = Array.from({ length: maxRow - minRow + 1 }, () => new Array<number>(maxCol - minCol + 1).fill(0));
    for (const { col, row } of cluster.cells) matrix[row - minRow]![col - minCol] = 1;
    return matrix;
}

const lookups = new Map<readonly ShapeDef[], Map<string, ShapeId>>();

function lookupFor(shapes: readonly ShapeDef[]): Map<string, ShapeId> {
    let lookup = lookups.get(shapes);
    if (!lookup) {
        lookup = new Map();
        // При совпадении положений у двух фигур побеждает та, что раньше в списке.
        for (const shape of shapes) {
            for (const variant of shapeVariants(shape)) {
                const key = keyOf(variant);
                if (!lookup.has(key)) lookup.set(key, shape.id);
            }
        }
        lookups.set(shapes, lookup);
    }
    return lookup;
}

/**
 * Какая это фигура. Кластер должен совпасть с фигурой целиком (ни лишних клеток, ни недостающих),
 * иначе null: большой блок или фигура не из списка просто считается комбо.
 * `shapes` это набор активных фигур (в разных режимах и уровнях он может быть разным).
 */
export function classifyCluster(cluster: Cluster, shapes: readonly ShapeDef[] = SHAPES): ShapeId | null {
    return lookupFor(shapes).get(keyOf(clusterMatrix(cluster))) ?? null;
}
