import { Group } from 'three';
import { classifyCluster } from '../shared/core/shapes';
import type { GameMode, ModeContext, ModeFactory, Point } from '../shared/mode';
import { HELD_LIFT, HELD_SCALE } from '../shared/render/metrics';
import { MoveTimer } from '../shared/render/moveTimer';
import { GEMS } from '../shared/render/palette';
import { dragCell, heldPosition, pressCell } from '../shared/render/pointer';
import { TileLayer, type TileView } from '../shared/render/tileLayer';
import { TimerBar } from '../shared/render/timerBar';
import { CLEAR_TIME, Sim, STEP, type SimTile } from './sim';

/** Скорость, с которой шар на экране догоняет свою клетку после обмена. */
const SLIDE_RATE = 24;
const HELD_RATE = 28;
const INTRO_RATE = 14;
/** За кадр не больше стольких шагов симуляции: после долгой паузы вкладки не догоняем минуты разом. */
const MAX_STEPS_PER_FRAME = 6;
/** Пружинка приземления: жёсткость, затухание, и во сколько раз скорость удара (клеток в секунду) больше толчка вниз. */
const LAND_STIFFNESS = 400;
const LAND_DAMPING = 28;
const LAND_KICK = 0.2;
const LAND_KICK_MAX = 4;

/** Что экран знает про шар сверх того, что хранит симуляция. */
interface TileState {
    view: TileView;
    /** Номер кадра, в котором шар последний раз был в симуляции: кто отстал, того убираем. */
    stamp: number;
    /** Шар въезжает при старте партии. */
    intro: boolean;
    introDelay: number;
    burst: boolean;
    /** Пружинка приземления: смещение вниз в клетках и его скорость. */
    dip: number;
    dipV: number;
}

/**
 * Живой режим: ввод не блокируется, шары падают и лопаются, пока игрок тащит другой. Правила и состояния шаров в `sim.ts`,
 * здесь только показ и ввод: симуляция идёт фиксированным шагом, а положения шаров на экране читаются из неё каждый кадр.
 */
export class DynamicMode implements GameMode {
    readonly group = new Group();

    #sim: Sim;
    readonly #cols: number;
    readonly #rows: number;
    readonly #layer: TileLayer;
    readonly #states = new Map<number, TileState>();
    readonly #timer: MoveTimer;
    readonly #bar: TimerBar;
    #heldTarget: Point = { x: 0, y: 0 };
    #acc = 0;
    #stamp = 0;
    /** До первой отрисовки: стартовые шары въезжают сверху, а не возникают на месте. */
    #fresh = true;

    constructor(private readonly context: ModeContext) {
        const { cols, rows, types, seed, moveTime } = context.options;
        this.#cols = cols;
        this.#rows = rows;
        this.#layer = new TileLayer(cols, rows, types);
        this.#timer = new MoveTimer(moveTime ?? 0);
        this.#bar = new TimerBar(cols, rows);
        this.group.add(this.#layer.group, this.#bar.mesh);
        this.#sim = this.#createSim(seed);
    }

    /** Симуляция. Нужна для отладки и проверок. */
    get sim(): Sim {
        return this.#sim;
    }

    newGame(seed: number): void {
        this.#timer.stop();
        this.#layer.clear();
        this.#states.clear();
        this.#fresh = true;
        this.#acc = 0;
        this.#sim = this.#createSim(seed);
    }

    cellX(col: number): number {
        return col - (this.#cols - 1) / 2;
    }

    cellY(row: number): number {
        return (this.#rows - 1) / 2 - row;
    }

    //---]> Ввод

    pointerDown(hit: Point, lift: Point): boolean {
        const cell = pressCell(hit, this.#cols, this.#rows);
        if (!cell || !this.#sim.press(cell.col, cell.row)) return false;
        this.#heldTarget = { ...lift };
        return true;
    }

    pointerMove(hit: Point, lift: Point): void {
        if (!this.#sim.held) return;
        this.#heldTarget = heldPosition(lift, this.#cols, this.#rows);
        const cell = dragCell(hit, this.#cols, this.#rows);
        if (cell) this.#sim.setTarget(cell.col, cell.row);
    }

    pointerUp(): void {
        this.#release();
    }

    /** Закончить ход: палец поднят или время вышло. Шар сразу возвращается в игру, цепочки идут сами. */
    #release(): void {
        if (!this.#sim.held) return;
        this.#timer.stop();
        const swaps = this.#sim.release();
        if (swaps) this.context.events.onTurn?.({ swaps });
    }

    //---]> Кадр

    update(time: number, dt: number): void {
        // Время вышло: отпускаем шар за игрока. Палец ещё на экране, но шара в руке уже нет, его движения ни на что не влияют.
        if (this.#timer.tick(dt)) {
            this.context.events.onTimeout?.();
            this.#release();
        }
        this.#bar.update(time, dt, this.#timer.progress, this.#timer.running);

        this.#acc += Math.min(dt, 0.1);
        for (let n = 0; this.#acc >= STEP && n < MAX_STEPS_PER_FRAME; n++) {
            this.#sim.tick(STEP);
            this.#acc -= STEP;
        }
        if (this.#acc >= STEP) this.#acc = 0;

        this.#sync(dt);
        this.#layer.update(time);
    }

    dispose(): void {
        this.#layer.dispose();
        this.#bar.dispose();
    }

    //---]> Внутреннее

    #createSim(seed: number): Sim {
        const { cols, rows, types } = this.context.options;
        const sim = new Sim({ cols, rows, types, seed });
        // Время хода идёт с первого обмена: пока шар просто подержали на месте, оно не тратится.
        sim.events.onSwap = () => this.#timer.start();
        sim.events.onCluster = (cluster) =>
            this.context.events.onCluster?.({ type: cluster.type, size: cluster.cells.length, shape: classifyCluster(cluster) });
        sim.events.onChain = (size) => this.context.events.onChain?.(size);
        // Приземлился: шар на миг продавливается вниз и возвращается, как пружина. Чем быстрее летел, тем сильнее.
        sim.events.onLand = (tile, speed) => {
            const state = this.#states.get(tile.id);
            if (state) state.dipV = Math.min(LAND_KICK_MAX, speed * LAND_KICK);
        };
        return sim;
    }

    #addView(tile: SimTile): TileState {
        const view = this.#layer.add(tile.type, this.cellX(tile.col), this.cellY(tile.row - tile.fall));
        const state: TileState = { view, stamp: 0, intro: this.#fresh, introDelay: 0, burst: false, dip: 0, dipV: 0 };
        if (this.#fresh) {
            view.y += this.#rows + 1;
            view.clip = 1;
            state.introDelay = tile.col * 0.05 + (this.#rows - tile.row) * 0.02;
        }
        this.#states.set(tile.id, state);
        return state;
    }

    /** Переносит положения шаров из симуляции на экран. */
    #sync(dt: number): void {
        const stamp = ++this.#stamp;
        const slide = 1 - Math.exp(-dt * SLIDE_RATE);
        const heldFollow = 1 - Math.exp(-dt * HELD_RATE);
        const intro = 1 - Math.exp(-dt * INTRO_RATE);

        for (const tile of this.#sim.tiles) {
            const state = this.#states.get(tile.id) ?? this.#addView(tile);
            state.stamp = stamp;
            const view = state.view;
            // Пружинка лежит поверх основной позиции: снимаем вчерашнее смещение, двигаем шар, накладываем сегодняшнее.
            view.y += state.dip;
            this.#poseTile(tile, state, dt, { slide, heldFollow, intro });
            if (tile.state === 'held') state.dip = state.dipV = 0;
            else {
                state.dipV += (-LAND_STIFFNESS * state.dip - LAND_DAMPING * state.dipV) * dt;
                state.dip += state.dipV * dt;
            }
            view.y -= state.dip;
        }

        for (const [id, state] of this.#states) {
            if (state.stamp === stamp) continue;
            state.view.alive = false;
            this.#states.delete(id);
        }
        this.#fresh = false;
    }

    /** Одно положение шара на экране из его состояния в симуляции. */
    #poseTile(tile: SimTile, state: TileState, dt: number, rate: { slide: number; heldFollow: number; intro: number }): void {
        const { slide, heldFollow, intro } = rate;
        const view = state.view;
        const targetX = this.cellX(tile.col);
        const visualRow = tile.row - tile.fall;
        const targetY = this.cellY(visualRow);

        view.held = tile.state === 'held' ? 1 : 0;
        view.flash = 0;

        if (tile.state === 'held') {
            view.clip = 0;
            view.x += (this.#heldTarget.x - view.x) * heldFollow;
            view.y += (this.#heldTarget.y - view.y) * heldFollow;
            view.z += (HELD_LIFT - view.z) * heldFollow;
            view.scale += (HELD_SCALE - view.scale) * heldFollow;
            return;
        }

        view.x += (targetX - view.x) * slide;

        if (tile.state === 'falling') {
            // Падающий шар рисуется ровно там, где его держит симуляция: плавность тут задаёт сама физика.
            view.y = targetY;
            view.clip = visualRow < 0 ? 1 : 0;
            view.z += (0 - view.z) * slide;
            view.scale += (1 - view.scale) * slide;
            return;
        }

        if (state.intro) {
            view.x = targetX;
            if (state.introDelay > 0) state.introDelay -= dt;
            else {
                view.y += (targetY - view.y) * intro;
                if (Math.abs(targetY - view.y) < 0.03) {
                    view.y = targetY;
                    state.intro = false;
                    view.clip = 0;
                }
            }
        } else {
            view.clip = 0;
            view.y += (targetY - view.y) * slide;
        }

        if (tile.state === 'clearing') {
            this.#popPose(tile, state);
            return;
        }
        view.z += (0 - view.z) * slide;
        view.scale += (1 - view.scale) * slide;
    }

    /** Лопание: шар раздувается со вспышкой, потом сжимается и рассыпается искрами. */
    #popPose(tile: SimTile, state: TileState): void {
        const view = state.view;
        const k = Math.max(0, Math.min(1, (tile.clearElapsed - tile.clearDelay) / CLEAR_TIME));
        if (k < 0.3) {
            view.scale = 1 + 0.35 * (k / 0.3);
            view.flash = k / 0.3;
            return;
        }
        if (!state.burst) {
            state.burst = true;
            this.context.bursts.emit(this.context.clock(), view.x, view.y, view.z + 0.2, GEMS[tile.type % GEMS.length]!.glow, 12);
        }
        const u = (k - 0.3) / 0.7;
        view.scale = 1.35 * (1 - u) ** 2;
        view.flash = 1 - u;
    }
}

export const createDynamicMode: ModeFactory = (context) => new DynamicMode(context);
