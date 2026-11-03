<script setup lang="ts">
import { MODES, type ModeId } from '../modes';

defineEmits<{ pick: [id: ModeId] }>();
</script>

<template>
    <main class="menu">
        <h1 class="menu-title">Три в ряд</h1>
        <p class="menu-lead">Выбери, как играть.</p>
        <div class="menu-list">
            <button
                v-for="mode in MODES"
                :key="mode.id"
                type="button"
                class="menu-card"
                :disabled="!mode.ready"
                @click="$emit('pick', mode.id)"
            >
                <span class="menu-card-title">
                    {{ mode.title }}
                    <em v-if="!mode.ready" class="menu-soon">скоро</em>
                </span>
                <span class="menu-card-text">{{ mode.description }}</span>
            </button>
        </div>
    </main>
</template>
