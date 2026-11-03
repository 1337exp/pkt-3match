import { Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';

const HEIGHT = 0.14;
/** Зазор между рамкой поля и полоской. */
const GAP = 0.2;
const FRAME = 0.14;
/** Насколько полоска выступает над краем поля, нужно камере, чтобы оставить запас кадра. */
export const TIMER_BAR_REACH = FRAME + GAP + HEIGHT;

const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    uniform float uProgress; // сколько времени осталось, 1..0
    uniform float uVisible;  // 0 скрыта, 1 видна
    uniform float uTime;
    uniform vec2 uSize;
    varying vec2 vUv;

    // Цвета записаны как в макете (sRGB), на выходе шейдер переводит линейный цвет в sRGB.
    vec3 srgb(vec3 c) {
        return pow(c, vec3(2.2));
    }

    void main() {
        // Скруглённая капсула во всю высоту.
        vec2 p = (vUv - 0.5) * uSize;
        vec2 q = abs(p) - (uSize * 0.5 - uSize.y * 0.5);
        float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uSize.y * 0.5;
        float edge = fwidth(sdf);
        float shape = 1.0 - smoothstep(-edge, edge, sdf);
        if (shape <= 0.0 || uVisible <= 0.001) discard;

        // Заполнение тает справа налево.
        float fill = 1.0 - smoothstep(uProgress - 0.004, uProgress + 0.004, vUv.x);

        // Цвет от бирюзового к оранжевому и красному по мере того как время уходит.
        vec3 calm = srgb(vec3(0.25, 0.85, 0.85));
        vec3 warn = srgb(vec3(1.0, 0.62, 0.2));
        vec3 hot = srgb(vec3(1.0, 0.25, 0.25));
        vec3 bar = mix(hot, mix(warn, calm, smoothstep(0.25, 0.6, uProgress)), smoothstep(0.0, 0.25, uProgress));

        // Последняя четверть времени пульсирует.
        float pulse = 1.0 + (1.0 - smoothstep(0.0, 0.25, uProgress)) * 0.25 * sin(uTime * 14.0);
        // Блик по верху полоски.
        float gloss = smoothstep(0.55, 1.0, vUv.y) * 0.35;

        vec3 track = srgb(vec3(0.12, 0.14, 0.24));
        vec3 color = mix(track, bar * pulse + gloss, fill);
        gl_FragColor = vec4(color, shape * uVisible * mix(0.55, 1.0, fill));
        #include <colorspace_fragment>
    }
`;

/** Полоска времени хода над полем: тонкая капсула, шейдером. Видна только пока идёт отсчёт. */
export class TimerBar {
    readonly mesh: Mesh;
    readonly #material: ShaderMaterial;
    #visible = 0;

    constructor(cols: number, rows: number) {
        this.#material = new ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uProgress: { value: 1 },
                uVisible: { value: 0 },
                uTime: { value: 0 },
                uSize: { value: new Vector2(cols, HEIGHT) },
            },
            transparent: true,
            depthWrite: false,
        });
        this.mesh = new Mesh(new PlaneGeometry(cols, HEIGHT), this.#material);
        this.mesh.position.set(0, rows / 2 + FRAME + GAP + HEIGHT / 2, 0);
        this.mesh.renderOrder = 5;
        this.mesh.frustumCulled = false;
    }

    /** `progress` доля оставшегося времени, `show` идёт ли отсчёт (иначе полоска плавно гаснет). */
    update(time: number, dt: number, progress: number, show: boolean): void {
        this.#visible += ((show ? 1 : 0) - this.#visible) * (1 - Math.exp(-dt * (show ? 14 : 6)));
        const uniforms = this.#material.uniforms;
        uniforms.uProgress!.value = progress;
        uniforms.uVisible!.value = this.#visible < 0.002 ? 0 : this.#visible;
        uniforms.uTime!.value = time;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.#material.dispose();
    }
}
