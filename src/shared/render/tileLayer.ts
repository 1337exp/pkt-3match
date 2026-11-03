import { Group, InstancedBufferAttribute, InstancedMesh, Object3D, SphereGeometry, type ShaderMaterial } from 'three';
import { gemMaterial } from './gemMaterial';
import { RADIUS } from './metrics';
import { GEMS } from './palette';

/** Состояние одного шара на экране. Логика режима о нём не знает, режим только двигает эти поля. */
export class TileView {
    alive = true;
    x = 0;
    y = 0;
    z = 0;
    scale = 1;
    flash = 0;
    held = 0;
    /** 1 пока шар въезжает сверху: его обрезает верхний край поля. Приземлился, 0. */
    clip = 0;
    /** Меняется при каждом новом скольжении: старый твин, увидев чужой токен, уступает. */
    token = 0;
    readonly seed = Math.random() * 100;
    readonly spinX = (Math.random() - 0.5) * 0.5;
    readonly spinY = (Math.random() - 0.5) * 0.5;
    readonly tiltX = Math.random() * 6.28;
    readonly tiltY = Math.random() * 6.28;

    constructor(readonly type: number) {}
}

/**
 * Рисует шары: `InstancedMesh` по одному на тип, итого `types` draw call на всё поле.
 * Режимы создают шары через `add`, двигают поля `TileView`, а слой каждый кадр переписывает их в буферы.
 */
export class TileLayer {
    readonly group = new Group();

    #tiles: TileView[] = [];
    #meshes: InstancedMesh[] = [];
    #params: InstancedBufferAttribute[] = [];
    #materials: ShaderMaterial[] = [];
    #counts: number[];
    #dummy = new Object3D();

    /** `rows` нужен для обрезки въезжающих шаров по верху поля. */
    constructor(cols: number, rows: number, types: number) {
        this.#counts = new Array(types).fill(0);
        const capacity = cols * rows * 2;
        const sphere = new SphereGeometry(1, 32, 20);
        for (let type = 0; type < types; type++) {
            const geometry = sphere.clone();
            const params = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
            geometry.setAttribute('aParams', params);
            const material = gemMaterial(GEMS[type % GEMS.length]!, rows / 2);
            const mesh = new InstancedMesh(geometry, material, capacity);
            mesh.count = 0;
            mesh.frustumCulled = false;
            this.group.add(mesh);
            this.#meshes.push(mesh);
            this.#params.push(params);
            this.#materials.push(material);
        }
        sphere.dispose();
    }

    add(type: number, x: number, y: number): TileView {
        const tile = new TileView(type);
        tile.x = x;
        tile.y = y;
        this.#tiles.push(tile);
        return tile;
    }

    /** Убрать все шары (новая партия). */
    clear(): void {
        for (const tile of this.#tiles) tile.alive = false;
        this.#tiles = [];
    }

    /** Вызывать раз в кадр после того, как режим подвинул шары. */
    update(time: number): void {
        for (const material of this.#materials) material.uniforms.uTime!.value = time;

        let alive = 0;
        this.#counts.fill(0);
        for (const tile of this.#tiles) {
            if (!tile.alive) continue;
            this.#tiles[alive++] = tile;
            const index = this.#counts[tile.type]!++;
            const params = this.#params[tile.type]!;
            if (index >= params.count) continue;
            const dummy = this.#dummy;
            dummy.position.set(tile.x, tile.y, tile.z);
            dummy.rotation.set(tile.tiltX + time * tile.spinX, tile.tiltY + time * tile.spinY, 0);
            dummy.scale.setScalar(RADIUS * tile.scale);
            dummy.updateMatrix();
            this.#meshes[tile.type]!.setMatrixAt(index, dummy.matrix);
            params.setXYZW(index, tile.seed, tile.flash, tile.held, tile.clip);
        }
        this.#tiles.length = alive;

        for (let type = 0; type < this.#meshes.length; type++) {
            const mesh = this.#meshes[type]!;
            mesh.count = this.#counts[type]!;
            mesh.instanceMatrix.needsUpdate = true;
            this.#params[type]!.needsUpdate = true;
        }
    }

    dispose(): void {
        for (const mesh of this.#meshes) {
            mesh.geometry.dispose();
            mesh.dispose();
        }
        for (const material of this.#materials) material.dispose();
    }
}
