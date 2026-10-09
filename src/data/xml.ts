// Generic tree emitted by tools/import-assets.mjs for every data XML.
export interface XmlNode {
  /** Tag name. */
  t: string;
  /** Attributes, always as the original strings. */
  a: Record<string, string>;
  /** Child elements in document order. */
  c: XmlNode[];
  /** Text content, if any. */
  x?: string;
}

export function child(node: XmlNode, tag: string): XmlNode | undefined {
  return node.c.find((n) => n.t === tag);
}

export function children(node: XmlNode, tag: string): XmlNode[] {
  return node.c.filter((n) => n.t === tag);
}

export function requireChild(node: XmlNode, tag: string): XmlNode {
  const found = child(node, tag);
  if (!found) throw new Error(`<${node.t}> has no <${tag}> child`);
  return found;
}

export function root(tree: XmlNode[], tag: string): XmlNode {
  const found = tree.find((n) => n.t === tag);
  if (!found) throw new Error(`Missing root <${tag}>`);
  return found;
}

export function str(node: XmlNode, name: string): string {
  const value = node.a[name];
  if (value === undefined) throw new Error(`<${node.t}> has no attribute ${name}`);
  return value;
}

// Numbers in the data sometimes carry a C-style suffix ("-60.0f"); parseFloat ignores it.
export function num(node: XmlNode, name: string): number {
  const value = Number.parseFloat(str(node, name));
  if (Number.isNaN(value)) throw new Error(`<${node.t}> ${name}="${node.a[name]}" is not a number`);
  return value;
}

export function optNum(node: XmlNode, name: string, fallback: number): number {
  return node.a[name] === undefined ? fallback : num(node, name);
}

// Booleans appear as "true"/"True"/"false"/"False".
export function bool(node: XmlNode, name: string, fallback = false): boolean {
  const value = node.a[name];
  return value === undefined ? fallback : value.toLowerCase() === 'true';
}

export interface Point {
  x: number;
  y: number;
}

export function point(node: XmlNode): Point {
  return { x: num(node, 'x'), y: num(node, 'y') };
}
