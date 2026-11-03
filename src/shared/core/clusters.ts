import { EMPTY, type Board, type Cell } from './board';

/** Связная группа шаров одного типа, собранная из линий не короче `minRun`. */
export interface Cluster {
    type: number;
    /** В порядке обхода: сверху вниз, слева направо. */
    cells: Cell[];
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Шар лопается, если он в горизонтальной или вертикальной линии из `minRun` и более одинаковых.
 * Пересекающиеся и соприкасающиеся линии одного типа склеиваются в один кластер (Г, Т, крест, толстый блок).
 * Змейка из трёх без прямой линии не считается.
 */
export function findClusters(board: Board, minRun = 3): Cluster[] {
    const { cols, rows } = board;
    const matched = new Uint8Array(cols * rows);

    // Один проход для строк, второй для столбцов: меняются только способ чтения и индекс клетки.
    const markRuns = (outer: number, inner: number, at: (o: number, i: number) => number, index: (o: number, i: number) => number) => {
        for (let o = 0; o < outer; o++) {
            let start = 0;
            for (let i = 1; i <= inner; i++) {
                if (i < inner && at(o, i) === at(o, start)) continue;
                if (at(o, start) !== EMPTY && i - start >= minRun) {
                    for (let k = start; k < i; k++) matched[index(o, k)] = 1;
                }
                start = i;
            }
        }
    };
    markRuns(rows, cols, (r, c) => board.get(c, r), (r, c) => r * cols + c);
    markRuns(cols, rows, (c, r) => board.get(c, r), (c, r) => r * cols + c);

    const clusters: Cluster[] = [];
    const seen = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const first = row * cols + col;
            if (!matched[first] || seen[first]) continue;

            const type = board.get(col, row);
            const cluster: Cluster = { type, cells: [] };
            const stack = [first];
            seen[first] = 1;
            while (stack.length) {
                const cur = stack.pop()!;
                const c = cur % cols;
                const r = (cur - c) / cols;
                cluster.cells.push({ col: c, row: r });
                for (const [dc, dr] of NEIGHBOURS) {
                    const nc = c + dc;
                    const nr = r + dr;
                    if (!board.inside(nc, nr)) continue;
                    const next = nr * cols + nc;
                    if (!matched[next] || seen[next] || board.get(nc, nr) !== type) continue;
                    seen[next] = 1;
                    stack.push(next);
                }
            }
            cluster.cells.sort((a, b) => a.row - b.row || a.col - b.col);
            clusters.push(cluster);
        }
    }
    return clusters;
}
