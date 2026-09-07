const version = "2.23.0-beta.1";
const revision = "3b9de2291";
function extend(target, ex) {
  for (const prop in ex) {
    const copy = ex[prop];
    if (Array.isArray(copy)) {
      target[prop] = extend([], copy);
    } else if (copy && typeof copy === "object") {
      target[prop] = extend({}, copy);
    } else {
      target[prop] = copy;
    }
  }
  return target;
}
export {
  extend,
  revision,
  version
};
