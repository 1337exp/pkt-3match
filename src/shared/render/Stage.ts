import { PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Mesh } from 'three';
import type { GameMode, ModeEvents, ModeFactory, ModeOptions, Point } from '../mode';
import { Animator } from './anim';
import { Bursts } from './bursts';
import { HELD_LIFT, HELD_OVERHANG } from './metrics';
import { makePlate, PLATE_REACH, PLATE_Z } from './plate';
import { TIMER_BAR_REACH } from './timerBar';

const FOV = 32;
/**
 * Запас кадра вокруг поля в клетках. Считается из того, что реально выходит за край поля: рамка, полоска времени и
 * схваченный шар в крайней клетке. Холст не должен быть меньше этого игрового пространства, иначе шар у границы обрежется.
 */
const MARGIN = Math.max(PLATE_REACH, TIMER_BAR_REACH, HELD_OVERHANG) + 0.15;

/**
 * Сцена: рендерер, камера, цикл кадров и мост от указателя к режиму. Что делать с касанием и как двигать шары,
 * решает режим (`GameMode`), сцена одинакова для всех.
 * Камера смотрит на поле прямо, с лёгкой перспективой: шарам нужна глубина, а выбор клетки остаётся простым.
 */
export class Stage {
    readonly animator = new Animator();
    readonly mode: GameMode;
    readonly #renderer: WebGLRenderer;
    readonly #scene = new Scene();
    readonly #camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
    readonly #bursts = new Bursts();
    readonly #plate: Mesh;
    readonly #observer: ResizeObserver;
    readonly #canvas: HTMLCanvasElement;
    readonly #options: ModeOptions;
    #frame = 0;
    #last = 0;
    #fpsFrames = 0;
    #fpsSince = performance.now();
    #fps = 0;
    #start = performance.now();
    #pointerId: number | null = null;
    #ray = new Vector3();
    #origin = new Vector3();

    constructor(canvas: HTMLCanvasElement, options: ModeOptions, createMode: ModeFactory, events: ModeEvents = {}) {
        this.#canvas = canvas;
        this.#options = options;
        this.#renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.#renderer.setClearColor('#070911');

        this.mode = createMode({ options, animator: this.animator, bursts: this.#bursts, clock: () => this.time, events });
        this.#plate = makePlate(options.cols, options.rows);
        this.#scene.add(this.#plate, this.mode.group, this.#bursts.points);

        this.#observer = new ResizeObserver(() => this.resize());
        this.#observer.observe(canvas);
        canvas.addEventListener('pointerdown', this.#onDown);
        canvas.addEventListener('pointermove', this.#onMove);
        canvas.addEventListener('pointerup', this.#onUp);
        canvas.addEventListener('pointercancel', this.#onUp);
        // Захват потерян (например, окно ушло на второй план): ход нужно закончить, а не зависнуть с шаром в руке.
        canvas.addEventListener('lostpointercapture', this.#onUp);
        window.addEventListener('blur', this.#onBlur);
        this.resize();

        this.#last = performance.now();
        this.#frame = requestAnimationFrame(this.#loop);
    }

    /** Для отладки (`?debug`): кадров в секунду, вызовов отрисовки и треугольников в последнем кадре. */
    get stats(): { fps: number; calls: number; triangles: number } {
        const { calls, triangles } = this.#renderer.info.render;
        return { fps: this.#fps, calls, triangles };
    }

    /** Где на экране (в координатах страницы) центр клетки. Нужен скрипту скриншотов и отладке. */
    clientOfCell(col: number, row: number): Point {
        const { cols, rows } = this.#options;
        const p = new Vector3(col - (cols - 1) / 2, (rows - 1) / 2 - row, 0).project(this.#camera);
        const rect = this.#canvas.getBoundingClientRect();
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    }

    /** Секунды с запуска сцены. Один счётчик на шейдеры, искры и твины. */
    get time(): number {
        return (performance.now() - this.#start) / 1000;
    }

    newGame(seed = Math.floor(Math.random() * 1e9)): void {
        this.mode.newGame(seed);
    }

    resize(): void {
        const width = this.#canvas.clientWidth;
        const height = this.#canvas.clientHeight;
        if (!width || !height) return;
        // На телефонах 3x плотность это лишняя нагрузка на пиксельный шейдер без заметной пользы.
        this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.#renderer.setSize(width, height, false);

        const camera = this.#camera;
        camera.aspect = width / height;
        const half = Math.tan((FOV * Math.PI) / 360);
        const needH = this.#options.rows + MARGIN * 2;
        const needW = this.#options.cols + MARGIN * 2;
        // Влезть и по высоте, и по ширине: берём то расстояние, что больше.
        const distance = Math.max(needH / 2 / half, needW / 2 / half / camera.aspect);
        camera.position.set(0, 0, distance);
        // Подложка лежит глубже центров шаров и из-за перспективы казалась бы меньше сетки: растим её, чтобы
        // клетки подложки на экране совпадали с клетками шаров, а рамка оставалась снаружи.
        this.#plate.scale.setScalar((distance - PLATE_Z) / distance);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        this.#bursts.setScale(this.#renderer.domElement.height / (2 * half));
    }

    dispose(): void {
        cancelAnimationFrame(this.#frame);
        this.#observer.disconnect();
        this.#canvas.removeEventListener('pointerdown', this.#onDown);
        this.#canvas.removeEventListener('pointermove', this.#onMove);
        this.#canvas.removeEventListener('pointerup', this.#onUp);
        this.#canvas.removeEventListener('pointercancel', this.#onUp);
        this.#canvas.removeEventListener('lostpointercapture', this.#onUp);
        window.removeEventListener('blur', this.#onBlur);
        this.mode.dispose();
        this.#bursts.dispose();
        this.#renderer.dispose();
    }

    //---]>

    #loop = (now: number): void => {
        this.#frame = requestAnimationFrame(this.#loop);
        // Большой скачок времени (вкладка спала) не должен телепортировать анимации.
        const dt = Math.min((now - this.#last) / 1000, 0.05);
        this.#last = now;
        const time = this.time;
        this.animator.tick(dt);
        this.mode.update(time, dt);
        this.#bursts.setTime(time);
        this.#renderer.render(this.#scene, this.#camera);

        this.#fpsFrames++;
        if (now - this.#fpsSince >= 500) {
            this.#fps = (this.#fpsFrames * 1000) / (now - this.#fpsSince);
            this.#fpsFrames = 0;
            this.#fpsSince = now;
        }
    };

    /** Точка, где луч из пальца пересекает плоскость `z`. */
    #project(event: PointerEvent, z: number): Point {
        const rect = this.#canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.#origin.copy(this.#camera.position);
        this.#ray.set(x, y, 0.5).unproject(this.#camera).sub(this.#origin).normalize();
        const t = (z - this.#origin.z) / this.#ray.z;
        return { x: this.#origin.x + this.#ray.x * t, y: this.#origin.y + this.#ray.y * t };
    }

    #onDown = (event: PointerEvent): void => {
        if (this.#pointerId !== null) return;
        event.preventDefault();
        if (!this.mode.pointerDown(this.#project(event, 0), this.#project(event, HELD_LIFT))) return;
        this.#pointerId = event.pointerId;
        this.#canvas.setPointerCapture(event.pointerId);
    };

    #onMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.#pointerId) return;
        // Быстрый палец даёт события реже кадров: берём все промежуточные, шар пройдёт каждую клетку.
        const events = event.getCoalescedEvents?.() ?? [];
        for (const e of events.length ? events : [event]) {
            this.mode.pointerMove(this.#project(e, 0), this.#project(e, HELD_LIFT));
        }
    };

    #onUp = (event: PointerEvent): void => {
        if (event.pointerId !== this.#pointerId) return;
        this.#pointerId = null;
        void this.mode.pointerUp();
    };

    #onBlur = (): void => {
        if (this.#pointerId === null) return;
        this.#pointerId = null;
        void this.mode.pointerUp();
    };
}
