// Lookup over the flattened resources.xml (see tools/import-assets.mjs).

export type Blending = 'ALPHA' | 'ADDITIVE' | 'DECAL';

export interface SurfaceDef {
  /** Path relative to the assets root, or null when the file is not in the pack. */
  file: string | null;
  /** True when the sprite's origin is its centre instead of its top-left corner. */
  centered: boolean;
  blending: Blending;
  /** Greyscale image holding the opacity, for surfaces whose colours come from a JPEG. */
  alpha?: string;
  noClip?: boolean;
  x?: number;
  y?: number;
}

export interface SampleDef {
  file: string | null;
  stream: boolean;
}

export interface GroupDef {
  loads: string[];
  surfaces: string[];
  samples: string[];
  files: string[];
  fonts: string[];
}

export interface ResourcesData {
  groups: Record<string, GroupDef>;
  surfaces: Record<string, SurfaceDef>;
  samples: Record<string, SampleDef>;
  files: Record<string, { file: string | null; language?: string }[]>;
  fonts: Record<string, { file: string | null; ascentFactor?: number; languages?: string[] }[]>;
}

export class Resources {
  constructor(
    private readonly data: ResourcesData,
    /** URL prefix the asset files are served from. */
    readonly baseUrl = 'assets/',
  ) {}

  hasSurface(id: string): boolean {
    return id in this.data.surfaces;
  }

  surface(id: string): SurfaceDef & { file: string } {
    const def = this.data.surfaces[id];
    if (!def) throw new Error(`Unknown surface "${id}"`);
    if (def.file === null) throw new Error(`Surface "${id}" has no file in the pack`);
    return def as SurfaceDef & { file: string };
  }

  /** File of a TrueType font resource, or null when the pack does not ship it. */
  fontFile(id: string): string | null {
    return this.data.fonts[id]?.find((f) => f.file)?.file ?? null;
  }

  hasSample(id: string): boolean {
    return this.data.samples[id]?.file != null;
  }

  sample(id: string): SampleDef & { file: string } {
    const def = this.data.samples[id];
    if (!def) throw new Error(`Unknown sample "${id}"`);
    if (def.file === null) throw new Error(`Sample "${id}" has no file in the pack`);
    return def as SampleDef & { file: string };
  }

  url(file: string): string {
    return this.baseUrl + file;
  }

  /** A group and everything it pulls in through <Load Group>, dependencies first. */
  groupClosure(name: string): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (group: string): void => {
      if (seen.has(group)) return;
      seen.add(group);
      const def = this.data.groups[group];
      if (!def) throw new Error(`Unknown resource group "${group}"`);
      for (const dep of def.loads) visit(dep);
      order.push(group);
    };
    visit(name);
    return order;
  }

  /** Surface ids declared by the given groups and their dependencies. */
  surfacesOf(...groups: string[]): string[] {
    return this.collect(groups, (g) => g.surfaces);
  }

  samplesOf(...groups: string[]): string[] {
    return this.collect(groups, (g) => g.samples);
  }

  private collect(groups: string[], pick: (g: GroupDef) => string[]): string[] {
    const ids = new Set<string>();
    for (const name of groups) {
      for (const group of this.groupClosure(name)) {
        for (const id of pick(this.data.groups[group]!)) ids.add(id);
      }
    }
    return [...ids];
  }
}
