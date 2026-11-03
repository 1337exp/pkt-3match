<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import GameScreen from './components/GameScreen.vue';
import MenuScreen from './components/MenuScreen.vue';
import { findMode, type ModeId } from './modes';

// Выбранный режим живёт в адресе (?mode=static): ссылкой можно поделиться, перезагрузка не сбрасывает выбор.
function modeFromUrl(): ModeId | null {
    const mode = findMode(new URLSearchParams(location.search).get('mode'));
    return mode?.ready ? mode.id : null;
}

const modeId = ref<ModeId | null>(modeFromUrl());
const mode = computed(() => findMode(modeId.value));

// Остальные параметры адреса (например, `debug`) переживают переходы между меню и игрой.
function setMode(id: ModeId | null) {
    const params = new URLSearchParams(location.search);
    if (id) params.set('mode', id);
    else params.delete('mode');
    const query = params.toString();
    history.pushState({}, '', query ? `?${query}` : location.pathname);
    modeId.value = id;
}

const open = (id: ModeId) => setMode(id);
const back = () => setMode(null);

const sync = () => (modeId.value = modeFromUrl());
onMounted(() => window.addEventListener('popstate', sync));
onBeforeUnmount(() => window.removeEventListener('popstate', sync));
</script>

<template>
    <GameScreen v-if="mode" :key="mode.id" :mode="mode" @back="back" />
    <MenuScreen v-else @pick="open" />
</template>
