import { Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';

const PADDING = 0.14;
/** Насколько рамка выступает за край поля. */
export const PLATE_REACH = PADDING;
/** Глубина подложки позади центров шаров. */
export const PLATE_Z = -0.52;

const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    uniform vec2 uSize;    // клеток по ширине и высоте
    uniform float uPad;
    varying vec2 vUv;

    // Цвета ниже записаны как в макете (sRGB), а на выходе шейдер сам переводит линейный цвет в sRGB.
    vec3 srgb(vec3 c) {
        return pow(c, vec3(2.2));
    }

    void main() {
        vec2 total = uSize + 2.0 * uPad;
        // Координаты в клетках от левого верхнего угла поля.
        vec2 p = vec2(vUv.x, 1.0 - vUv.y) * total - uPad;

        // Скруглённый прямоугольник самого поля.
        vec2 q = abs(p - uSize * 0.5) - (uSize * 0.5 - 0.1);
        float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.1;
        float edge = fwidth(sdf);
        float inside = 1.0 - smoothstep(-edge, edge, sdf);
        float frame = 1.0 - smoothstep(uPad - 0.02, uPad + edge, sdf);

        vec2 cell = floor(clamp(p, vec2(0.0), uSize - 0.001));
        float checker = mod(cell.x + cell.y, 2.0);
        vec3 base = srgb(mix(vec3(0.07, 0.085, 0.15), vec3(0.1, 0.12, 0.2), checker));

        // Тонкая подсветка у границ клеток.
        vec2 f = abs(fract(p) - 0.5);
        float rim = smoothstep(0.44, 0.5, max(f.x, f.y));
        base += srgb(vec3(0.1, 0.13, 0.24)) * rim * 0.5;

        vec3 frameColor = srgb(vec3(0.2, 0.22, 0.4));
        vec3 color = mix(frameColor, base, inside);
        gl_FragColor = vec4(color, frame);
        #include <colorspace_fragment>
    }
`;

/** Подложка поля: шахматка клеток с рамкой, одним квадом и одним шейдером. */
export function makePlate(cols: number, rows: number): Mesh {
    const material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uSize: { value: new Vector2(cols, rows) }, uPad: { value: PADDING } },
        transparent: true,
    });
    const mesh = new Mesh(new PlaneGeometry(cols + 2 * PADDING, rows + 2 * PADDING), material);
    mesh.position.z = PLATE_Z;
    return mesh;
}
