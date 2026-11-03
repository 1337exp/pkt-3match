import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    Color,
    Points,
    ShaderMaterial,
} from 'three';

const vertexShader = /* glsl */ `
    attribute vec3 aVel;
    attribute vec3 aColor;
    attribute vec3 aData; // x: время старта, y: жизнь, z: размер в мировых единицах
    uniform float uTime;
    uniform float uScale; // пикселей на мировую единицу на расстоянии 1
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        float age = uTime - aData.x;
        float k = age / aData.y;
        if (age < 0.0 || k >= 1.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
        }
        // Разлёт с затуханием скорости и лёгким падением.
        vec3 p = position + aVel * ((1.0 - exp(-3.2 * age)) / 3.2) - vec3(0.0, 1.4, 0.0) * age * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aData.z * uScale / -mv.z * (1.0 - k * 0.7);
        vAlpha = 1.0 - k * k;
        vColor = aColor;
    }
`;

const fragmentShader = /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float d = length(c);
        if (d > 1.0) discard;
        float glow = pow(1.0 - d, 2.0);
        // Четыре луча звезды.
        float star = max(0.0, 1.0 - 9.0 * abs(c.x * c.y)) * (1.0 - d);
        gl_FragColor = vec4(vColor * (0.7 + star * 2.0), (glow + star) * vAlpha);
        #include <colorspace_fragment>
    }
`;

/**
 * Искры при лопании. Один `Points` на все шары, кольцевой буфер: эмиссия это запись в несколько
 * атрибутов, а весь полёт считает вершинный шейдер по времени. Ни объектов, ни аллокаций в кадре.
 */
export class Bursts {
    readonly points: Points;
    readonly material: ShaderMaterial;
    readonly #capacity: number;
    readonly #position: BufferAttribute;
    readonly #velocity: BufferAttribute;
    readonly #color: BufferAttribute;
    readonly #data: BufferAttribute;
    #cursor = 0;
    #tmp = new Color();

    constructor(capacity = 480) {
        this.#capacity = capacity;
        const geometry = new BufferGeometry();
        this.#position = new BufferAttribute(new Float32Array(capacity * 3), 3);
        this.#velocity = new BufferAttribute(new Float32Array(capacity * 3), 3);
        this.#color = new BufferAttribute(new Float32Array(capacity * 3), 3);
        this.#data = new BufferAttribute(new Float32Array(capacity * 3), 3);
        // Все частицы «мертвы» с самого начала: старт далеко в прошлом.
        for (let i = 0; i < capacity; i++) this.#data.setXYZ(i, -1e4, 1, 0);
        geometry.setAttribute('position', this.#position);
        geometry.setAttribute('aVel', this.#velocity);
        geometry.setAttribute('aColor', this.#color);
        geometry.setAttribute('aData', this.#data);

        this.material = new ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
        });
        this.points = new Points(geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 10;
    }

    /** Пикселей на мировую единицу: зависит от высоты кадра и угла камеры. */
    setScale(pixelsPerUnit: number): void {
        this.material.uniforms.uScale!.value = pixelsPerUnit;
    }

    setTime(time: number): void {
        this.material.uniforms.uTime!.value = time;
    }

    emit(time: number, x: number, y: number, z: number, color: string, count: number, power = 1): void {
        this.#tmp.set(color);
        for (let i = 0; i < count; i++) {
            const at = this.#cursor;
            this.#cursor = (this.#cursor + 1) % this.#capacity;
            // Направление: по сфере, с уклоном к зрителю, чтобы искры летели «на нас».
            const a = Math.random() * Math.PI * 2;
            const cz = Math.random() * 1.4 - 0.4;
            const r = Math.sqrt(Math.max(1 - cz * cz, 0));
            const speed = (1.6 + Math.random() * 3) * power;
            this.#position.setXYZ(at, x, y, z);
            this.#velocity.setXYZ(at, Math.cos(a) * r * speed, Math.sin(a) * r * speed, cz * speed);
            // Часть искр светлее цвета камня, чтобы был блеск.
            const white = Math.random() < 0.3 ? 0.6 : 0;
            this.#color.setXYZ(
                at,
                this.#tmp.r + (1 - this.#tmp.r) * white,
                this.#tmp.g + (1 - this.#tmp.g) * white,
                this.#tmp.b + (1 - this.#tmp.b) * white,
            );
            this.#data.setXYZ(at, time, 0.45 + Math.random() * 0.5, 0.07 + Math.random() * 0.16);
        }
        this.#position.needsUpdate = true;
        this.#velocity.needsUpdate = true;
        this.#color.needsUpdate = true;
        this.#data.needsUpdate = true;
    }

    dispose(): void {
        this.points.geometry.dispose();
        this.material.dispose();
    }
}
