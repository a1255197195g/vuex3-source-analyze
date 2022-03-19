import { forEachValue } from "../util";

// Base data struct for store's module, package with some attribute and method
export default class Module {
  /**
   * rawModule 就是 {
   *  actions: {},
   *  state: {},
   *  mutations: {},
   *  getters: {},
   *  modules: {
   *      users: {
   *          namespace: true,
   *          actions: {},
   *          state: {},
   *          mutations: {},
   *          getters: {}
   *      },
   *      books: {
   *      `namespace: true,
   *        ...
   *      }
   *  }
   * }
   */

  /*
    module 实例形式为： {
      //context 是在 store.js 中的 installModule 创建的。
      context: {
        dispatch: xxx, //能找到当前 module 中 action 的 dispatch。
        commit: xxx,   //能找到当前 module 中 mutation 的 commit。
        getters: xxx,  //获取当前 module 中的 getters。
        state: xxxx    //获取当前 module 中的 state/
      }
      _children: {
         xxxx 
      },
      _rawModule: options,
      state: rawModule.state //state 可以是对象或者函数
    }
  */
  constructor(rawModule, runtime) {
    this.runtime = runtime;

    this._children = Object.create(null);
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule;
    const rawState = rawModule.state;

    // Store the origin module's state
    this.state = (typeof rawState === "function" ? rawState() : rawState) || {};
  }

  /*
    判断是否开启命名空间
  */
  get namespaced() {
    return !!this._rawModule.namespaced;
  }

  /*
    将 options.modules 中的 value 转化为 Module 实例，并存储在 _children 映射中。
  */
  addChild(key, module) {
    this._children[key] = module;
  }

  /*
     通过 key 将子 Module 实例移除。
  */
  removeChild(key) {
    delete this._children[key];
  }

  /* 
     通过 key 获取子 Module 实例。
  */
  getChild(key) {
    return this._children[key];
  }

  /*
     判断是否有 key 名称的命名空间的 Module 实例。
  */
  hasChild(key) {
    //_children 是个 Map 实例。即 _children = {}.
    return key in this._children;
  }

  /*
    更新当前 Module 实例的数据。
   */
  update(rawModule) {
    //替换命名空间属性。
    this._rawModule.namespaced = rawModule.namespaced;
    //替换掉 actions。
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions;
    }
    //替换掉 mutations。
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations;
    }
    //替换掉 getters。
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters;
    }
    //并没有 state。
  }

  forEachChild(fn) {
    //forEachValue 对应为 Object.keys(obj).forEach(key => fn(obj[key], key))
    //this._children 对应 this._children
    //fn 就是 ( children_value, children_key )=>{ xxxx }
    forEachValue(this._children, fn);
  }

  /**
   * 遍历 rawModule 中的 getters 遍历。 从外传入的函数将得到遍历 getters 中所有的属性。
   * 第一个回传给 fn 的参数为  getters 中属性的 value。
   * 第二个回传给 fn 的参数为  getters 中属性的 key。
   */
  forEachGetter(fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn);
    }
  }

  /**
   * 遍历 rawModule 中的 actions 遍历。 从外传入的函数将得到遍历 actions 中所有的属性。
   * ==> 第一个回传给 fn 的参数为  actions 中属性的 value。
   * ==> 第二个回传给 fn 的参数为  actions 中属性的 key。
   * 其中 action 可以是个对象或者函数。
   * actions: {
   *  updateUserName(){
   *    xxxxx
   *  },
   *  updateUserInfo: {
   *    root: true,
   *    handler: function(){ ... }
   *  }
   * }
   */
  forEachAction(fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn);
    }
  }

  /**
   * 遍历 rawModule 中的 mutations 遍历。 从外传入的函数将得到遍历 mutations 中所有的属性。
   * 第一个回传给 fn 的参数为  mutations 中属性的 value。
   * 第二个回传给 fn 的参数为  mutations 中属性的 key。
   */
  forEachMutation(fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn);
    }
  }
}
