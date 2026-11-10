/**
 * 极简 cheerio 兼容层（基于浏览器 DOMParser）。
 * 只覆盖 MusicFree 插件里常见的 jQuery 风格用法，避免把 cheerio 及其 Node 依赖打进包里。
 */

export class Cheerio {
  constructor(public els: Element[]) {}

  get length() {
    return this.els.length;
  }

  toArray(): Element[] {
    return this.els;
  }

  get(index: number): Element | undefined {
    return this.els[index];
  }

  eq(index: number): Cheerio {
    const i = index < 0 ? this.els.length + index : index;
    return new Cheerio(this.els[i] ? [this.els[i]] : []);
  }

  first(): Cheerio {
    return this.eq(0);
  }

  last(): Cheerio {
    return this.eq(-1);
  }

  text(): string {
    return this.els.map((e) => e.textContent ?? '').join('');
  }

  html(): string {
    if (this.els.length === 0) return '';
    return this.els.map((e) => e.innerHTML).join('');
  }

  attr(name: string): string | undefined {
    const v = this.els[0]?.getAttribute(name);
    return v === null ? undefined : v;
  }

  attrAll(name: string): (string | undefined)[] {
    return this.els.map((e) => e.getAttribute(name) ?? undefined);
  }

  find(selector: string): Cheerio {
    const out: Element[] = [];
    for (const el of this.els) {
      try {
        out.push(...Array.from(el.querySelectorAll(selector)));
      } catch {
        /* 忽略非法选择器 */
      }
    }
    return new Cheerio(out);
  }

  children(selector?: string): Cheerio {
    const out: Element[] = [];
    for (const el of this.els) {
      for (const child of Array.from(el.children)) {
        if (!selector || matches(child, selector)) out.push(child);
      }
    }
    return new Cheerio(out);
  }

  parent(): Cheerio {
    const out: Element[] = [];
    for (const el of this.els) {
      if (el.parentElement) out.push(el.parentElement);
    }
    return new Cheerio(out);
  }

  filter(selector: string): Cheerio {
    return new Cheerio(this.els.filter((e) => matches(e, selector)));
  }

  is(selector: string): boolean {
    return this.els.some((e) => matches(e, selector));
  }

  hasClass(name: string): boolean {
    return this.els.some((e) => e.classList.contains(name));
  }

  val(): string {
    const el = this.els[0] as HTMLInputElement | undefined;
    return el?.value ?? '';
  }

  prop(name: string): unknown {
    return (this.els[0] as unknown as Record<string, unknown>)?.[name];
  }

  each(fn: (this: Element, index: number, element: Element) => void): Cheerio {
    this.els.forEach((el, i) => fn.call(el, i, el));
    return this;
  }

  map<T>(fn: (this: Element, index: number, element: Element) => T): T[] {
    return this.els.map((el, i) => fn.call(el, i, el));
  }
}

function matches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

type CheerioApi = ((selector: string | Element | Element[] | null | undefined) => Cheerio) & {
  load: (html: string) => CheerioApi;
  html: (el?: Element) => string;
  root: () => Cheerio;
  _doc?: Document;
};

function buildApi(doc: Document): CheerioApi {
  const api = ((selector: string | Element | Element[] | null | undefined) => {
    if (!selector) return new Cheerio([]);
    if (typeof selector === 'string') {
      if (selector.trim().startsWith('<')) {
        const tpl = doc.createElement('template');
        tpl.innerHTML = selector;
        return new Cheerio(Array.from(tpl.content.children));
      }
      try {
        return new Cheerio(Array.from(doc.querySelectorAll(selector)));
      } catch {
        return new Cheerio([]);
      }
    }
    if (Array.isArray(selector)) return new Cheerio(selector);
    return new Cheerio([selector]);
  }) as CheerioApi;

  api.load = (html: string) => {
    const parser = new DOMParser();
    const next = parser.parseFromString(html, 'text/html');
    return buildApi(next);
  };
  api.html = (el?: Element) => (el ? el.outerHTML : doc.documentElement.outerHTML);
  api.root = () => new Cheerio(doc.documentElement ? [doc.documentElement] : []);
  Object.defineProperty(api, '_doc', { value: doc, enumerable: false });
  return api;
}

let emptyDoc: Document | null = null;
function getEmptyDoc(): Document {
  if (!emptyDoc) emptyDoc = new DOMParser().parseFromString('', 'text/html');
  return emptyDoc;
}

const cheerio = {
  load(html: string) {
    if (typeof DOMParser === 'undefined') {
      // Node 环境（插件自测脚本）下不存在 DOM，返回空文档，避免顶层 require 直接崩
      return buildApi({} as Document);
    }
    const parser = new DOMParser();
    return buildApi(parser.parseFromString(html, 'text/html'));
  },
  html() {
    return '';
  },
  root() {
    return new Cheerio([]);
  },
  _getEmpty() {
    return buildApi(typeof DOMParser === 'undefined' ? ({} as Document) : getEmptyDoc());
  },
};

export default cheerio;
