/**
 * Fusión reversible de un fragmento de settings dentro de un objeto JSON.
 *
 * `apply` agrega el fragmento sin pisar lo que ya existía y devuelve la lista
 * de operaciones que hizo. `revert` usa esa lista para dejar el objeto como
 * estaba: solo quita lo que agregó `apply`, nunca lo que el repo ya tenía.
 *
 * Reglas de fusión:
 * - Objeto: se recorre clave por clave; si no existía se crea (y se anota).
 * - Arreglo: se agregan los elementos que faltan, al final y en orden.
 * - Valor simple: se fija; si había otro valor, se anota para restaurarlo.
 */

/**
 * @typedef {{ op: 'create', path: string[] }
 *   | { op: 'push', path: string[], value: unknown }
 *   | { op: 'set', path: string[], value: unknown, had: boolean, previous?: unknown }} Operation
 */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {Record<string, unknown>} root
 * @param {string[]} path
 * @returns {Record<string, unknown> | undefined} el objeto en `path`, si existe.
 */
const lookup = (root, path) => {
  let node = root;
  for (const key of path) {
    if (!isObject(node) || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
};

/**
 * Fusiona `fragment` dentro de `target` (lo modifica).
 *
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} fragment
 * @returns {Operation[]} lo que se cambió, en orden.
 * @throws {Error} si una clave del fragmento choca con un tipo distinto en el target.
 */
export const apply = (target, fragment) => {
  /** @type {Operation[]} */
  const operations = [];

  const walk = (node, part, path) => {
    for (const [key, value] of Object.entries(part)) {
      const here = [...path, key];
      const current = node[key];
      if (isObject(value)) {
        if (current === undefined) {
          node[key] = {};
          operations.push({ op: 'create', path: here });
        } else if (!isObject(current)) {
          throw new Error(`"${here.join('.')}" ya existe y no es un objeto.`);
        }
        walk(node[key], value, here);
      } else if (Array.isArray(value)) {
        if (current === undefined) {
          node[key] = [];
          operations.push({ op: 'create', path: here });
        } else if (!Array.isArray(current)) {
          throw new Error(`"${here.join('.')}" ya existe y no es una lista.`);
        }
        for (const item of value) {
          if (node[key].some((existing) => same(existing, item))) continue;
          node[key].push(item);
          operations.push({ op: 'push', path: here, value: item });
        }
      } else if (!same(current, value)) {
        operations.push(
          current === undefined
            ? { op: 'set', path: here, value, had: false }
            : { op: 'set', path: here, value, had: true, previous: current },
        );
        node[key] = value;
      }
    }
  };

  walk(target, fragment, []);
  return operations;
};

/**
 * Deshace las operaciones de `apply` sobre `target` (lo modifica).
 *
 * Lo que el usuario cambió después a mano se respeta: si un valor ya no es el
 * que se fijó, o un elemento ya no está, se deja como está.
 *
 * @param {Record<string, unknown>} target
 * @param {Operation[]} operations
 */
export const revert = (target, operations) => {
  for (const operation of [...operations].reverse()) {
    const parent = lookup(target, operation.path.slice(0, -1));
    const key = operation.path.at(-1);
    if (!isObject(parent) || !(key in parent)) continue;

    if (operation.op === 'push') {
      const list = parent[key];
      if (!Array.isArray(list)) continue;
      const index = list.findIndex((item) => same(item, operation.value));
      if (index !== -1) list.splice(index, 1);
    } else if (operation.op === 'set') {
      if (!same(parent[key], operation.value)) continue;
      if (operation.had) parent[key] = operation.previous;
      else delete parent[key];
    } else if (operation.op === 'create') {
      const value = parent[key];
      const empty = Array.isArray(value) ? value.length === 0 : isObject(value) && Object.keys(value).length === 0;
      if (empty) delete parent[key];
    }
  }
};

/**
 * ¿Está todo el fragmento presente en `target`?
 *
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} fragment
 * @returns {string[]} las rutas que faltan o tienen otro valor (vacío si está todo).
 */
export const missing = (target, fragment) => {
  const copy = structuredClone(target);
  return apply(copy, fragment)
    .filter((operation) => operation.op !== 'create')
    .map((operation) =>
      operation.op === 'push' ? `${operation.path.join('.')} → ${JSON.stringify(operation.value)}` : operation.path.join('.'),
    );
};
