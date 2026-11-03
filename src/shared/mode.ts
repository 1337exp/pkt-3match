import type { Group } from 'three';
import type { ShapeId } from './core/shapes';
import type { Animator } from './render/anim';
import type { Bursts } from './render/bursts';

export interface Point {
    x: number;
    y: number;
}

/** Размеры поля и параметры партии, общие для всех режимов. */
export interface ModeOptions {
    cols: number;
    rows: number;
    /** Сколько разных типов шаров. */
    types: number;
    seed: number;
    /** Секунд на ход (с первого обмена). 0 или не задано: без ограничения. */
    moveTime?: number;
}

/** Игрок отпустил шар после хотя бы одного обмена. */
export interface TurnResult {
    /** Сколько обменов сделал игрок. */
    swaps: number;
}

/** Лопнул кластер. Приходит в момент, когда он начинает лопаться на экране. */
export interface ClusterInfo {
    /** Тип шаров. */
    type: number;
    size: number;
    /** Какая это фигура из `SHAPES`, или null, если кластер не совпал ни с одной. */
    shape: ShapeId | null;
}

export interface ModeEvents {
    /** Игрок закончил ход (отпустил шар). Цепочка лопаний при этом может ещё идти. */
    onTurn?: (result: TurnResult) => void;
    /** Кластер начал лопаться. Из этих событий складывается счёт комбо. */
    onCluster?: (cluster: ClusterInfo) => void;
    /** Цепочка лопаний закончилась: в ней было `size` кластеров. */
    onChain?: (size: number) => void;
    onBusy?: (busy: boolean) => void;
    /** Время хода вышло, шар отпущен принудительно. Приходит перед `onTurn` этого хода. */
    onTimeout?: () => void;
}

/** Всё, что режим получает от сцены. */
export interface ModeContext {
    options: ModeOptions;
    animator: Animator;
    bursts: Bursts;
    /** Секунды с запуска сцены: один счётчик на шейдеры, искры и твины. */
    clock: () => number;
    events: ModeEvents;
}

/**
 * Режим игры: правила и их показ на поле. Сцена (`Stage`) знает только это: камеру, цикл кадров и мост от
 * указателя она даёт одинаково всем, а что делать с касанием и как двигать шары решает режим.
 */
export interface GameMode {
    /** Всё, что режим добавляет в сцену. */
    readonly group: Group;
    update(time: number, dt: number): void;
    /** `hit` это точка луча на плоскости поля, `lift` на плоскости приподнятого шара. Вернуть true, если шар схвачен. */
    pointerDown(hit: Point, lift: Point): boolean;
    pointerMove(hit: Point, lift: Point): void;
    pointerUp(): Promise<void> | void;
    newGame(seed: number): void;
    dispose(): void;
}

export type ModeFactory = (context: ModeContext) => GameMode;
