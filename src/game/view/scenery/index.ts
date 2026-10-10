import type { Container } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';
import type { SceneryItem } from '../../stages/layout';
import { SeaSparkles } from '../waterEffects';
import { FlagView, HorizonObjectView } from './simple';

// The animated scenery a stage script makes between its backdrop images: one view per class of
// the original. See docs/re-notes.md.

/** A piece of scenery on screen. One with a `depth` is sorted among the planes at that height. */
export interface SceneryView {
  view: Container;
  update(dt: number): void;
  depth?: number;
}

/** The images a piece needs loaded. */
export function scenerySurfaceIds(item: SceneryItem): string[] {
  switch (item.scenery) {
    case 'sea':
      return ['AMBIENT.WAVE_REFLECT'];
    case 'flag':
    case 'horizon':
      return [item.resource];
  }
}

export function createScenery(textures: TextureStore, item: SceneryItem): SceneryView {
  switch (item.scenery) {
    case 'sea': {
      const view = new SeaSparkles(textures, item.area);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'flag': {
      const view = new FlagView(textures, item.resource, item.position);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'horizon': {
      const view = new HorizonObjectView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
  }
}
