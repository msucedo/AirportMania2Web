import { caretAlpha, firstRowShown } from '../src/game/view/usersDialogs';
import { describe, expect, it } from 'vitest';
import { Users, progressKey, type UserStorage } from '../src/game/users';

function memory(initial: Record<string, string> = {}): UserStorage & { items: Map<string, string> } {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) };
}

describe('users', () => {
  it('starts with none, the progress kept where it was before there were users', () => {
    const users = Users.load(memory(), 'progress');
    expect(users.list).toEqual([]);
    expect(users.current).toBeNull();
    expect(users.progressKey).toBe('progress');
  });

  it('turns down an empty name first and a taken one after, spaces around it aside', () => {
    const users = Users.load(memory(), 'progress');
    users.create('  Ana ');
    expect(users.current?.name).toBe('Ana');
    expect(users.problem('')).toBe('null');
    expect(users.problem('   ')).toBe('null');
    expect(users.problem(' Ana  ')).toBe('repeated');
    expect(users.problem('ana')).toBeNull();
    expect(users.problem('An a')).toBeNull();
  });

  it('offers the default name with a star added for each time it is taken', () => {
    const users = Users.load(memory(), 'progress');
    expect(users.defaultName('Player')).toBe('Player');
    users.create('Player');
    expect(users.defaultName('Player')).toBe('Player*');
    users.create('Player*');
    expect(users.defaultName('Player')).toBe('Player**');
  });

  it('gives the first user the progress made before, and each user their own after', () => {
    const storage = memory({ progress: '{"records":{"1-1":{}}}' });
    const users = Users.load(storage, 'progress');
    const ana = users.create('Ana');
    expect(users.progressKey).toBe(progressKey('progress', ana.id));
    expect(storage.items.get(users.progressKey)).toBe('{"records":{"1-1":{}}}');
    expect(storage.items.has('progress')).toBe(false);
    const luis = users.create('Luis');
    expect(users.current).toEqual(luis);
    expect(users.progressKey).not.toBe(progressKey('progress', ana.id));
    expect(storage.items.has(users.progressKey)).toBe(false);
  });

  it('plays as the user picked in the list, and keeps it', () => {
    const storage = memory();
    const users = Users.load(storage, 'progress');
    users.create('Ana');
    users.create('Luis');
    expect(users.currentIndex).toBe(1);
    users.select(0);
    expect(users.current?.name).toBe('Ana');
    users.rename(' Anita ');
    const again = Users.load(storage, 'progress');
    expect(again.list.map((user) => user.name)).toEqual(['Anita', 'Luis']);
    expect(again.current?.name).toBe('Anita');
  });

  it('deletes the current user with their progress', () => {
    const storage = memory();
    const users = Users.load(storage, 'progress');
    const ana = users.create('Ana');
    users.create('Luis');
    users.select(0);
    storage.setItem(progressKey('progress', ana.id), '{}');
    users.remove();
    expect(users.list.map((user) => user.name)).toEqual(['Luis']);
    expect(users.current?.name).toBe('Luis');
    expect(storage.items.has(progressKey('progress', ana.id))).toBe(false);
    users.remove();
    expect(users.current).toBeNull();
    // A user made after the first never takes over earlier progress.
    storage.setItem('progress', '{"old":true}');
    users.create('Eva');
    expect(storage.items.get('progress')).toBe('{"old":true}');
  });

  it('keeps the picked row among the three the list shows', () => {
    expect(firstRowShown(0, 0, 3)).toBe(0);
    expect(firstRowShown(0, 2, 3)).toBe(0);
    expect(firstRowShown(0, 3, 3)).toBe(1);
    expect(firstRowShown(4, 2, 3)).toBe(2);
    expect(firstRowShown(1, 2, 3)).toBe(1);
    expect(firstRowShown(2, -1, 3)).toBe(2);
  });

  it('blinks the caret', () => {
    expect(caretAlpha(0)).toBe(1);
    expect(caretAlpha(Math.PI / 16)).toBe(1);
    expect(caretAlpha((3 * Math.PI) / 16)).toBe(0);
    expect(caretAlpha((7 * Math.PI) / 48)).toBeCloseTo(0, 5);
  });

  it('plays on as the user after the one deleted, or the last', () => {
    const users = Users.load(memory(), 'progress');
    for (const name of ['Ana', 'Luis', 'Eva']) users.create(name);
    users.select(1);
    users.remove();
    expect(users.current?.name).toBe('Eva');
    users.remove();
    expect(users.current?.name).toBe('Ana');
  });
});

