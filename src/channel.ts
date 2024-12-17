import { Subject } from 'rxjs';

// Channel
// Channel ...
export class Channel<T> extends Subject<T> {
  private static instances: Map<string, Channel<any>> = new Map();

  // create
  // create creates a new Channel instance. If a channel already exists
  // with given name, it will return the existing instance without creating.
  public static create<T>(key: string): Channel<T> {
    const existingChannel = this.instances.get(key);
    if (existingChannel) {
      return existingChannel;
    }
    const newChannel = new Channel<T>(key);
    this.instances.set(key, newChannel);
    newChannel.init();
    return newChannel;
  }

  // randomId
  // randomId generates a reasonably random string id with given length.
  private static randomId(n: number) {
    let id = '';
    while (id.length < n) {
      id += Math.random()
        .toString(16)
        .slice(2);
    }
    return id.slice(0, n);
  }

  // prefix
  // prefix is used to generate random ids for each message send over the channel.
  private prefix: string;

  // counter
  // counter is used to generate random ids for each message send over the channel.
  private counter: number;

  // constructor
  private constructor(public key: string) {
    super();
    this.prefix = Channel.randomId(16);
    this.counter = 0;
    this.handler = this.handler.bind(this);
  }

  // close
  // close ...
  public close() {
    window.removeEventListener('storage', this.handler);
  }

  // next
  // next sets the value on localStorage for given key which
  // will trigger a 'storage' event on listening windows/tabs.
  public next(data: T): void {
    const event = { id: this.nextId(), data };
    const value = JSON.stringify(event);
    try {
      localStorage.setItem(this.key, value);
    } catch (err) {
      console.error(err);
    }
    this.emit(data);
  }

  // init
  // init ...
  private init() {
    window.addEventListener('storage', this.handler);
  }

  // handler
  // handler ...
  private handler(e: StorageEvent) {
    if (e.key !== this.key) {
      return;
    }
    const event = JSON.parse(e.newValue as string);
    this.emit(event.data);
  }

  // emit
  // emit emits the data to all subscribers in this window/tab.
  private emit(data: T): void {
    super.next(data);
  }

  // nextId
  // nextId ...
  private nextId() {
    return this.prefix + ++this.counter;
  }
}