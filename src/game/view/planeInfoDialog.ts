import { SCORE_FILL } from './faces';
import { Container, Text } from 'pixi.js';
import type { PlaneDescriptor } from '../../data/planes';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton } from './dialog';
import { SCORE_FONT } from './floatingText';
import { centred, textBox, title, white } from './tutorialViews';

// What a plane is (dialog 0xdbfc, draw 0xe45c): a 400×250 frame with the plane's trophy at
// (−150, 20), its name centred at y −108, its description in (−210, −90)–(210, −35), and rows
// with their label from x −83 and their value up to x 191. It opens when the notice of a plane
// landed for the first time goes (0x32050), and from that plane's trophy in the awards room
// once it is had (0x1bed6). See docs/re-notes.md.

/** The trophy's picture, to load before the dialog can show. */
export const planeTrophy = (type: number): string => `AWARDS_ROOM.PLANES_TROPHIES.${type}`;

/** The rows, top to bottom: label, value if any, the height of each and whether the value is money. */
export function planeInfoRows(plane: PlaneDescriptor): { label: string; value: string | null; y: number; money: boolean; text: boolean }[] {
  return [
    { label: 'PLANE_INFO_DIALOG.PASSENGERS', value: String(plane.passengers), y: -30, money: false, text: false },
    { label: 'PLANE_INFO_DIALOG.PATIENCE', value: plane.patience, y: -10, money: false, text: true },
    { label: 'PLANE_INFO_DIALOG.LOAD_SPEED', value: plane.loadingSpeed, y: 10, money: false, text: true },
    { label: 'PLANE_INFO_DIALOG.MAXIMUM_EARNINGS', value: null, y: 30, money: false, text: false },
    { label: 'PLANE_INFO_DIALOG.LANDING_TAKEOFF', value: String(plane.points.runway), y: 55, money: true, text: false },
    { label: 'PLANE_INFO_DIALOG.ARRIVAL_DEPARTURE', value: String(plane.points.gate), y: 80, money: true, text: false },
  ];
}

export class PlaneInfoDialog extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, plane: PlaneDescriptor, onClose: () => void) {
    super();
    const { overlay, centre } = centred(textures, 400, 250);
    const trophy = textures.sprite(planeTrophy(plane.type));
    trophy.position.set(-150, 20);
    centre.addChild(trophy);

    const heading = title();
    const name = new Text({ text: strings.t(plane.nameId), style: { fontFamily: heading.family, fontSize: heading.size, fill: heading.fill, stroke: { color: heading.stroke ?? 0, width: 3 } } });
    name.anchor.set(0.5);
    name.position.set(0, -108);
    centre.addChild(name);
    textBox(centre, strings.t(plane.descriptionId), { x1: -210, y1: -90, x2: 210, y2: -35 }, white(), true);

    const face = white();
    for (const row of planeInfoRows(plane)) {
      const label = new Text({ text: strings.t(row.label), style: { fontFamily: face.family, fontSize: face.size, fill: face.fill } });
      label.anchor.set(0, 0.5);
      label.position.set(-83, row.y);
      centre.addChild(label);
      if (row.value === null) continue;
      const style = row.money ? { fontFamily: fontFamily(SCORE_FONT), fontSize: 14, fill: SCORE_FILL } : { fontFamily: face.family, fontSize: face.size, fill: face.fill };
      const value = new Text({ text: row.text ? strings.t(row.value) : row.value, style });
      value.anchor.set(1, 0.5);
      value.position.set(191, row.y);
      centre.addChild(value);
    }
    dialogButton(textures, audio, centre, { x: 0, y: 110, width: 380, height: 30 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), onClose);
    this.addChild(overlay);
  }
}
