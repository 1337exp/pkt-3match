import { describe, expect, it } from 'vitest';
import { MoveTimer } from '../../src/shared/render/moveTimer';

describe('таймер хода', () => {
    it('не идёт, пока не запущен', () => {
        const timer = new MoveTimer(4.5);
        expect(timer.running).toBe(false);
        expect(timer.tick(10)).toBe(false);
        expect(timer.progress).toBe(0);
    });

    it('считает вниз и один раз сообщает, что время вышло', () => {
        const timer = new MoveTimer(4);
        timer.start();
        expect(timer.progress).toBe(1);
        expect(timer.tick(1)).toBe(false);
        expect(timer.left).toBeCloseTo(3);
        expect(timer.progress).toBeCloseTo(0.75);
        expect(timer.tick(2.9)).toBe(false);
        expect(timer.tick(0.2)).toBe(true);
        expect(timer.left).toBe(0);
        expect(timer.running).toBe(false);
        // Дальше молчит: принудительный отпуск не должен случиться дважды.
        expect(timer.tick(1)).toBe(false);
    });

    it('повторный start во время отсчёта не сбрасывает время', () => {
        const timer = new MoveTimer(4);
        timer.start();
        timer.tick(3);
        timer.start();
        expect(timer.left).toBeCloseTo(1);
    });

    it('после stop можно начать заново с полным временем', () => {
        const timer = new MoveTimer(4);
        timer.start();
        timer.tick(3);
        timer.stop();
        expect(timer.tick(10)).toBe(false);
        timer.start();
        expect(timer.left).toBe(4);
    });

    it('без ограничения никогда не запускается', () => {
        for (const total of [0, -1, Infinity]) {
            const timer = new MoveTimer(total);
            timer.start();
            expect(timer.running).toBe(false);
            expect(timer.tick(1000)).toBe(false);
            expect(timer.progress).toBe(1);
        }
    });
});
