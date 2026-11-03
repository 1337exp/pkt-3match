import type { Cell } from './board';

/**
 * Клетки на пути от `from` к `to` по 8-связной линии: без `from`, с `to`.
 * Быстрое движение пальца даёт скачок через несколько клеток, а шар должен пройти их все.
 */
export function pathCells(from: Cell, to: Cell): Cell[] {
    const cells: Cell[] = [];
    const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
    for (let i = 1; i <= steps; i++) {
        cells.push({
            col: Math.round(from.col + ((to.col - from.col) * i) / steps),
            row: Math.round(from.row + ((to.row - from.row) * i) / steps),
        });
    }
    return cells;
}
