import { describe, expect, it } from 'vitest';
import { Board } from '../../src/shared/core/board';
import { findClusters } from '../../src/shared/core/clusters';
import { mulberry32 } from '../../src/shared/core/rng';
import { CLEAR_TIME, Sim, STEP, type SimCluster } from '../../src/dynamic/sim';

const run = (sim: Sim, seconds: number) => {
    for (let t = 0; t < seconds; t += STEP) sim.tick(STEP);
};

/** Всё стоит, поле полное. */
const quiet = (sim: Sim) => sim.tiles.length === sim.cols * sim.rows && sim.tiles.every((t) => t.state === 'idle' || t.state === 'held');

/** Гоняет время, пока поле не успокоится. */
const settle = (sim: Sim, limit = 60) => {
    for (let t = 0; t < limit; t += STEP) {
        sim.tick(STEP);
        if (quiet(sim) && findClusters(Board.parse(sim.snapshot())).length === 0 && sim.tiles.every((x) => x.settle <= 0)) return;
    }
    throw new Error('поле не успокоилось');
};

/** Что обязано быть верно в любой момент. Бросает при первом нарушении (быстрее тысяч `expect` на тик). */
const invariants = (sim: Sim) => {
    const fail = (message: string): never => {
        throw new Error(`${message} (t=${sim.time.toFixed(2)})
${sim.snapshot()}`);
    };
    let occupied = 0;
    for (let row = 0; row < sim.rows; row++) {
        for (let col = 0; col < sim.cols; col++) {
            const tile = sim.at(col, row);
            if (!tile) continue;
            occupied++;
            if (tile.col !== col || tile.row !== row) fail('шар не в своей клетке');
        }
    }
    if (occupied !== sim.tiles.length) fail('число занятых клеток не равно числу шаров');
    if (sim.tiles.filter((t) => t.state === 'held').length > 1) fail('больше одного схваченного шара');
    for (let col = 0; col < sim.cols; col++) {
        const column = sim.tiles.filter((t) => t.col === col).sort((a, b) => a.row - b.row);
        for (let i = 1; i < column.length; i++) {
            const gap = column[i]!.row - column[i]!.fall - (column[i - 1]!.row - column[i - 1]!.fall);
            // Шары в столбце не наезжают друг на друга.
            if (gap < 1 - 1e-9) fail(`шары в столбце ${col} наехали друг на друга: зазор ${gap}`);
        }
    }
    for (const t of sim.tiles) {
        if (!Number.isFinite(t.fall) || !Number.isFinite(t.vy)) fail('не число в положении или скорости');
        if (t.fall < 0 || t.fall > 1) fail(`fall вне [0, 1]: ${t.fall}`);
    }
};

const LINE = ['BCDBC', 'CDBCD', 'DBCDB', 'AAABC'].join('\n');

describe('поле само по себе', () => {
    it('стоит, пока его не трогают, и в начале без совпадений', () => {
        const sim = new Sim({ cols: 6, rows: 5, types: 6, seed: 3 });
        const before = sim.snapshot();
        expect(findClusters(Board.parse(before))).toHaveLength(0);
        run(sim, 3);
        expect(sim.snapshot()).toBe(before);
        expect(sim.tiles.every((t) => t.state === 'idle')).toBe(true);
    });

    it('тройка лопается волной, клетки заняты до конца лопания', () => {
        const sim = new Sim({ cols: 5, rows: 4, types: 4, seed: 1, board: Board.parse(LINE) });
        const clusters: SimCluster[] = [];
        sim.events.onCluster = (c) => clusters.push(c);
        sim.tick(STEP);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]!.type).toBe(0);
        expect(clusters[0]!.cells).toHaveLength(3);
        run(sim, 0.2);
        // Ещё лопаются: клетки заняты, сверху никто не падает.
        for (let col = 0; col < 3; col++) expect(sim.at(col, 3)?.state).toBe('clearing');
        expect(sim.at(0, 2)?.state).toBe('idle');
        run(sim, CLEAR_TIME + 0.2);
        expect(sim.at(0, 3)?.state).not.toBe('clearing');
    });

    it('после лопания всё падает, досыпается и успокаивается без лишних совпадений', () => {
        const sim = new Sim({ cols: 5, rows: 4, types: 4, seed: 1, board: Board.parse(LINE) });
        const chains: number[] = [];
        sim.events.onChain = (n) => chains.push(n);
        for (let t = 0; t < 40; t += STEP) {
            sim.tick(STEP);
            invariants(sim);
        }
        expect(quiet(sim)).toBe(true);
        expect(findClusters(Board.parse(sim.snapshot()))).toHaveLength(0);
        expect(chains.length).toBeGreaterThanOrEqual(1);
        expect(chains.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
    });

    it('падающий шар схватить нельзя', () => {
        const sim = new Sim({ cols: 5, rows: 4, types: 4, seed: 1, board: Board.parse(LINE) });
        // Ждём не фиксированное время, а само событие: пока кто-то лопается, а потом пока кто-то падает.
        let clearing: (typeof sim.tiles)[number] | undefined;
        for (let t = 0; t < 2 && !clearing; t += STEP) {
            sim.tick(STEP);
            clearing = sim.tiles.find((x) => x.state === 'clearing');
        }
        expect(clearing).toBeDefined();
        expect(sim.press(clearing!.col, clearing!.row)).toBe(false);

        let falling: (typeof sim.tiles)[number] | undefined;
        for (let t = 0; t < 2 && !falling; t += STEP) {
            sim.tick(STEP);
            falling = sim.tiles.find((x) => x.state === 'falling');
        }
        expect(falling).toBeDefined();
        expect(sim.press(falling!.col, falling!.row)).toBe(false);
    });
});

describe('схваченный шар', () => {
    it('не падает, шары над ним лежат на нём, после отпускания всё падает', () => {
        const board = Board.parse(['A', 'B', 'C', '.'].join('\n'));
        const sim = new Sim({ cols: 1, rows: 4, types: 3, seed: 1, board });
        expect(sim.press(0, 2)).toBe(true);
        run(sim, 1);
        expect(sim.at(0, 2)?.type).toBe(2);
        expect(sim.at(0, 1)?.type).toBe(1);
        expect(sim.at(0, 0)?.type).toBe(0);
        expect(sim.at(0, 3)).toBeNull();
        expect(sim.release()).toBe(0);
        run(sim, 1.5);
        expect(sim.at(0, 3)?.type).toBe(2);
        expect(sim.at(0, 2)?.type).toBe(1);
        expect(sim.at(0, 1)?.type).toBe(0);
    });

    it('в пустую клетку не идёт: ждёт, пока в ней окажется стоящий шар', () => {
        const board = Board.parse(['A..', 'B..', 'C..'].join('\n'));
        const sim = new Sim({ cols: 3, rows: 3, types: 5, seed: 1, board });
        expect(sim.press(0, 2)).toBe(true);
        sim.setTarget(1, 2);
        run(sim, 0.05);
        expect(sim.swaps).toBe(0);
        expect(sim.held!.col).toBe(0);
        run(sim, 3);
        expect(sim.held!.col).toBe(1);
        expect(sim.swaps).toBeGreaterThanOrEqual(1);
    });

    it('быстрый скачок пальца проходит все клетки по пути', () => {
        const sim = new Sim({ cols: 6, rows: 5, types: 6, seed: 4 });
        const row = Array.from({ length: 6 }, (_, c) => sim.at(c, 0)!.id);
        sim.press(0, 0);
        sim.setTarget(3, 0);
        run(sim, 0.1);
        expect(sim.swaps).toBe(3);
        const after = Array.from({ length: 6 }, (_, c) => sim.at(c, 0)!.id);
        expect(after).toEqual([row[1], row[2], row[3], row[0], row[4], row[5]]);
    });

    it('сдвинутые за время удержания шары не лопаются, пока шар не отпустили', () => {
        const board = Board.parse(['BCDBC', 'CDBCD', 'AABAD'].join('\n'));
        const sim = new Sim({ cols: 5, rows: 3, types: 4, seed: 1, board });
        const clusters: SimCluster[] = [];
        sim.events.onCluster = (c) => clusters.push(c);
        expect(findClusters(board)).toHaveLength(0);
        sim.press(2, 2);
        sim.setTarget(3, 2);
        run(sim, 1.5);
        // Тройка A уже стоит в ряду, но шар в руке: она ждёт.
        expect(sim.snapshot().split('\n')[2]).toBe('AAABD');
        expect(clusters).toHaveLength(0);
        expect(sim.release()).toBe(1);
        run(sim, 0.2);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]!.type).toBe(0);
    });

    it('шар в руке сам в совпадениях не участвует: пока держим, тройка не лопается, отпустили, и лопается', () => {
        const board = Board.parse(['CDCDC', 'DCDCD', 'BBBCD'].join('\n'));
        const sim = new Sim({ cols: 5, rows: 3, types: 4, seed: 1, board });
        const clusters: SimCluster[] = [];
        sim.events.onCluster = (c) => clusters.push(c);
        expect(findClusters(board)).toHaveLength(1);
        sim.press(1, 2);
        run(sim, 1);
        expect(clusters).toHaveLength(0);
        sim.release();
        run(sim, 0.2);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]!.type).toBe(1);
    });
});

describe('живая игра', () => {
    /** Случайные касания и протаскивания, на каждом тике проверяем инварианты. Возвращает след для сравнения. */
    const play = (seed: number, seconds: number, check: boolean) => {
        const sim = new Sim({ cols: 6, rows: 5, types: 5, seed });
        const rng = mulberry32(seed * 7919);
        const trail: string[] = [];
        const clusters: number[] = [];
        sim.events.onCluster = (c) => clusters.push(c.cells.length);
        for (let t = 0, n = 0; t < seconds; t += STEP, n++) {
            const roll = rng();
            if (!sim.held && roll < 0.04) sim.press(Math.floor(rng() * 6), Math.floor(rng() * 5));
            else if (sim.held && roll < 0.3) sim.setTarget(Math.floor(rng() * 6), Math.floor(rng() * 5));
            else if (sim.held && roll < 0.33) sim.release();
            sim.tick(STEP);
            if (check) invariants(sim);
            if (n % 30 === 0) trail.push(sim.snapshot() + '|' + sim.tiles.map((x) => x.state[0]).join(''));
        }
        return { trail, clusters };
    };

    it('инварианты держатся при случайных руках и падениях', () => {
        for (let seed = 1; seed <= 6; seed++) {
            const { clusters } = play(seed, 40, true);
            expect(clusters.length).toBeGreaterThan(0);
        }
    });

    it('партия повторяется по зерну и тем же действиям', () => {
        expect(play(5, 25, false).trail).toEqual(play(5, 25, false).trail);
        expect(play(5, 25, false).trail).not.toEqual(play(6, 25, false).trail);
    });

    it('если отпустить всё, поле успокаивается: полное, без совпадений', () => {
        for (let seed = 1; seed <= 6; seed++) {
            const sim = new Sim({ cols: 6, rows: 5, types: 5, seed });
            const rng = mulberry32(seed);
            for (let t = 0; t < 10; t += STEP) {
                if (!sim.held && rng() < 0.05) sim.press(Math.floor(rng() * 6), Math.floor(rng() * 5));
                else if (sim.held && rng() < 0.3) sim.setTarget(Math.floor(rng() * 6), Math.floor(rng() * 5));
                else if (sim.held && rng() < 0.05) sim.release();
                sim.tick(STEP);
            }
            sim.release();
            settle(sim);
            expect(quiet(sim)).toBe(true);
        }
    });
});
