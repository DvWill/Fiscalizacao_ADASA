// Data SDK local (localStorage)
window.elementSdk = null;

window.dataSdk = {
  _key: "fiscalizacoes_v1",
  _handler: null,
  _data: [],

  async init(handler) {
    this._handler = handler;
    const raw = localStorage.getItem(this._key);
    let parsed = [];
    try { parsed = raw ? JSON.parse(raw) : []; } catch { parsed = []; }

    this._data = parsed.map((r) => ({
      __backendId: r.__backendId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      ...r
    }));

    this._persist();
    this._notify();
    return { isOk: true };
  },

  _persist() {
    localStorage.setItem(this._key, JSON.stringify(this._data));
  },

  _notify() {
    this._handler?.onDataChanged?.(this._data);
  },

  async create(record) {
    const rec = {
      __backendId: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      ...record
    };
    this._data.push(rec);
    this._persist();
    this._notify();
    return { isOk: true };
  },

  async update(record) {
    const idx = this._data.findIndex((r) => r.__backendId === record.__backendId);
    if (idx === -1) return { isOk: false };
    this._data[idx] = { ...this._data[idx], ...record };
    this._persist();
    this._notify();
    return { isOk: true };
  },

  async delete(record) {
    const before = this._data.length;
    this._data = this._data.filter((r) => r.__backendId !== record.__backendId);
    this._persist();
    this._notify();
    return { isOk: this._data.length !== before };
  }
};