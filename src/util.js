/*
  查找list中是否有符合条件的元素。
*/
export function find(list, f) {
  return list.filter(f)[0];
}

/**
 * 深度拷贝
 * 这个深度拷贝不能实现对 RegExp，Date 对象的拷贝。
 */
export function deepCopy(obj, cache = []) {
  //如果 obj 是 null， 或者不是对象，则直接返回。 可以理解为 null 和 基本信息就直接返回。
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  //如果 obj 的复制对象已经存在，那么就证明遇到环或者是多个属性指向同一个对象了。
  const hit = find(cache, (c) => c.original === obj);
  if (hit) {
    //返回已经拷贝好的对象即可。
    return hit.copy;
  }

  //针对obj是对象和数组，进行初始化。
  const copy = Array.isArray(obj) ? [] : {};
  //将已经拷贝的对象，以及原来的对象存到缓存，用来做深度拷贝中的环以及重复对象的检测。
  cache.push({
    original: obj,
    copy,
  });

  //对象类型 或者 数组类型，就依次递归拷贝对象的属性。
  Object.keys(obj).forEach((key) => {
    copy[key] = deepCopy(obj[key], cache);
  });

  //拷贝生成的结果对象
  return copy;
}

/*
   遍历一个对象，且将参数传回给 fn， 且第一个参数是 object 的 value；第二个参数是 Object 的 key；
 */
export function forEachValue(obj, fn) {
  Object.keys(obj).forEach((key) => fn(obj[key], key));
}

/*
  判断是不是不为 null 的对象类型。
*/
export function isObject(obj) {
  return obj !== null && typeof obj === "object";
}

/**
 * function isPromise(val) 判断 val 是不是个 promise 对象。
 */
export function isPromise(val) {
  return val && typeof val.then === "function";
}

/*
  判断条件是否成立，如果不成立，则报红提示。
*/
export function assert(condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`);
}

/**
 *  暂时没看懂
 *  说是通过闭包环境，来防止 vm 被更新之后，导致原来的 fn，arg 丢失。
 */
export function partial(fn, arg) {
  return function () {
    return fn(arg);
  };
}
