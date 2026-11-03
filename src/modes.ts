import type { ModeFactory } from './shared/mode';

export type ModeId = 'static' | 'dynamic';

export interface ModeInfo {
    id: ModeId;
    title: string;
    description: string;
    /** false: режим ещё не готов, в меню он виден, но не открывается. */
    ready: boolean;
    /** Режим грузится лениво: код режима не попадает в сборку меню. */
    load: () => Promise<ModeFactory>;
}

export const MODES: readonly ModeInfo[] = [
    {
        id: 'static',
        title: 'Классика',
        description: 'Схватил, протащил, отпустил, и лопается вся цепочка. Пока она играет, ввод ждёт.',
        ready: true,
        load: async () => (await import('./static')).createMode,
    },
    {
        id: 'dynamic',
        title: 'Живой',
        description: 'Ввод не блокируется: тащи шары, пока вокруг падают и лопаются другие.',
        ready: true,
        load: async () => (await import('./dynamic')).createMode,
    },
];

export function findMode(id: string | null): ModeInfo | undefined {
    return MODES.find((mode) => mode.id === id);
}
