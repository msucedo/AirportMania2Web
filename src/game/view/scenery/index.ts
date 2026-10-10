import type { Container } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';
import type { SceneryItem } from '../../stages/layout';
import { SeaSparkles } from '../waterEffects';
import { CloudBandView, MovingImageView, PropellerView } from './airborne';
import { BAT_SURFACES, BatView, FogPatchView, ScaryCloudView } from './monsters';
import { AuroraView, StarView } from './night';
import { SLEIGH_SURFACES, SleighView, SnowView } from './northPole';
import { FlagView, HorizonObjectView } from './simple';
import { SPACE_SURFACES, SpaceView } from './space';

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
    case 'aurora':
    case 'moving':
    case 'cloudBand':
    case 'propeller':
    case 'scaryCloud':
    case 'fogPatch':
      return [item.resource];
    case 'bat':
      return BAT_SURFACES;
    case 'sleigh':
      return SLEIGH_SURFACES;
    case 'snow':
      return [item.resource];
    case 'space':
      return SPACE_SURFACES;
    case 'star':
      return ['AMBIENT.STAR'];
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
    case 'star': {
      const view = new StarView(textures, item.position, item.size);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'aurora': {
      const view = new AuroraView(textures, item.resource);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'moving': {
      const view = new MovingImageView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'cloudBand': {
      const view = new CloudBandView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'propeller': {
      const view = new PropellerView(textures, item.resource, item.position, item.scale);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'scaryCloud': {
      const view = new ScaryCloudView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'fogPatch': {
      const view = new FogPatchView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'bat': {
      const view = new BatView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'sleigh': {
      const view = new SleighView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'snow': {
      const view = new SnowView(textures, item);
      return { view, update: (dt) => view.update(dt) };
    }
    case 'space': {
      const view = new SpaceView(textures, item.height);
      return { view, update: (dt) => view.update(dt) };
    }
  }
}
