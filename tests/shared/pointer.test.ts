import { describe, expect, it } from 'vitest';
import { dragCell, heldPosition, pressCell } from '../../src/shared/render/pointer';

// Поле 6x5: центры клеток по x от -2.5 до 2.5, по y от 2 до -2 (верхняя строка y = 2).
describe('касание', () => {
    it('находит клетку и отвергает точку мимо поля', () => {
        expect(pressCell({ x: -2.5, y: 2 }, 6, 5)).toEqual({ col: 0, row: 0 });
        expect(pressCell({ x: 2.5, y: -2 }, 6, 5)).toEqual({ col: 5, row: 4 });
        expect(pressCell({ x: 0.4, y: 0.1 }, 6, 5)).toEqual({ col: 3, row: 2 });
        expect(pressCell({ x: -3.1, y: 0 }, 6, 5)).toBeNull();
        expect(pressCell({ x: 0, y: 2.6 }, 6, 5)).toBeNull();
    });
});

describe('перетаскивание', () => {
    it('палец у центра клетки это эта клетка', () => {
        expect(dragCell({ x: -2.4, y: 1.9 }, 6, 5)).toEqual({ col: 0, row: 0 });
    });

    it('у стыка клеток цель не меняется, чтобы углы не дёргали шар', () => {
        expect(dragCell({ x: -2, y: 1.5 }, 6, 5)).toBeNull();
    });

    it('палец далеко за полем прижимается к краю, а не теряется', () => {
        expect(dragCell({ x: -3000, y: 0 }, 6, 5)).toEqual({ col: 0, row: 2 });
        expect(dragCell({ x: 5000, y: -2000 }, 6, 5)).toEqual({ col: 5, row: 4 });
        expect(dragCell({ x: 5000, y: 9000 }, 6, 5)).toEqual({ col: 5, row: 0 });
    });

    it('нарисованный шар не уходит от края дальше запаса', () => {
        const p = heldPosition({ x: -100, y: 100 }, 6, 5);
        expect(p.x).toBeCloseTo(-2.7);
        expect(p.y).toBeCloseTo(2.2);
        expect(heldPosition({ x: 0.3, y: -0.2 }, 6, 5)).toEqual({ x: 0.3, y: -0.2 });
    });
});
