import type { Cell } from '../core/board';
import type { Point } from '../mode';
import { CELL_ZONE, HOLD_INSET } from './metrics';

/** Точка поля в клетках: центры клеток в целых числах, `row` растёт вниз (как в `Board`). */
function inCells(point: Point, cols: number, rows: number): { fx: number; fy: number } {
    return { fx: point.x + (cols - 1) / 2, fy: (rows - 1) / 2 - point.y };
}

/** Клетка под пальцем в момент касания, `null` если мимо поля. */
export function pressCell(hit: Point, cols: number, rows: number): Cell | null {
    const { fx, fy } = inCells(hit, cols, rows);
    if (fx < -0.5 || fx > cols - 0.5 || fy < -0.5 || fy > rows - 0.5) return null;
    return { col: Math.round(fx), row: Math.round(fy) };
}

/**
 * Клетка, куда палец ведёт схваченный шар. Палец за краем поля (или вовсе за окном) прижимается к центру ближайшей клетки:
 * шар уходит к краю вслед за ним. Возвращает `null`, когда палец далеко от центра клетки (у стыка клеток):
 * углы не должны дёргать шар по диагонали, цель остаётся прежней.
 */
export function dragCell(hit: Point, cols: number, rows: number): Cell | null {
    const raw = inCells(hit, cols, rows);
    const fx = Math.max(0, Math.min(cols - 1, raw.fx));
    const fy = Math.max(0, Math.min(rows - 1, raw.fy));
    const col = Math.round(fx);
    const row = Math.round(fy);
    return Math.hypot(fx - col, fy - row) > CELL_ZONE ? null : { col, row };
}

/** Где схваченный шар рисуется на экране: за пальцем, но не дальше от края поля, чем `HOLD_INSET`. */
export function heldPosition(lift: Point, cols: number, rows: number): Point {
    const limitX = cols / 2 - HOLD_INSET;
    const limitY = rows / 2 - HOLD_INSET;
    return { x: Math.max(-limitX, Math.min(limitX, lift.x)), y: Math.max(-limitY, Math.min(limitY, lift.y)) };
}
