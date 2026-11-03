export interface GemPalette {
    title: string;
    /** Тёмная глубина, основной цвет и яркие прожилки внутри камня. */
    deep: string;
    mid: string;
    glow: string;
}

/**
 * Камни по типам шаров. Порядок как в старой игре: красный, синий, зелёный, жёлтый, фиолетовый, розовый (лечение).
 * Первые четыре цвета взяты из кристаллов pkt-dice.
 */
export const GEMS: readonly GemPalette[] = [
    { title: 'Рубин', deep: '#2a0414', mid: '#ff2d4a', glow: '#ffb15e' },
    { title: 'Сапфир', deep: '#031238', mid: '#1368ff', glow: '#3ff0e6' },
    { title: 'Изумруд', deep: '#02201a', mid: '#0fb67c', glow: '#c2ff7c' },
    { title: 'Топаз', deep: '#2e1a02', mid: '#ffb21a', glow: '#fff1a0' },
    { title: 'Аметист', deep: '#1a0538', mid: '#8a3dff', glow: '#ff80ea' },
    { title: 'Розовый кварц', deep: '#34051e', mid: '#ff5fb8', glow: '#ffe0f2' },
];
