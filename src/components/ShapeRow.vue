<script setup lang="ts">
import type { ShapeDef, ShapeId } from '../shared/core/shapes';

defineProps<{
    shapes: readonly ShapeDef[];
    /** Сколько раз собрана каждая фигура за партию. */
    counts: Record<ShapeId, number>;
}>();
</script>

<template>
    <ul class="shapes" aria-label="Фигуры, которые можно собрать">
        <li
            v-for="shape in shapes"
            :key="shape.id"
            class="shape"
            :class="{ hit: (counts[shape.id] ?? 0) > 0 }"
            :title="shape.title"
        >
            <!-- key меняется с каждым сбором фигуры: узел создаётся заново и вспышка играет с начала -->
            <span :key="counts[shape.id] ?? 0" class="shape-flash">
                <span class="shape-icon" :style="{ gridTemplateColumns: `repeat(${shape.pattern[0]!.length}, 1fr)` }">
                    <template v-for="(row, r) in shape.pattern" :key="r">
                        <i v-for="(cell, c) in row" :key="c" :class="{ on: cell }"></i>
                    </template>
                </span>
            </span>
            <span class="shape-label">
                {{ shape.short }}<b v-if="(counts[shape.id] ?? 0) > 0"> ×{{ counts[shape.id] }}</b>
            </span>
        </li>
    </ul>
</template>
