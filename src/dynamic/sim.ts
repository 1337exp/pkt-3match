import { Board, EMPTY, fillBoard, type Cell } from '../shared/core/board';
import { findClusters } from '../shared/core/clusters';
import { pathCells } from '../shared/core/path';
import { mulberry32, randomInt, type Rng } from '@1337exp/pkt-threejs-blueprint/rng';

/** Шаг симуляции. Режим копит время кадров и вызывает `tick(STEP)` столько раз, сколько набралось. */
export const STEP = 1 / 60;

/**
 * Падение. Числа подобраны по замеру «Классики»: там шар по кривой outBack проходит больше половины клетки за первые 0.05 с,
 * и из трёх клеток 2.3 за 0.1 с. Физика с мягким стартом (скорость 2, ускорение 60) давала 0.10 и 0.38 клетки и целое падение
 * на 45% дольше, из-за чего «Живой» казался вялым. Теперь шар отрывается резко и разгоняется:
 * одна клетка за 0.06 с, три за 0.14 с, четыре за 0.18 с (в «Классике» полные 0.15, 0.2 и 0.24).
 */
const GRAVITY = 100;
const MAX_SPEED = 32;
/** Скорость, с которой шар отрывается от места (клеток в секунду). */
const START_SPEED = 14;
/** Сколько шар после приземления не участвует в совпадениях: пружинка и никакого мерцания. */
const SETTLE = 0.06;
/** Сколько лопается шар (клетка занята всё это время). */
export const CLEAR_TIME = 0.34;
/** Задержки волны: между кластерами и между шарами внутри кластера. */
const CLUSTER_STAGGER = 0.16;
const TILE_STAGGER = 0.03;
/** Цепочка считается законченной, если новый кластер не лопнул за столько секунд. */
const CHAIN_GAP = 1.2;
/** Сколько обменов за тик может сделать схваченный шар: быстрый скачок пальца не должен тянуться неделями. */
const MAX_SWAPS_PER_TICK = 4;

export type TileState =
    /** Стоит на месте: может лопнуть, его можно схватить. */
    | 'idle'
    /** В руке игрока: на месте, не падает, не лопается, для шаров над ним это пол. */
    | 'held'
    | 'falling'
    /** Лопается: клетка занята до конца. */
    | 'clearing';

/** Шар в симуляции. Положение логическое: клетка плюс сколько осталось пролететь до её центра. */
export interface SimTile {
    readonly id: number;
    readonly type: number;
    col: number;
    /** Клетка, которую шар занимает. При падении это клетка назначения, прежнюю уже занимать могут. */
    row: number;
    /** Сколько клеток осталось пролететь до центра клетки `row`. Высота шара на экране это `row - fall`. */
    fall: number;
    /** Скорость падения, клеток в секунду. */
    vy: number;
    state: TileState;
    /** Пока больше нуля, шар только что приземлился и в совпадениях не участвует. */
    settle: number;
    /** Шар сдвинули, пока игрок держал другой: не участвует в совпадениях до отпускания. */
    locked: boolean;
    /** Сколько секунд идёт лопание и через сколько оно начинается (волна). */
    clearElapsed: number;
    clearDelay: number;
}

export interface SimCluster {
    type: number;
    cells: Cell[];
}

export interface SimEvents {
    /** Нашёлся кластер: все его шары начали лопаться. */
    onCluster?: (cluster: SimCluster) => void;
    /** Шар долопался и исчез. */
    onClear?: (tile: SimTile) => void;
    onLand?: (tile: SimTile, speed: number) => void;
    /** Схваченный шар поменялся местами с соседом. */
    onSwap?: (from: Cell, to: Cell) => void;
    /** Цепочка закончилась: в ней было `size` кластеров. */
    onChain?: (size: number) => void;
}

export interface SimOptions {
    cols: number;
    rows: number;
    types: number;
    seed: number;
    /** Готовое поле вместо случайного (для тестов): пустые клетки остаются пустыми. */
    board?: Board;
}

/**
 * Живое поле. Ввод не блокируется: шары падают, лопаются и меняются местами одновременно.
 * Правила описаны в `docs/modes.md`. Коротко:
 * - совпадения ищутся только среди стоящих (idle) шаров, падающие, лопающиеся и схваченные считаются пустыми;
 * - схваченный шар меняется местами только со стоящими шарами, для остальных клеток он как перед стеной;
 * - шары, которые сдвинули во время удержания, не лопаются, пока игрок не отпустит шар (иначе быстрый провод пальца по
 *   полю взрывал бы всё на пути).
 * Ни Three, ни Vue тут нет; ход времени задаёт только `tick`, поэтому всё детерминировано по зерну.
 */
export class Sim {
    readonly cols: number;
    readonly rows: number;
    readonly types: number;
    readonly events: SimEvents = {};
    /** Все шары, включая падающие и лопающиеся. */
    tiles: SimTile[] = [];
    time = 0;

    readonly #grid: (SimTile | null)[];
    readonly #rng: Rng;
    readonly #scratch: Board;
    #nextId = 1;
    #held: SimTile | null = null;
    #target: Cell | null = null;
    #swaps = 0;
    #chain = 0;
    #lastClusterTime = -Infinity;

    constructor(options: SimOptions) {
        this.cols = options.cols;
        this.rows = options.rows;
        this.types = options.types;
        this.#rng = mulberry32(options.seed);
        this.#grid = new Array(this.cols * this.rows).fill(null);
        this.#scratch = new Board(this.cols, this.rows);

        const board = options.board ?? new Board(this.cols, this.rows);
        if (!options.board) fillBoard(board, this.#rng, this.types);
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const type = board.get(col, row);
                if (type !== EMPTY) this.#place(this.#create(type, col, row, 0));
            }
        }
    }

    /** Шар в клетке или null. */
    at(col: number, row: number): SimTile | null {
        return this.#grid[row * this.cols + col] ?? null;
    }

    get held(): SimTile | null {
        return this.#held;
    }

    /** Сколько обменов сделано за текущее удержание. */
    get swaps(): number {
        return this.#swaps;
    }

    /** Поле типами, как `Board.toString` (пустые, падающие и любые другие состояния тоже видны буквами). */
    snapshot(): string {
        const lines: string[] = [];
        for (let row = 0; row < this.rows; row++) {
            let line = '';
            for (let col = 0; col < this.cols; col++) {
                const tile = this.at(col, row);
                line += tile ? String.fromCharCode(65 + tile.type) : '.';
            }
            lines.push(line);
        }
        return lines.join('\n');
    }

    //---]> Ввод

    /** Схватить шар. Можно только стоящий. */
    press(col: number, row: number): boolean {
        if (this.#held || col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        const tile = this.at(col, row);
        if (!tile || tile.state !== 'idle') return false;
        tile.state = 'held';
        this.#held = tile;
        this.#target = null;
        this.#swaps = 0;
        return true;
    }

    /** Куда игрок ведёт схваченный шар. Шар идёт туда сам, по шагу в соседнюю стоящую клетку. */
    setTarget(col: number, row: number): void {
        if (!this.#held) return;
        this.#target = { col: Math.max(0, Math.min(this.cols - 1, col)), row: Math.max(0, Math.min(this.rows - 1, row)) };
    }

    /** Отпустить шар. Возвращает, сколько обменов было за удержание. */
    release(): number {
        const held = this.#held;
        if (!held) return 0;
        held.state = 'idle';
        held.settle = SETTLE;
        this.#held = null;
        this.#target = null;
        // Все, кого сдвинули за время удержания, возвращаются в игру: теперь они могут лопнуть.
        for (const tile of this.tiles) tile.locked = false;
        const swaps = this.#swaps;
        this.#swaps = 0;
        return swaps;
    }

    //---]> Время

    tick(dt: number): void {
        this.time += dt;
        this.#pursue();
        this.#gravity(dt);
        this.#spawn();
        this.#clearing(dt);
        for (const tile of this.tiles) if (tile.settle > 0) tile.settle = Math.max(0, tile.settle - dt);
        this.#match();
        this.#chainEnd();
    }

    //---]> Внутреннее

    #create(type: number, col: number, row: number, fall: number): SimTile {
        const tile: SimTile = {
            id: this.#nextId++,
            type,
            col,
            row,
            fall,
            vy: 0,
            state: 'idle',
            settle: 0,
            locked: false,
            clearElapsed: 0,
            clearDelay: 0,
        };
        this.tiles.push(tile);
        return tile;
    }

    #place(tile: SimTile): void {
        this.#grid[tile.row * this.cols + tile.col] = tile;
    }

    #free(col: number, row: number): boolean {
        return row < this.rows && this.#grid[row * this.cols + col] === null;
    }

    /** Схваченный шар шагает к цели. Идёт только в клетки со стоящими шарами: пустые, падающие и лопающиеся для него стена. */
    #pursue(): void {
        const held = this.#held;
        const target = this.#target;
        if (!held || !target) return;
        for (let n = 0; n < MAX_SWAPS_PER_TICK; n++) {
            const from = { col: held.col, row: held.row };
            if (from.col === target.col && from.row === target.row) return;
            const to = pathCells(from, target)[0]!;
            const other = this.at(to.col, to.row);
            if (!other || other.state !== 'idle') return;

            this.#grid[from.row * this.cols + from.col] = other;
            this.#grid[to.row * this.cols + to.col] = held;
            other.col = from.col;
            other.row = from.row;
            held.col = to.col;
            held.row = to.row;
            other.locked = true;
            this.#swaps++;
            this.events.onSwap?.(from, to);
        }
    }

    /**
     * Шары падают. Идём по столбцам снизу вверх: нижний, освободив клетку, даёт верхнему начать падать в том же тике,
     * и столбец движется единой лентой без зазоров.
     */
    #gravity(dt: number): void {
        for (let col = 0; col < this.cols; col++) {
            for (let row = this.rows - 1; row >= 0; row--) {
                const tile = this.#grid[row * this.cols + col];
                if (!tile) continue;
                if (tile.state === 'falling') this.#advance(tile, dt);
                else if (tile.state === 'idle' && this.#free(col, row + 1)) this.#startFall(tile);
            }
        }
    }

    #startFall(tile: SimTile): void {
        this.#grid[tile.row * this.cols + tile.col] = null;
        tile.row++;
        this.#place(tile);
        tile.fall = 1;
        tile.vy = START_SPEED;
        tile.state = 'falling';
        tile.settle = 0;
    }

    #advance(tile: SimTile, dt: number): void {
        let distance = tile.vy * dt + 0.5 * GRAVITY * dt * dt;
        tile.vy = Math.min(MAX_SPEED, tile.vy + GRAVITY * dt);
        while (distance > 0) {
            if (tile.fall > distance) {
                tile.fall -= distance;
                break;
            }
            distance -= tile.fall;
            tile.fall = 0;
            if (!this.#free(tile.col, tile.row + 1)) {
                const speed = tile.vy;
                tile.state = 'idle';
                tile.vy = 0;
                tile.settle = SETTLE;
                this.events.onLand?.(tile, speed);
                return;
            }
            // Клетка ниже свободна: летим дальше без остановки, остаток пути переносим.
            this.#grid[tile.row * this.cols + tile.col] = null;
            tile.row++;
            this.#place(tile);
            tile.fall = 1;
        }
        this.#followBelow(tile);
    }

    /**
     * Шар не может быть ближе к нижнему соседу, чем на клетку. Без этого быстрый верхний шар, перенеся остаток пути в
     * клетку, которую нижний только что освободил и стартовал с нуля, на миг наехал бы на него.
     * Нижний шар уже обработан в этом тике (идём снизу вверх), поэтому его положение окончательное.
     */
    #followBelow(tile: SimTile): void {
        if (tile.row + 1 >= this.rows) return;
        const below = this.#grid[(tile.row + 1) * this.cols + tile.col];
        if (!below || below.fall <= tile.fall) return;
        tile.fall = below.fall;
        tile.vy = Math.min(tile.vy, below.vy);
    }

    /** Пустая верхняя клетка столбца принимает нового шара сверху. */
    #spawn(): void {
        for (let col = 0; col < this.cols; col++) {
            if (this.#grid[col] !== null) continue;
            const tile = this.#create(randomInt(this.#rng, this.types), col, 0, 1);
            tile.state = 'falling';
            tile.vy = START_SPEED;
            this.#place(tile);
        }
    }

    #clearing(dt: number): void {
        const done = new Set<SimTile>();
        for (const tile of this.tiles) {
            if (tile.state !== 'clearing') continue;
            tile.clearElapsed += dt;
            if (tile.clearElapsed < tile.clearDelay + CLEAR_TIME) continue;
            this.#grid[tile.row * this.cols + tile.col] = null;
            done.add(tile);
            this.events.onClear?.(tile);
        }
        if (done.size) this.tiles = this.tiles.filter((tile) => !done.has(tile));
    }

    /** Ищет кластеры среди стоящих и отдохнувших шаров, остальные для поиска пустота. */
    #match(): void {
        const board = this.#scratch;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const tile = this.#grid[row * this.cols + col];
                const matchable = !!tile && tile.state === 'idle' && tile.settle <= 0 && !tile.locked;
                board.set(col, row, matchable ? tile.type : EMPTY);
            }
        }
        const clusters = findClusters(board);
        clusters.forEach((cluster, i) => {
            cluster.cells.forEach(({ col, row }, j) => {
                const tile = this.#grid[row * this.cols + col]!;
                tile.state = 'clearing';
                tile.clearElapsed = 0;
                tile.clearDelay = i * CLUSTER_STAGGER + j * TILE_STAGGER;
            });
            this.#chain++;
            this.#lastClusterTime = this.time;
            this.events.onCluster?.({ type: cluster.type, cells: cluster.cells });
        });
    }

    #chainEnd(): void {
        if (this.#chain === 0 || this.time - this.#lastClusterTime < CHAIN_GAP) return;
        if (this.tiles.some((tile) => tile.state === 'clearing')) return;
        const size = this.#chain;
        this.#chain = 0;
        this.events.onChain?.(size);
    }
}
