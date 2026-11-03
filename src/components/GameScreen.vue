<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { ModeInfo } from '../modes';
import { SHAPES, type ShapeId } from '../shared/core/shapes';
import { Stage } from '../shared/render/Stage';
import ShapeRow from './ShapeRow.vue';

const props = defineProps<{ mode: ModeInfo }>();
defineEmits<{ back: [] }>();

const canvas = ref<HTMLCanvasElement>();
const turns = ref(0);
const combos = ref(0);
const best = ref(0);
const busy = ref(false);
const error = ref('');
const shapeCounts = ref<Record<ShapeId, number>>({});

// Отладка: адрес с `&debug` показывает кадры в секунду, вызовы отрисовки и память (память только в Chrome).
const debug = new URLSearchParams(location.search).has('debug');
const stats = ref('');
let statsTimer = 0;

// Stage держит объекты Three, они не должны попадать под реактивность Vue: обычная переменная.
let stage: Stage | null = null;
let unmounted = false;

onMounted(async () => {
    if (debug) {
        statsTimer = window.setInterval(() => {
            if (!stage) return;
            const { fps, calls } = stage.stats;
            const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
            stats.value = `${Math.round(fps)} кадр/с · ${calls} вызовов${heap ? ` · ${Math.round(heap.usedJSHeapSize / 1048576)} МБ` : ''}`;
        }, 500);
    }
    try {
        const createMode = await props.mode.load();
        if (unmounted) return;
        stage = new Stage(
            canvas.value!,
            { cols: 6, rows: 5, types: 6, seed: Math.floor(Math.random() * 1e9), moveTime: 4.5 },
            createMode,
            {
                onBusy: (value) => (busy.value = value),
                onCluster: ({ shape }) => {
                    combos.value++;
                    if (shape) shapeCounts.value = { ...shapeCounts.value, [shape]: (shapeCounts.value[shape] ?? 0) + 1 };
                },
                onTurn: () => turns.value++,
                onChain: (size) => (best.value = Math.max(best.value, size)),
            },
        );
        if (import.meta.env.DEV) (window as unknown as { stage: Stage }).stage = stage;
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    }
});

onBeforeUnmount(() => {
    unmounted = true;
    window.clearInterval(statsTimer);
    stage?.dispose();
});

function restart() {
    turns.value = 0;
    combos.value = 0;
    best.value = 0;
    shapeCounts.value = {};
    stage?.newGame();
}
</script>

<template>
    <main class="app">
        <header class="hud">
            <button type="button" class="hud-button" @click="$emit('back')">Меню</button>
            <div class="stat"><span>Ходов</span><b>{{ turns }}</b></div>
            <div class="stat"><span>Комбо</span><b>{{ combos }}</b></div>
            <div class="stat"><span>Лучший ход</span><b>{{ best }}</b></div>
            <button type="button" class="hud-button restart" @click="restart">Заново</button>
        </header>
        <ShapeRow :shapes="SHAPES" :counts="shapeCounts" />
        <p v-if="debug" class="debug">{{ stats }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <canvas ref="canvas" class="board" :class="{ busy }"></canvas>
    </main>
</template>
