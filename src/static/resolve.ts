import { EMPTY, type Board, type Cell } from '../shared/core/board';
import { findClusters, type Cluster } from '../shared/core/clusters';
import { randomInt, type Rng } from '@1337exp/pkt-threejs-blueprint/rng';

/** Шар упал из клетки `from` в клетку `to` в том же столбце. */
export interface Fall {
    type: number;
    from: Cell;
    to: Cell;
}

/** Новый шар. Появляется над полем в `fromRow` (меньше нуля) и падает в `to`. */
export interface Spawn {
    type: number;
    to: Cell;
    fromRow: number;
}

/**
 * Один шаг цепочки: лопнули кластеры, оставшиеся шары упали.
 * Новые шары (`spawns`) сыплются, только когда падение больше не даёт кластеров, как в старой игре:
 * случайный новичок не примешивается в цепочку, которую игрок собрал сам.
 */
export interface Step {
    clusters: Cluster[];
    falls: Fall[];
    spawns: Spawn[];
}

export interface Resolution {
    steps: Step[];
    /** Сколько кластеров лопнуло за всю цепочку. */
    combos: number;
}

/** Шары падают вниз, пока под ними пустота. Возвращает, кто куда упал. */
export function applyGravity(board: Board): Fall[] {
    const falls: Fall[] = [];
    for (let col = 0; col < board.cols; col++) {
        let free = board.rows - 1;
        for (let row = board.rows - 1; row >= 0; row--) {
            const type = board.get(col, row);
            if (type === EMPTY) continue;
            if (row !== free) {
                board.set(col, free, type);
                board.set(col, row, EMPTY);
                falls.push({ type, from: { col, row }, to: { col, row: free } });
            }
            free--;
        }
    }
    return falls;
}

/** Заполняет пустые клетки сверху. */
export function refill(board: Board, rng: Rng, types: number): Spawn[] {
    const spawns: Spawn[] = [];
    for (let col = 0; col < board.cols; col++) {
        let empty = 0;
        while (empty < board.rows && board.get(col, empty) === EMPTY) empty++;
        for (let row = 0; row < empty; row++) {
            const type = randomInt(rng, types);
            board.set(col, row, type);
            spawns.push({ type, to: { col, row }, fromRow: row - empty });
        }
    }
    return spawns;
}

/**
 * Доигрывает ход до конца: пока на поле есть кластеры, лопает, роняет, досыпает.
 * Меняет `board` до итогового состояния и возвращает шаги для анимации.
 */
export function resolve(board: Board, rng: Rng, types: number): Resolution {
    const steps: Step[] = [];
    let combos = 0;
    for (let clusters = findClusters(board); clusters.length; clusters = findClusters(board)) {
        for (const cluster of clusters) {
            for (const { col, row } of cluster.cells) board.set(col, row, EMPTY);
        }
        combos += clusters.length;
        const falls = applyGravity(board);
        const spawns = findClusters(board).length ? [] : refill(board, rng, types);
        steps.push({ clusters, falls, spawns });
    }
    return { steps, combos };
}
