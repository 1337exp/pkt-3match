import { Color, ShaderMaterial } from 'three';
import type { GemPalette } from './palette';

/**
 * Дешёвый «кристалл со звёздами» для многих шаров сразу. В отличие от стекла в pkt-dice тут нет
 * transmission (он перерисовывает всю сцену ещё раз): глубина подделана в самом шейдере,
 * внутри шара три слоя тумана и звёзд, смотрим на них сквозь преломлённый луч. Отражения это
 * студийный свет, посчитанный формулами, без кубкарты. Шар маленький на экране, так что цена на пиксель терпима.
 *
 * Инстансинг: каждому шару своё зерно звёзд, вспышка и «схвачен пальцем» (`aParams`).
 */
const vertexShader = /* glsl */ `
    attribute vec4 aParams; // x: зерно, y: вспышка, z: схвачен, w: обрезать по верху поля (шар ещё въезжает сверху)
    varying vec3 vN;
    varying vec3 vView;
    varying vec3 vP;
    varying vec3 vD;
    varying vec4 vParams;
    varying float vWorldY;

    void main() {
        mat4 model = modelMatrix * instanceMatrix;
        vec4 mv = viewMatrix * model * vec4(position, 1.0);
        vWorldY = (model * vec4(position, 1.0)).y;
        vN = normalize(mat3(viewMatrix) * mat3(model) * normal);
        vView = -mv.xyz;
        vP = position;
        vec3 camera = (inverse(model) * vec4(cameraPosition, 1.0)).xyz;
        vD = position - camera;
        vParams = aParams;
        gl_Position = projectionMatrix * mv;
    }
`;

const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uMid;
    uniform vec3 uGlow;
    uniform float uClipY; // выше этой высоты шар не рисуется, но только пока он въезжает: новые шары влетают в поле как в щель
    varying vec3 vN;
    varying vec3 vView;
    varying vec3 vP;
    varying vec3 vD;
    varying vec4 vParams;
    varying float vWorldY;

    float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
    }
    vec3 hash33(vec3 p) {
        return vec3(hash13(p), hash13(p + 19.19), hash13(p + 47.47));
    }
    float vnoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y);
        float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y);
        return mix(a, b, f.z);
    }

    // Звезда в своей клетке с мерцанием.
    float stars(vec3 q, float density, float time, float size, float seed) {
        vec3 g = q * density;
        vec3 id = floor(g);
        vec3 f = fract(g);
        vec3 r = hash33(id + seed);
        if (r.x < 0.55) return 0.0;
        vec3 c = 0.25 + 0.5 * r;
        float d = length(f - c);
        float twinkle = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(time * (1.5 + 3.0 * r.y) + r.z * 6.283), 3.0);
        return smoothstep((0.26 + 0.12 * r.z) * size, 0.0, d) * twinkle;
    }

    // Студийный свет в пространстве камеры: мягкое пятно ключевого света и цветные боке.
    vec3 studio(vec3 r) {
        vec3 c = vec3(0.0);
        c += vec3(1.0, 0.97, 0.92) * pow(max(dot(r, normalize(vec3(-0.45, 0.65, 0.62))), 0.0), 38.0) * 2.4;
        c += vec3(0.75, 0.88, 1.0) * pow(max(dot(r, normalize(vec3(0.7, 0.25, 0.4))), 0.0), 60.0) * 1.1;
        c += vec3(1.0, 0.45, 0.2) * pow(max(dot(r, normalize(vec3(0.55, -0.6, 0.5))), 0.0), 14.0) * 0.28;
        c += vec3(0.15, 0.8, 0.9) * pow(max(dot(r, normalize(vec3(-0.7, -0.4, 0.45))), 0.0), 12.0) * 0.22;
        return c;
    }

    void main() {
        // Обрезка только у въезжающих шаров: схваченный шар у верхней границы выступает выше поля и должен быть целым.
        if (vParams.w > 0.5 && vWorldY > uClipY) discard;

        float seed = vParams.x;
        float flash = vParams.y;
        float held = vParams.z;

        vec3 n = normalize(vN);
        vec3 v = normalize(vView);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        float fresnel = pow(1.0 - facing, 3.0);

        // Луч внутри камня: преломляется на входе и идёт вглубь.
        vec3 nObj = normalize(vP);
        vec3 ray = refract(normalize(vD), nObj, 0.68);

        vec3 color = uDeep * 0.6;
        float haze = 0.0;
        for (int i = 0; i < 3; i++) {
            float s = 0.25 + float(i) * 0.5;
            vec3 p = vP + ray * s;
            float n1 = vnoise(p * 1.7 + vec3(0.0, uTime * 0.05, seed)) * 0.65 + vnoise(p * 3.5 + seed) * 0.35;
            float layer = smoothstep(0.38, 0.78, n1);
            haze += layer * 0.33;
            color += mix(uMid, uGlow, layer * layer * layer * 0.8) * layer * 0.62;
            color += uGlow * stars(p, 4.5, uTime, 1.0, seed) * 1.3;
            color += vec3(1.0) * stars(p + 3.1, 10.0, uTime * 1.3, 0.55, seed) * 0.8;
        }
        color = mix(color, uMid, haze * 0.1);

        // Стеклянная оболочка: затемнение к краям, цветная кромка и блики.
        color *= 0.5 + 0.5 * facing;
        color += mix(uMid, uGlow, 0.5) * fresnel * 0.55;
        color += studio(reflect(-v, n)) * (0.2 + 0.5 * fresnel);

        // Вспышка при лопании и подсветка схваченного шара.
        color += (uGlow * 0.8 + vec3(0.2)) * flash;
        color += uGlow * fresnel * held * 0.8 + uMid * held * 0.1;

        // Мягкое сжатие яркости: блики не выбеливают цвет камня.
        color = 1.0 - exp(-color * 1.25);

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
    }
`;

export function gemMaterial(palette: GemPalette, clipY: number): ShaderMaterial {
    return new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uClipY: { value: clipY },
            uDeep: { value: new Color(palette.deep) },
            uMid: { value: new Color(palette.mid) },
            uGlow: { value: new Color(palette.glow) },
        },
    });
}
