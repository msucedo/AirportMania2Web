// The game's users (list kept in `users.dat`, 0x8210c; dialogs 0x80cd8, 0x805ac, 0x803cc and
// 0x7fe40). The rules are the original's; the storage format is ours. See docs/re-notes.md.

const KEY = 'am2web.users.v1';

export interface User {
  id: number;
  name: string;
}

export interface UsersData {
  users: User[];
  /** Id of the user playing; null when there is none yet. */
  current: number | null;
  nextId: number;
}

/** Why a name is turned down (0x80124), in the order it is checked. */
export type NameProblem = 'null' | 'repeated';

/** The little of `localStorage` the users need, so tests can stand in for it. */
export interface UserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Where a user's progress is kept. Without a user it is the place used before there were any. */
export const progressKey = (base: string, user: number | null): string => (user === null ? base : `${base}.user${user}`);

export class Users {
  private constructor(
    private data: UsersData,
    private readonly storage: UserStorage | null,
    private readonly progressBase: string,
  ) {}

  static load(storage: UserStorage | null, progressBase: string): Users {
    let data: UsersData = { users: [], current: null, nextId: 1 };
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const read = JSON.parse(raw) as UsersData;
        if (Array.isArray(read.users)) data = read;
      }
    } catch {
      // Storage unavailable or corrupt: start with no users for this session.
    }
    return new Users(data, storage, progressBase);
  }

  get list(): readonly User[] {
    return this.data.users;
  }

  get current(): User | null {
    return this.data.users.find((user) => user.id === this.data.current) ?? null;
  }

  /** Row of the current user in the list, or −1. */
  get currentIndex(): number {
    return this.data.users.findIndex((user) => user.id === this.data.current);
  }

  /** Where the current user's progress is kept. */
  get progressKey(): string {
    return progressKey(this.progressBase, this.current?.id ?? null);
  }

  /** The name a new user is offered (0x80704): the default, with a `*` added while it is taken. */
  defaultName(base: string): string {
    let name = base;
    while (this.data.users.some((user) => user.name === name)) name += '*';
    return name;
  }

  /** A name as it is kept: without the spaces around it. */
  static tidy(name: string): string {
    return name.replace(/^ +| +$/g, '');
  }

  /** What is wrong with a name, if anything: empty first, then already some user's. */
  problem(name: string): NameProblem | null {
    const tidy = Users.tidy(name);
    if (tidy === '') return 'null';
    if (this.data.users.some((user) => user.name === tidy)) return 'repeated';
    return null;
  }

  /** Adds a user, who becomes the one playing. The first takes over the progress made before there were users. */
  create(name: string): User {
    const user: User = { id: this.data.nextId++, name: Users.tidy(name) };
    const first = this.data.users.length === 0 && user.id === 1;
    this.data.users.push(user);
    this.data.current = user.id;
    if (first) {
      try {
        const before = this.storage?.getItem(this.progressBase);
        if (before) {
          this.storage?.setItem(progressKey(this.progressBase, user.id), before);
          this.storage?.removeItem(this.progressBase);
        }
      } catch {
        // The progress stays where it was.
      }
    }
    this.save();
    return user;
  }

  rename(name: string): void {
    const user = this.current;
    if (!user) return;
    user.name = Users.tidy(name);
    this.save();
  }

  /** Picking a row of the list makes its user the one playing (0x81bc0). */
  select(index: number): void {
    const user = this.data.users[index];
    if (!user) return;
    this.data.current = user.id;
    this.save();
  }

  /** Deletes the current user and their progress; the first of those left plays on. */
  remove(): void {
    const user = this.current;
    if (!user) return;
    this.data.users = this.data.users.filter((other) => other !== user);
    this.data.current = this.data.users[0]?.id ?? null;
    try {
      this.storage?.removeItem(progressKey(this.progressBase, user.id));
    } catch {
      // Nothing to remove.
    }
    this.save();
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Ignore: the users simply will not persist.
    }
  }
}
