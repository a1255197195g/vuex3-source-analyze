import Module from "./module";
import { assert, forEachValue } from "../util";

/**
 *   rawRootModule 参数就是 Vuex.Store(options) 中的 options 值。
 *
 *   ModuleCollection 实例。在 store 对象上是 store._modules 属性。
 *   {
 *      root: 指向 rawModule 第一层的数据转换成的 Module 实例。
 *   }
 *
 */
export default class ModuleCollection {
  constructor(rawRootModule) {
    //1、[] 表示 path，用于存储命名空间名。
    //2、rawRootModule 就是 new Vuex.Store( options ) 中的 options。
    //3、runtime在初始化过程中默认为false。
    this.register([], rawRootModule, false);
  }

  /*
    1、path 是一个数组，用于存储 祖-父-自己 的key，比如 ["user", "info", "name"];
    2、module 通过 path 提供的 key，在 module._children 中查找子 module。
    3、reduce函数主要实现了从 祖-父-自己 的一个递归查找过程。
  */
  get(path) {
    //module的 __children 是一个 map，是用 namespace 作为key 存储的子 Module 实例。
    return path.reduce((module, key) => {
      return module.getChild(key);
    }, this.root);
  }

  /*
    根据 path 获取命名空间名称namespace。namespace 主要用于将 action，mutation，getter 收集到 store 的key。
    1、如果 module 的 namespace 不为 true，则采用父 module 的命名空间名称。
    2、如果 module 的 namesapce 为 true，则将key作为自己的 namespace名称，然后与父 module 的命名空间名称拼接。
  */
  getNamespace(path) {
    //this.root 是 Module 实例， 不是 rawModule 数据。
    let module = this.root;
    //path 是 rawModule 的属性的 key。
    return path.reduce((namespace, key) => {
      //判断当前的 Module 实例的 _children 中是否有对应 key 的子 module 实例。
      module = module.getChild(key);
      //注意：如果子module不开启命名空间，则为用父module的命名空间作为自己的命名空间。
      //如果子 module 实例开启了命名空间，那么该子module的命名空间就为当前key，与父命名空间key的拼接。
      //比如 /a/b/c/d
      return namespace + (module.namespaced ? key + "/" : "");
    }, "");
  }

  /*
     将先用的 moduleCollection 上的 root module 实例递归更新 action, mutation,getter. 但是不允许添加新的module。

  */
  update(rawRootModule) {
    //调用本文件中另外一个 update 方法。 function update(path, targetModule, newModule)
    update([], this.root, rawRootModule);
  }

  /**
   * path     ： 默认是个空数组。不是空数组的时候，就是祖父子孙逐级的 namespace 数组
   * rawModule： 为 options 值。
   * runtime  ： 是否是运行时
   */
  register(path, rawModule, runtime = true) {
    //如果是开发模式
    if (__DEV__) {
      //检查 rawModule(root module 和 所有 children module 中的 ations,mutations,getters是否是指定的类型)
      assertRawModule(path, rawModule);
    }

    //创建一个 Module。
    /*
    module 实例形式为： {
      _children: {},
      _rawModule: options,
      state: rawModule.state //state 可以是对象或者函数
    }
  */
    //根 rawModule 或者子 rawModule 数据创建对应的 Module 对象。
    const newModule = new Module(rawModule, runtime);
    //如果当前的 path 为空，表示是根 module 实例。
    if (path.length === 0) {
      // moduleCollection 会有一个root属性，只想根 Module 实例。
      // moduleCollection: { root: module }
      this.root = newModule;
    } else {
      //path.slice(0, -1) 获取 “祖先～父级” 的命名空间数组。
      //this.get() 用于获取对应的 Module 实例。
      const parent = this.get(path.slice(0, -1));
      //用子 rawModule 的属性key。作为存储名，存在 parent.__children 中。
      parent.addChild(path[path.length - 1], newModule);
    }

    /*
       rawModule 的数据结构形式:
       let options = {
          actions: {},
          mutations: {},
          getters: {},
          state: {},
          modules: {
            users: {
              namespace: true,
              actions: {},
              mutations: {},
              getters: {},
              state: {},
            },
            books: {
              namespace: true,
              actions: {},
              mutations: {},
              getters: {},
              state: {},
            }
          }
       }
       let store = new Vuex.Store(options)

       最外层的 rawModule 就是 options。
       内层的 rawModule 就是 options.modules,  options.modules.modules ...

    */
    if (rawModule.modules) {
      //
      //1、forEachValue(params) 就是 Object.keys(obj).forEach(key => fn(obj[key], key))
      //2、rawModule.modules 对应下面的 obj。 第二个参数对应 fn。 且fn参数为 （value，key）.
      //       rawChildModule 为 modules 对象中属性的 value。比如 user 指向的对象，books指向的对象。
      //       key 为 modules 对象中属性的 key。比如 user, books.
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        //复制了一个path数组，并且添加了key。子module的遍历时，path数组不是同一个。
        this.register(path.concat(key), rawChildModule, runtime);
      });
    }
  }

  /*
    移除 path 对应的已注册的 module。
  */
  unregister(path) {
    //获取父 module 的 path 路径。  ["user", "info"]
    const parent = this.get(path.slice(0, -1));
    //获取对应 module 的 key 名称。
    const key = path[path.length - 1];
    //判断夫 module 中是否存在该子 module。
    const child = parent.getChild(key);

    //如果找不到对应的 module，且在开发环境，则报警告；且直接退出。
    if (!child) {
      if (__DEV__) {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
            `not registered`
        );
      }
      return;
    }

    //如果 child 没有设置动态属性为 true，则不允许移除。
    if (!child.runtime) {
      return;
    }
    //从父 module 中移除 path 对应的 module。
    parent.removeChild(key);
  }

  /*
    判断 path 对应路径的 module 是否已经存在。
  */
  isRegistered(path) {
    //获取 path 对应路径module 的父 module。
    const parent = this.get(path.slice(0, -1));
    //获取 path 对应路径module 在父 module 中的 key。
    const key = path[path.length - 1];
    //如果父 module 存在。
    if (parent) {
      //则去查询当前 module 是否在父 module 中。
      return parent.hasChild(key);
    }

    //不存在则返回false。
    return false;
  }
}

function update(path, targetModule, newModule) {
  //判断是不是开发环境
  if (__DEV__) {
    //检查 rawModule(root module 和 所有 children module 中的 ations,mutations,getters是否是指定的类型)
    assertRawModule(path, newModule);
  }

  // targetModule 是 this.root，是一个 module 实例。
  // 将 newModule 的 action,mutation,getters,namespaces属性替换掉。
  targetModule.update(newModule);

  //判断 newModule 是否有子 module。
  if (newModule.modules) {
    //遍历子module
    for (const key in newModule.modules) {
      //如果target 如果不存在此 key 的子 module。
      if (!targetModule.getChild(key)) {
        //开发环境尝试报警告，新的module被添加。
        if (__DEV__) {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
              "manual reload is needed"
          );
        }
        //如果旧的module不存在该子module，则不会被添加。
        return;
      }
      //递归的将 newModule 的子孙 module 更新到原来的 rootModule 上。
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      );
    }
  }
}

/* 
   断言 value 是不是一个函数。
*/
const functionAssert = {
  assert: (value) => typeof value === "function",
  expected: "function",
};

/*
   断言 value 是不是一个函数，或者是 value 是个对象，且 value.handler 是个函数。
*/
const objectAssert = {
  assert: (value) =>
    typeof value === "function" ||
    (typeof value === "object" && typeof value.handler === "function"),
  expected: 'function or object with "handler" function',
};

//配合 assertRawModule 判断 getters, mutations. actions 中的属性是不是对应的类型。
const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert,
};

/**
 * 用于判断 RawModule 中的 action,mutation, getters 是否是指定的类型 (functionAssert, functionAssert,objectAssert)
 */
function assertRawModule(path, rawModule) {
  Object.keys(assertTypes).forEach((key) => {
    //判断module中的 getters， mutations，actions 如果不存在，则直接返回。
    if (!rawModule[key]) return;

    const assertOptions = assertTypes[key];
    //Object.keys(obj).forEach(key => fn(obj[key], key))
    //用于判断 getters，mutations 中的属性是否都是函数； actions 中的属性是 函数或者对象。
    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      );
    });
  });
}

//对于 action ,mutation, getters 中属性存在不符合对应类型的，将日志消息存储到buf，实际上没有使用buf内容。
function makeAssertionMessage(path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`;
  if (path.length > 0) {
    buf += ` in module "${path.join(".")}"`;
  }
  buf += ` is ${JSON.stringify(value)}.`;
  return buf;
}
