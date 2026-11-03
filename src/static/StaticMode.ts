import { Group } from 'three';
import type { Cluster } from '../shared/core/clusters';
import { classifyCluster } from '../shared/core/shapes';
import type { GameMode, ModeContext, ModeFactory, Point } from '../shared/mode';
import { ease, type Ease } from '../shared/render/anim';
import { HELD_LIFT, HELD_SCALE } from '../shared/render/metrics';
import { MoveTimer } from '../shared/render/moveTimer';
import { GEMS } from '../shared/render/palette';
import { dragCell, heldPosition, pressCell } from '../shared/render/pointer';
import { TileLayer, type TileView } from '../shared/render/tileLayer';
import { TimerBar } from '../shared/render/timerBar';
import { Game } from './game';
import type { Resolution, Step } from './resolve';

/**
 * Пошаговый режим, как в старой игре: схватил, протащил, отпустил, и логика сразу считает всю цепочку
 * (`Game.release`), а экран проигрывает её шаги твинами. Пока цепочка играет, ввод заблокирован.
 * Положение шаров на экране догоняет логику, а не наоборот.
 */
export class StaticMode implements GameMode {
    readonly group = new Group();

    #game: Game;
    readonly #cols: number;
    readonly #rows: number;
    #grid: (TileView | null)[];
    readonly #layer: TileLayer;
    #held: TileView | null = null;
    #heldTarget: Point = { x: 0, y: 0 };
    #busy = false;
    #epoch = 0;
    readonly #timer: MoveTimer;
    readonly #bar: TimerBar;

    constructor(private readonly context: ModeContext) {
        const { cols, rows, types, seed, moveTime } = context.options;
        this.#game = new Game({ cols, rows, types, seed });
        this.#cols = cols;
        this.#rows = rows;
        this.#grid = new Array(cols * rows).fill(null);
        this.#layer = new TileLayer(cols, rows, types);
        this.#timer = new MoveTimer(moveTime ?? 0);
        this.#bar = new TimerBar(cols, rows);
        this.group.add(this.#layer.group, this.#bar.mesh);
        this.#populate();
    }

    get busy(): boolean {
        return this.#busy;
    }

    /** Логика партии. Нужна для отладки и проверок. */
    get game(): Game {
        return this.#game;
    }

    /** Типы шаров, как их видит экран, строками как `Board.toString`. Нужен для проверки, что экран и логика не разошлись. */
    snapshot(): string {
        const lines: string[] = [];
        for (let row = 0; row < this.#rows; row++) {
            let line = '';
            for (let col = 0; col < this.#cols; col++) {
                const tile = this.#grid[row * this.#cols + col];
                line += tile ? String.fromCharCode(65 + tile.type) : '.';
            }
            lines.push(line);
        }
        return lines.join('\n');
    }

    /** Новая партия на тех же размерах поля. */
    newGame(seed: number): void {
        const { cols, rows, types } = this.context.options;
        this.#epoch++;
        this.#game = new Game({ cols, rows, types, seed });
        this.#held = null;
        this.#timer.stop();
        this.#setBusy(false);
        this.#layer.clear();
        this.#grid.fill(null);
        this.#populate();
    }

    cellX(col: number): number {
        return col - (this.#cols - 1) / 2;
    }

    cellY(row: number): number {
        return (this.#rows - 1) / 2 - row;
    }

    //---]> Ввод

    pointerDown(hit: Point, lift: Point): boolean {
        if (this.#busy || this.#held) return false;
        const cell = pressCell(hit, this.#cols, this.#rows);
        if (!cell || !this.#game.press(cell.col, cell.row)) return false;
        const tile = this.#grid[cell.row * this.#cols + cell.col];
        if (!tile) return false;
        this.#held = tile;
        tile.held = 1;
        tile.clip = 0;
        tile.token++;
        this.#heldTarget = { ...lift };
        return true;
    }

    pointerMove(hit: Point, lift: Point): void {
        if (!this.#held) return;
        this.#heldTarget = heldPosition(lift, this.#cols, this.#rows);

        const cell = dragCell(hit, this.#cols, this.#rows);
        const current = this.#game.held;
        if (!cell || !current || (current.col === cell.col && current.row === cell.row)) return;

        const swaps = this.#game.drag(cell.col, cell.row);
        for (const { from, to } of swaps) {
            const heldIndex = from.row * this.#cols + from.col;
            const otherIndex = to.row * this.#cols + to.col;
            const moving = this.#grid[heldIndex]!;
            const displaced = this.#grid[otherIndex]!;
            this.#grid[otherIndex] = moving;
            this.#grid[heldIndex] = displaced;
            this.#slide(displaced, this.cellX(from.col), this.cellY(from.row), 0, 1, 0.14);
        }
        // Время хода идёт с первого обмена: пока шар просто подержали на месте, оно не тратится.
        if (swaps.length) this.#timer.start();
    }

    pointerUp(): Promise<void> {
        return this.#release();
    }

    /** Закончить ход: палец поднят или время вышло. Второй вызов подряд ничего не делает, шара в руке уже нет. */
    async #release(): Promise<void> {
        const tile = this.#held;
        if (!tile) return;
        this.#timer.stop();
        this.#held = null;
        tile.held = 0;
        const cell = this.#game.held!;
        const swaps = this.#game.swaps;
        this.#setBusy(true);
        const epoch = this.#epoch;
        await this.#slide(tile, this.cellX(cell.col), this.cellY(cell.row), 0, 1, 0.1);
        if (epoch !== this.#epoch) return;

        const resolution = this.#game.release();
        await this.#play(resolution, epoch);
        if (epoch !== this.#epoch) return;
        this.#setBusy(false);
        if (swaps) this.context.events.onTurn?.({ swaps });
        if (resolution.combos) this.context.events.onChain?.(resolution.combos);
    }

    //---]> Кадр

    update(time: number, dt: number): void {
        // Время вышло: отпускаем шар за игрока. Палец при этом ещё на экране, Stage дальше проглотит его движения,
        // потому что шара в руке уже нет.
        if (this.#timer.tick(dt)) {
            this.context.events.onTimeout?.();
            void this.#release();
        }
        this.#bar.update(time, dt, this.#timer.progress, this.#timer.running);

        const held = this.#held;
        if (held) {
            const follow = 1 - Math.exp(-dt * 28);
            held.x += (this.#heldTarget.x - held.x) * follow;
            held.y += (this.#heldTarget.y - held.y) * follow;
            held.z += (HELD_LIFT - held.z) * follow;
            held.scale += (HELD_SCALE - held.scale) * follow;
        }

        this.#layer.update(time);
    }

    dispose(): void {
        this.#epoch++;
        this.#layer.dispose();
        this.#bar.dispose();
    }

    //---]> Внутреннее

    #setBusy(busy: boolean): void {
        if (this.#busy === busy) return;
        this.#busy = busy;
        this.context.events.onBusy?.(busy);
    }

    #createTile(type: number, col: number, row: number): TileView {
        return this.#layer.add(type, this.cellX(col), this.cellY(row));
    }

    /** Первое появление шаров: падают сверху по столбцам. */
    #populate(): void {
        const { board } = this.#game;
        for (let row = 0; row < this.#rows; row++) {
            for (let col = 0; col < this.#cols; col++) {
                const tile = this.#createTile(board.get(col, row), col, row);
                this.#grid[row * this.#cols + col] = tile;
                tile.y = this.cellY(row - this.#rows - 1);
                tile.clip = 1;
                void this.#slide(tile, this.cellX(col), this.cellY(row), 0, 1, 0.45 + row * 0.03, {
                    delay: col * 0.05 + (this.#rows - row) * 0.02,
                    ease: ease.outBack,
                }).then(() => (tile.clip = 0));
            }
        }
    }

    /** Плавно ведёт шар в точку, перебивая прошлое скольжение. */
    #slide(tile: TileView, x: number, y: number, z: number, scale: number, duration: number, options: { delay?: number; ease?: Ease } = {}): Promise<void> {
        const token = ++tile.token;
        const from = { x: tile.x, y: tile.y, z: tile.z, scale: tile.scale };
        return this.context.animator.tween(
            duration,
            (k) => {
                if (tile.token !== token) return;
                tile.x = from.x + (x - from.x) * k;
                tile.y = from.y + (y - from.y) * k;
                tile.z = from.z + (z - from.z) * k;
                tile.scale = from.scale + (scale - from.scale) * k;
            },
            options,
        );
    }

    async #play(resolution: Resolution, epoch: number): Promise<void> {
        for (const step of resolution.steps) {
            await this.#pop(step.clusters);
            if (epoch !== this.#epoch) return;
            await this.#drop(step);
            if (epoch !== this.#epoch) return;
        }
    }

    /** Кластеры лопаются по очереди, внутри кластера волной. */
    #pop(clusters: Cluster[]): Promise<void> {
        const jobs: Promise<void>[] = [];
        const epoch = this.#epoch;
        clusters.forEach((cluster, i) => {
            // Интерфейс узнаёт о кластере, когда тот начинает лопаться на экране, а не когда логика его нашла.
            void this.context.animator.wait(i * 0.16).then(() => {
                if (epoch !== this.#epoch) return;
                this.context.events.onCluster?.({ type: cluster.type, size: cluster.cells.length, shape: classifyCluster(cluster) });
            });
            cluster.cells.forEach(({ col, row }, j) => {
                const index = row * this.#cols + col;
                const tile = this.#grid[index];
                if (!tile) return;
                this.#grid[index] = null;
                jobs.push(this.#popTile(tile, i * 0.16 + j * 0.03));
            });
        });
        return Promise.all(jobs).then(() => {});
    }

    #popTile(tile: TileView, delay: number): Promise<void> {
        let burst = false;
        return this.context.animator.tween(
            0.34,
            (k) => {
                if (k < 0.3) {
                    tile.scale = 1 + 0.35 * (k / 0.3);
                    tile.flash = k / 0.3;
                    return;
                }
                if (!burst) {
                    burst = true;
                    this.context.bursts.emit(this.context.clock(), tile.x, tile.y, tile.z + 0.2, GEMS[tile.type % GEMS.length]!.glow, 12);
                }
                const u = (k - 0.3) / 0.7;
                tile.scale = 1.35 * (1 - u) ** 2;
                tile.flash = 1 - u;
                if (k >= 1) tile.alive = false;
            },
            { delay, ease: ease.linear },
        );
    }

    /** Оставшиеся шары падают, потом (если логика досыпала) сверху въезжают новые. */
    #drop(step: Step): Promise<void> {
        const moves: { tile: TileView; col: number; row: number; distance: number; entering: boolean }[] = [];

        const lifted = step.falls.map((fall) => {
            const index = fall.from.row * this.#cols + fall.from.col;
            const tile = this.#grid[index]!;
            this.#grid[index] = null;
            return { tile, fall };
        });
        for (const { tile, fall } of lifted) {
            this.#grid[fall.to.row * this.#cols + fall.to.col] = tile;
            moves.push({ tile, col: fall.to.col, row: fall.to.row, distance: fall.to.row - fall.from.row, entering: false });
        }
        for (const spawn of step.spawns) {
            const tile = this.#createTile(spawn.type, spawn.to.col, spawn.fromRow);
            tile.clip = 1;
            this.#grid[spawn.to.row * this.#cols + spawn.to.col] = tile;
            moves.push({ tile, col: spawn.to.col, row: spawn.to.row, distance: spawn.to.row - spawn.fromRow, entering: true });
        }
        if (!moves.length) return Promise.resolve();

        // Одно время на всех: тогда шары в столбце не обгоняют друг друга.
        const duration = 0.24 + 0.05 * Math.max(...moves.map((m) => m.distance));
        return Promise.all(
            moves.map((m) =>
                this.#slide(m.tile, this.cellX(m.col), this.cellY(m.row), 0, 1, duration, { ease: ease.outBack }).then(() => {
                    if (m.entering) m.tile.clip = 0;
                }),
            ),
        ).then(() => {});
    }
}

export const createStaticMode: ModeFactory = (context) => new StaticMode(context);
